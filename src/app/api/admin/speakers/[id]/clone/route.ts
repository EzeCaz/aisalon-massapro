import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/admin/speakers/[id]/clone
 *
 * Clone an existing Speaker to ANOTHER event. The new Speaker row
 * inherits name/role/company/bio/topic/photoUrl/contactEmail/userId
 * from the source. Useful when the same person is speaking at
 * multiple events — keeps a single "logical person" represented as
 * multiple Speaker rows (one per event) connected via contactEmail.
 *
 * Body: { targetEventId: string }
 *
 * Returns the new Speaker row.
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

  const { id } = await params;
  const source = await db.speaker.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  const body = await req.json();
  const { targetEventId } = body as { targetEventId?: string };
  if (!targetEventId) {
    return NextResponse.json({ error: "targetEventId is required" }, { status: 400 });
  }

  const targetEvent = await db.event.findUnique({
    where: { id: targetEventId },
    select: { id: true, title: true },
  });
  if (!targetEvent) {
    return NextResponse.json({ error: "Target event not found" }, { status: 404 });
  }

  if (targetEventId === source.eventId) {
    return NextResponse.json(
      { error: "Target event is the same as the source event" },
      { status: 400 }
    );
  }

  // Next order slot on the target event
  const maxOrder = await db.speaker.aggregate({
    where: { eventId: targetEventId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const cloned = await db.speaker.create({
    data: {
      eventId: targetEventId,
      name: source.name,
      role: source.role,
      company: source.company,
      bio: source.bio,
      topic: source.topic,
      photoUrl: source.photoUrl,
      contactEmail: source.contactEmail,
      userId: source.userId,
      order: nextOrder,
    },
    include: {
      event: { select: { id: true, title: true, slug: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ speaker: cloned });
}
