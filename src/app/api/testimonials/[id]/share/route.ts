import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/testimonials/[id]/share
 * Increments the share count by 1.
 *
 * Body: (none)
 * Returns: { shareCount: number }
 *
 * PUBLIC: Anyone — including anonymous visitors — can share a testimonial.
 * This endpoint does NOT track WHO shared; it just bumps the counter so
 * the UI can show "shared N times". The client is expected to perform
 * the actual share (Web Share API, copy link, open social, etc.) and
 * call this endpoint as a side-effect.
 *
 * To prevent counter abuse, the rate is implicitly bounded by the fact
 * that shares only fire from a real user gesture (button click) in the
 * browser. A misbehaving client could inflate the number, but this is
 * display-only and has no security or billing impact.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const t = await db.testimonial.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Don't bump shares for hidden testimonials (would leak their existence).
  if (t.hidden) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.testimonial.update({
    where: { id },
    data: { shareCount: t.shareCount + 1 },
    select: { shareCount: true },
  });
  return NextResponse.json({ shareCount: updated.shareCount });
}
