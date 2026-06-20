import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/speakers
 * Returns all speakers across all events, with their linked event title
 * and (if linked) their user account email. Used by the admin "Link user
 * to speaker" picker.
 *
 * Admin-only.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const speakers = await db.speaker.findMany({
    orderBy: [{ event: { startsAt: "desc" } }, { order: "asc" }],
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ speakers });
}

/**
 * POST /api/admin/speakers
 * Body: {
 *   eventId: string,
 *   name: string,
 *   role?: string,        // e.g. "CEO, Acme"
 *   company?: string,
 *   bio?: string,
 *   topic?: string,       // talk title
 *   photoUrl?: string,    // optional photo URL
 * }
 * Admin-only. Creates a new Speaker row linked to the given event.
 * Used by the "Add fast pitch session" flow when the admin needs to
 * add a speaker that isn't already on the event's roster.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { eventId, name, role, company, bio, topic, photoUrl, contactEmail } = body as {
    eventId?: string;
    name?: string;
    role?: string;
    company?: string;
    bio?: string;
    topic?: string;
    photoUrl?: string;
    contactEmail?: string;
  };

  if (!eventId || !name || !name.trim()) {
    return NextResponse.json(
      { error: "eventId and name are required" },
      { status: 400 }
    );
  }

  // Verify the event exists
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Compute next speaker order
  const maxOrder = await db.speaker.aggregate({
    where: { eventId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  // Normalize the contact email — used to AUTO-LINK the speaker to a
  // platform User with the same email, so members can chat with the
  // speaker in-platform via ConversationMessage (two-way).
  const normalizedEmail = contactEmail?.trim().toLowerCase() || null;
  let linkedUserId: string | null = null;
  if (normalizedEmail) {
    const linkedUser = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (linkedUser) linkedUserId = linkedUser.id;
  }

  const speaker = await db.speaker.create({
    data: {
      eventId,
      name: name.trim(),
      role: role?.trim() || null,
      company: company?.trim() || null,
      bio: bio?.trim() || null,
      topic: topic?.trim() || null,
      photoUrl: photoUrl?.trim() || null,
      contactEmail: normalizedEmail,
      userId: linkedUserId,
      order: nextOrder,
    },
  });

  return NextResponse.json({ speaker });
}
