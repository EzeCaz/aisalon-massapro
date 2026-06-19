import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

/**
 * POST /api/profile/photo
 * Multipart upload. Form field: `file` (single image)
 *
 * Saves to /public/uploads/profiles/<userId>/<cuid>.<ext>
 * Resizes to a square 512x512 (cover) for consistent avatar rendering.
 * Sets `photoUrl` on the user (overrides Google `image` when present).
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

  const uploadDir = path.join(process.cwd(), "public", "uploads", "profiles", me.id);
  await fs.mkdir(uploadDir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());

  // Normalize to 512x512 WebP (square, cover crop) — small, efficient, square avatar.
  const outName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const outPath = path.join(uploadDir, outName);
  try {
    await sharp(buf)
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toFile(outPath);
  } catch (err) {
    console.error("[profile/photo] sharp error:", err);
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }

  const publicUrl = `/uploads/profiles/${me.id}/${outName}`;

  // Delete the previous photo (if it was a user-uploaded one)
  if (me.photoUrl?.startsWith("/uploads/profiles/")) {
    const oldPath = path.join(process.cwd(), "public", me.photoUrl);
    try {
      await fs.unlink(oldPath);
    } catch {
      /* ignore — old file may already be gone */
    }
  }

  const updated = await db.user.update({
    where: { id: me.id },
    data: { photoUrl: publicUrl },
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

  if (me.photoUrl?.startsWith("/uploads/profiles/")) {
    const oldPath = path.join(process.cwd(), "public", me.photoUrl);
    try {
      await fs.unlink(oldPath);
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
