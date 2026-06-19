import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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
  const { eventId, name, role, company, bio, topic, photoUrl } = body as {
    eventId?: string;
    name?: string;
    role?: string;
    company?: string;
    bio?: string;
    topic?: string;
    photoUrl?: string;
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

  const speaker = await db.speaker.create({
    data: {
      eventId,
      name: name.trim(),
      role: role?.trim() || null,
      company: company?.trim() || null,
      bio: bio?.trim() || null,
      topic: topic?.trim() || null,
      photoUrl: photoUrl?.trim() || null,
      order: nextOrder,
    },
  });

  return NextResponse.json({ speaker });
}
