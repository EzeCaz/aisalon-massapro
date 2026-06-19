import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/events/[slug]
 * Returns the event with speakers, agenda, and image count.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    include: {
      speakers: { orderBy: { order: "asc" } },
      agenda: {
        orderBy: { startsAt: "asc" },
        include: { speaker: true },
      },
      _count: { select: { images: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ event });
}
