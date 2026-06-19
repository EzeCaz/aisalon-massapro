import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { del } from "@vercel/blob";

/**
 * PATCH /api/images/[id]
 * Body: { caption?, speakerIds?, slideOrder? }
 * Updates an image's caption, linked speakers, or slideshow order.
 * Uploader OR admin can edit.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { id } = await params;
  const image = await db.eventImage.findUnique({ where: { id } });
  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const isAdmin = user.role === "ADMIN";
  const isOwner = image.uploaderId === user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { caption, speakerIds, slideOrder } = body as {
    caption?: string;
    speakerIds?: string[];
    slideOrder?: number;
  };

  const data: Record<string, unknown> = {};
  if (typeof caption === "string") data.caption = caption.trim() || null;
  if (typeof slideOrder === "number") data.slideOrder = slideOrder;
  if (Array.isArray(speakerIds)) {
    data.speakers = { set: speakerIds.map((id) => ({ id })) };
  }

  const updated = await db.eventImage.update({
    where: { id },
    data,
    include: {
      speakers: { select: { id: true, name: true, role: true, company: true } },
    },
  });
  return NextResponse.json({ image: updated });
}

/**
 * DELETE /api/images/[id]
 * Removes image (DB record + blob in Vercel Blob storage).
 * Uploader OR admin can delete.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { id } = await params;
  const image = await db.eventImage.findUnique({ where: { id } });
  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const isAdmin = user.role === "ADMIN";
  const isOwner = image.uploaderId === user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete blob (best-effort) — only if it's a Vercel Blob URL (https://).
  // Legacy /uploads/... paths from the old filesystem approach can't be
  // deleted via the Blob API and are silently skipped (they don't exist
  // on Vercel's serverless filesystem anyway).
  if (image.fileUrl.startsWith("https://")) {
    try {
      await del(image.fileUrl);
    } catch (e) {
      console.warn("[delete-image] blob removal failed:", e);
    }
  }

  await db.eventImage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
