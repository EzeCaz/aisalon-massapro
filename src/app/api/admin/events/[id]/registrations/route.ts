import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/events/[id]/registrations
 *
 * Returns all registrations for an event, split into three groups:
 *   - members:    existing Users registered via EventRegistration
 *   - nonMembers: NonMembers registered via NonMemberRegistration,
 *                 including their duplicate status
 *   - duplicates: subset of nonMembers where duplicateStatus === "pending"
 *
 * Admin-only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, title: true } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Existing members registered for this event
  const memberRegs = await db.eventRegistration.findMany({
    where: { eventId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          mobile: true,
          linkedinUrl: true,
          createdAt: true,
          photoUrl: true,
          image: true,
          tags: { select: { label: true, color: true } },
        },
      },
    },
    orderBy: { registeredAt: "desc" },
  });

  // Non-members registered for this event
  const nonMemberRegs = await db.nonMemberRegistration.findMany({
    where: { eventId },
    include: {
      nonMember: {
        include: {
          duplicateOf: {
            select: {
              id: true,
              email: true,
              name: true,
              company: true,
              mobile: true,
              linkedinUrl: true,
              createdAt: true,
              image: true,
              photoUrl: true,
              tags: { select: { label: true, color: true } },
            },
          },
        },
      },
    },
    orderBy: { registeredAt: "desc" },
  });

  return NextResponse.json({
    event: { id: event.id, title: event.title },
    members: memberRegs.map((r) => ({
      registrationId: r.id,
      registeredAt: r.registeredAt.toISOString(),
      source: r.source,
      importName: r.importName,
      importCompany: r.importCompany,
      user: r.user,
    })),
    nonMembers: nonMemberRegs.map((r) => ({
      registrationId: r.id,
      registeredAt: r.registeredAt.toISOString(),
      source: r.source,
      nonMember: {
        id: r.nonMember.id,
        email: r.nonMember.email,
        name: r.nonMember.name,
        company: r.nonMember.company,
        mobile: r.nonMember.mobile,
        linkedinUrl: r.nonMember.linkedinUrl,
        bio: r.nonMember.bio,
        importSource: r.nonMember.importSource,
        duplicateStatus: r.nonMember.duplicateStatus,
        duplicateReason: r.nonMember.duplicateReason,
        createdAt: r.nonMember.createdAt.toISOString(),
        duplicateOf: r.nonMember.duplicateOf
          ? {
              id: r.nonMember.duplicateOf.id,
              email: r.nonMember.duplicateOf.email,
              name: r.nonMember.duplicateOf.name,
              company: r.nonMember.duplicateOf.company,
              mobile: r.nonMember.duplicateOf.mobile,
              linkedinUrl: r.nonMember.duplicateOf.linkedinUrl,
              createdAt: r.nonMember.duplicateOf.createdAt.toISOString(),
              image: r.nonMember.duplicateOf.photoUrl ?? r.nonMember.duplicateOf.image,
              tags: r.nonMember.duplicateOf.tags,
            }
          : null,
      },
    })),
  });
}

/**
 * DELETE /api/admin/events/[id]/registrations?userId=<id>|nonMemberId=<id>
 *
 * Removes a registration. Pass either ?userId=... to unregister an
 * existing member, or ?nonMemberId=... to unregister a non-member.
 * Does NOT delete the User or NonMember — only the registration row.
 *
 * Admin-only.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const nonMemberId = url.searchParams.get("nonMemberId");

  if (userId) {
    await db.eventRegistration.deleteMany({ where: { userId, eventId } });
    return NextResponse.json({ ok: true, removed: "user", userId, eventId });
  }
  if (nonMemberId) {
    await db.nonMemberRegistration.deleteMany({ where: { nonMemberId, eventId } });
    return NextResponse.json({ ok: true, removed: "nonMember", nonMemberId, eventId });
  }
  return NextResponse.json({ error: "Pass ?userId= or ?nonMemberId= query param" }, { status: 400 });
}

/**
 * POST /api/admin/events/[id]/registrations
 *
 * Manually register an existing User for this event. Body:
 *   { userId: string }
 * Useful when an admin wants to register a member who RSVP'd verbally
 * without going through the spreadsheet upload flow.
 *
 * Admin-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const { userId } = body as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "Missing userId in body" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, company: true } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const reg = await db.eventRegistration.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId, source: "manual", importName: user.name, importCompany: user.company },
    update: {},
  });

  return NextResponse.json({ registration: reg });
}
