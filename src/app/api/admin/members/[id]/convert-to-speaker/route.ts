import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/members/[id]/convert-to-speaker
 * Body: {
 *   eventId: string,
 *   topic?: string,        // talk title (optional)
 *   role?: string,         // e.g. "CEO, Acme" (optional; defaults to user.company)
 *   bio?: string,          // optional; defaults to user.bio
 * }
 *
 * Creates a NEW Speaker row linked to the given event + user, and sets
 * `Speaker.userId = id` so the user can chat with community members
 * in-platform via the ConversationMessage system.
 *
 * If a Speaker already exists for this (eventId, userId) pair, returns
 * the existing one rather than creating a duplicate.
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
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    eventId?: string;
    topic?: string;
    role?: string;
    bio?: string;
  };

  if (!body.eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // Verify the event exists
  const event = await db.event.findUnique({
    where: { id: body.eventId },
    select: { id: true, title: true, slug: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Idempotency: if this user is already linked to a speaker on this
  // event, return the existing speaker rather than creating a duplicate.
  // IMPORTANT: include the `event` relation — the admin-members-table
  // client reads `data.speaker.event.title` to build its success toast
  // ("Already a speaker on ${data.speaker.event.title}"). Without this
  // include, the client crashes with
  // "Cannot read properties of undefined (reading 'title')" — exactly the
  // bug reported when adding Eyal Rond as a speaker on The Human AI event
  // (he was already linked).
  const existing = await db.speaker.findFirst({
    where: { eventId: body.eventId, userId: id },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { images: true, presentations: true, messages: true } },
    },
  });
  if (existing) {
    return NextResponse.json({ speaker: existing, created: false });
  }

  // Compute next speaker order
  const maxOrder = await db.speaker.aggregate({
    where: { eventId: body.eventId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const speaker = await db.speaker.create({
    data: {
      eventId: body.eventId,
      name: target.name || target.email.split("@")[0],
      role: body.role?.trim() || target.company || null,
      company: target.company || null,
      bio: body.bio?.trim() || target.bio || null,
      topic: body.topic?.trim() || null,
      photoUrl: target.photoUrl || target.image || null,
      contactEmail: target.email,
      userId: id,
      order: nextOrder,
    },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { images: true, presentations: true, messages: true } },
    },
  });

  return NextResponse.json({ speaker, created: true });
}
