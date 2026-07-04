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
 * This endpoint does NOT track WHO shared — it just bumps the counter
 * so the UI can show "shared N times". The client is expected to perform
 * the actual share (Web Share API, copy link, open social, etc.) and
 * call this endpoint as a side-effect.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { id } = await params;
  const t = await db.testimonial.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.testimonial.update({
    where: { id },
    data: { shareCount: t.shareCount + 1 },
    select: { shareCount: true },
  });
  return NextResponse.json({ shareCount: updated.shareCount });
}
