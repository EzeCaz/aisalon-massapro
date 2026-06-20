import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/events
 * Returns all events, newest first.
 */
export async function GET() {
  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: { select: { images: true, speakers: true } },
    },
  });
  return NextResponse.json({ events });
}
