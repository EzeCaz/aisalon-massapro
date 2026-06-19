import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put, del } from "@vercel/blob";
import sharp from "sharp";

/**
 * POST /api/profile/photo
 * Multipart upload. Form field: `file` (single image)
 *
 * Uploads the profile photo to Vercel Blob at `profiles/<userId>/<cuid>.webp`.
 * Resizes to a square 512x512 (cover) for consistent avatar rendering.
 * Sets `photoUrl` on the user (overrides Google `image` when present).
 *
 * On Vercel's serverless filesystem, public/ is READ-ONLY at runtime —
 * we MUST use Vercel Blob for photo uploads. The old
 * /public/uploads/profiles/... approach failed with EROFS/EACCES.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/avif"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Use JPG, PNG, WebP, or GIF.` },
      { status: 400 }
    );
  }

  // 8 MB max
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Normalize to 512x512 WebP (square, cover crop) — small, efficient, square avatar.
  let outBuf: Buffer;
  try {
    outBuf = await sharp(buf)
      .rotate() // apply EXIF orientation
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (err) {
    console.error("[profile/photo] sharp error:", err);
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }

  const blobName = `profiles/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  let newUrl: string;
  try {
    const blob = await put(blobName, outBuf, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    });
    newUrl = blob.url;
  } catch (err) {
    console.error("[profile/photo] Vercel Blob put failed:", err);
    return NextResponse.json(
      { error: `Failed to upload photo: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // Delete the previous photo (if it was a Blob URL — legacy /uploads/... paths
  // are silently skipped since they don't exist on Vercel's serverless fs).
  if (me.photoUrl?.startsWith("https://")) {
    try {
      await del(me.photoUrl);
    } catch {
      /* ignore — old file may already be gone */
    }
  }

  const updated = await db.user.update({
    where: { id: me.id },
    data: { photoUrl: newUrl },
  });

  return NextResponse.json({ photoUrl: updated.photoUrl });
}

/**
 * DELETE /api/profile/photo
 * Removes the user's uploaded photo (falls back to Google `image` if any).
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Only delete if it's a Vercel Blob URL
  if (me.photoUrl?.startsWith("https://")) {
    try {
      await del(me.photoUrl);
    } catch {
      /* ignore */
    }
  }

  await db.user.update({
    where: { id: me.id },
    data: { photoUrl: null },
  });

  return NextResponse.json({ ok: true });
}
