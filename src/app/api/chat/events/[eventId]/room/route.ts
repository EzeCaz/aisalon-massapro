import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/chat/events/[eventId]/room
 * ------------------------------------
 * Get-or-create the ChatRoom for an event, then add the current user
 * as a member (if they're not already). Returns the room + membership
 * info so the client can immediately connect to the WS room.
 *
 * Membership rules:
 *   - Any user with an EventRsvp{status=GOING, userId != null} is
 *     auto-added.
 *   - Event co-hosts (EventCoHost) are auto-added with role="HOST".
 *   - Speakers with a linked userId are auto-added.
 *   - Admins (SUPER_ADMIN, ADMIN) can always join.
 *   - The first time the endpoint is called for an event, the room is
 *     created with type="EVENT", title=event.title, and ALL current
 *     eligible members are bulk-inserted in one transaction.
 *
 * Subsequent calls just ensure the caller is a member (idempotent).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      photoUrl: true,
      image: true,
    },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const { eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      coHosts: { select: { userId: true } },
      speakers: { select: { userId: true } },
      rsvps: {
        where: { status: "GOING", userId: { not: null } },
        select: { userId: true },
      },
    },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Build the set of eligible userIds (admins bypass this check).
  // "Hosts" = co-hosts (there's no single hostId on Event — co-hosts
  // are the canonical host list).
  const eligible = new Set<string>();
  for (const r of event.rsvps) if (r.userId) eligible.add(r.userId);
  for (const c of event.coHosts) eligible.add(c.userId);
  for (const s of event.speakers) if (s.userId) eligible.add(s.userId);

  const isAdmin =
    me.role === "SUPER_ADMIN" || me.role === "ADMIN";
  const isEligible = eligible.has(me.id);
  if (!isAdmin && !isEligible) {
    return NextResponse.json(
      {
        error:
          "You must be RSVP'd as GOING to this event (or be a co-host / speaker) to join the chat.",
      },
      { status: 403 },
    );
  }

  // Get-or-create the room in a transaction.
  const room = await db.$transaction(async (tx) => {
    // 1. If a ChatRoom already exists for this event, fetch it.
    let chatRoom = await tx.chatRoom.findFirst({
      where: { eventId: event.id },
      include: {
        members: {
          select: {
            userId: true,
            role: true,
            lastReadAt: true,
            leftAt: true,
            user: {
              select: {
                id: true,
                name: true,
                photoUrl: true,
                image: true,
                company: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!chatRoom) {
      // 2. Create the room + bulk-insert every eligible member.
      chatRoom = await tx.chatRoom.create({
        data: {
          type: "EVENT",
          eventId: event.id,
          title: event.title,
          createdById: me.id,
          members: {
            create: Array.from(eligible).map((uid) => ({
              userId: uid,
              role: event.coHosts.some((c) => c.userId === uid)
                ? "HOST"
                : "MEMBER",
            })),
          },
        },
        include: {
          members: {
            select: {
              userId: true,
              role: true,
              lastReadAt: true,
              leftAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  photoUrl: true,
                  image: true,
                  company: true,
                  role: true,
                },
              },
            },
          },
        },
      });
    } else {
      // 3. Room already exists — ensure the caller is a member. If
      //    they were a member but had `leftAt` set, un-leave them.
      const existing = chatRoom.members.find((m) => m.userId === me.id);
      if (!existing) {
        await tx.chatRoomMember.create({
          data: {
            roomId: chatRoom.id,
            userId: me.id,
            role: event.coHosts.some((c) => c.userId === me.id)
              ? "HOST"
              : "MEMBER",
          },
        });
        // Refetch members so the response includes the new member.
        chatRoom = await tx.chatRoom.findUnique({
          where: { id: chatRoom.id },
          include: {
            members: {
              select: {
                userId: true,
                role: true,
                lastReadAt: true,
                leftAt: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    photoUrl: true,
                    image: true,
                    company: true,
                    role: true,
                  },
                },
              },
            },
          },
        });
      } else if (existing.leftAt) {
        // They had previously left — un-leave them so they see new
        // messages again.
        await tx.chatRoomMember.update({
          where: {
            roomId_userId: { roomId: chatRoom.id, userId: me.id },
          },
          data: { leftAt: null },
        });
      }
    }
    return chatRoom;
  });

  if (!room) {
    return NextResponse.json(
      { error: "Failed to create or fetch room" },
      { status: 500 },
    );
  }

  // Compute the caller's lastReadAt + unread count for the room header.
  const myMembership = room.members.find((m) => m.userId === me.id);
  const unreadCount = await db.chatMessage.count({
    where: {
      roomId: room.id,
      createdAt: myMembership?.lastReadAt
        ? { gt: myMembership.lastReadAt }
        : undefined,
      senderId: { not: me.id },
      deletedAt: null,
    },
  });

  return NextResponse.json({
    room: {
      id: room.id,
      type: room.type,
      eventId: room.eventId,
      title: room.title,
      description: room.description,
      createdAt: room.createdAt.toISOString(),
      members: room.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        lastReadAt: m.lastReadAt ? m.lastReadAt.toISOString() : null,
        leftAt: m.leftAt ? m.leftAt.toISOString() : null,
        name: m.user.name,
        photoUrl: m.user.photoUrl,
        image: m.user.image,
        company: m.user.company,
        siteRole: m.user.role,
      })),
      myMembership: myMembership
        ? {
            role: myMembership.role,
            lastReadAt: myMembership.lastReadAt
              ? myMembership.lastReadAt.toISOString()
              : null,
          }
        : null,
      unreadCount,
    },
  });
}
