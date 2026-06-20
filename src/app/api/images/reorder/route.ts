import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/images/reorder
 * Body: { eventSlug: string, orderedIds: string[] }
 * Reassigns slideOrder on each image so they appear in the given order.
 * Any logged-in member can reorder (community-curated slideshow).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { eventSlug, orderedIds } = (await req.json()) as {
    eventSlug: string;
    orderedIds: string[];
  };
  if (!eventSlug || !Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "eventSlug and orderedIds required" }, { status: 400 });
  }

  const event = await db.event.findUnique({ where: { slug: eventSlug } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  await db.$transaction(
    orderedIds.map((id, idx) =>
      db.eventImage.update({
        where: { id },
        data: { slideOrder: idx },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
