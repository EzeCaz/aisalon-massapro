import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { del } from "@vercel/blob";

/**
 * GET /api/testimonials/[id]
 * Returns a single testimonial with author info and liked-by-me state.
 */
export async function GET(
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
  const t = await db.testimonial.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          photoUrl: true,
          image: true,
          company: true,
        },
      },
      event: { select: { id: true, title: true, slug: true } },
      speaker: { select: { id: true, name: true, company: true, photoUrl: true } },
      agendaItem: { select: { id: true, title: true } },
      likes: { where: { userId: me.id }, select: { id: true }, take: 1 },
    },
  });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (t.hidden && me.role !== "ADMIN" && t.authorId !== me.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    testimonial: {
      id: t.id,
      body: t.body,
      rating: t.rating,
      imageUrl: t.imageUrl,
      eventDate: t.eventDate.toISOString(),
      featured: t.featured,
      hidden: t.hidden,
      likeCount: t.likeCount,
      shareCount: t.shareCount,
      createdAt: t.createdAt.toISOString(),
      author: t.author,
      event: t.event,
      speaker: t.speaker,
      agendaItem: t.agendaItem,
      likedByMe: t.likes.length > 0,
    },
  });
}

/**
 * PATCH /api/testimonials/[id]
 * Body: { featured?: boolean, hidden?: boolean }
 *
 * Admin-only — toggles the featured / hidden flags.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });
  if (me.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  let body: { featured?: boolean; hidden?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { featured?: boolean; hidden?: boolean } = {};
  if (typeof body.featured === "boolean") data.featured = body.featured;
  if (typeof body.hidden === "boolean") data.hidden = body.hidden;

  const t = await db.testimonial.update({ where: { id }, data });
  return NextResponse.json({
    testimonial: {
      id: t.id,
      featured: t.featured,
      hidden: t.hidden,
    },
  });
}

/**
 * DELETE /api/testimonials/[id]
 * Author OR admin can delete. Also removes the image from Vercel Blob.
 */
export async function DELETE(
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

  if (t.authorId !== me.id && me.role !== "ADMIN") {
    return NextResponse.json(
      { error: "You can only delete your own testimonials." },
      { status: 403 }
    );
  }

  // Best-effort delete the image from Blob storage. Don't fail the
  // request if the blob is already gone or the URL is malformed.
  if (t.imageUrl) {
    try {
      await del(t.imageUrl);
    } catch (err) {
      console.error("[testimonials] blob delete failed:", err);
    }
  }

  await db.testimonial.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
