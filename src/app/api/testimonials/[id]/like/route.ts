import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/testimonials/[id]/like
 * Toggles the like state for the signed-in user.
 *
 * Body: (none)
 * Returns: { liked: boolean, likeCount: number }
 *
 * Idempotent: if the user already liked, the like is REMOVED (toggle off).
 * If they hadn't, a TestimonialLike row is created and the parent's
 * likeCount is incremented atomically.
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

  const existing = await db.testimonialLike.findUnique({
    where: { userId_testimonialId: { userId: me.id, testimonialId: id } },
  });

  if (existing) {
    // Unlike
    await db.testimonialLike.delete({ where: { id: existing.id } });
    const updated = await db.testimonial.update({
      where: { id },
      data: { likeCount: Math.max(0, t.likeCount - 1) },
      select: { likeCount: true },
    });
    return NextResponse.json({ liked: false, likeCount: updated.likeCount });
  }

  // Like
  await db.testimonialLike.create({
    data: { userId: me.id, testimonialId: id },
  });
  const updated = await db.testimonial.update({
    where: { id },
    data: { likeCount: t.likeCount + 1 },
    select: { likeCount: true },
  });
  return NextResponse.json({ liked: true, likeCount: updated.likeCount });
}
