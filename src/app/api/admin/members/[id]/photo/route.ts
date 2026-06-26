import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/admin/members/[id]/photo
 *
 * Admin-only: upload a profile photo for any member. The photo is stored
 * at `profiles/<memberId>/<cuid>.webp` (Vercel Blob in production, local
 * filesystem in the sandbox). The member's `photoUrl` is set to the new
 * URL — overrides Google `image` when present.
 *
 * This endpoint mirrors /api/profile/photo but is invoked by an ADMIN or
 * SUPER_ADMIN on behalf of another user (vs. the user uploading their own).
 *
 * Multipart form data:
 *   - file: single image (JPG/PNG/WebP/GIF/HEIC/AVIF, max 8 MB)
 *
 * Permission:
 *   - ADMIN and SUPER_ADMIN can upload a photo for any non-Super-Admin member.
 *   - Only SUPER_ADMIN can upload a photo for another Super Admin.
 *   - A Super Admin can upload their own photo (same as /api/profile/photo).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  // ADMIN + SUPER_ADMIN gate. CO_HOST and MEMBER cannot use this endpoint.
  const isAdmin =
    me.role === ROLES.ADMIN ||
    me.role === ROLES.SUPER_ADMIN ||
    isSuperAdmin({ email: me.email, role: me.role });
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only admins can upload member photos." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, photoUrl: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Only Super Admins can edit another Super Admin's photo.
  const targetIsSuperAdmin = isSuperAdminEmail(target.email);
  if (targetIsSuperAdmin && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only a Super Admin can edit another Super Admin's photo." },
      { status: 403 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowed = [
    "image/jpeg", "image/jpg", "image/png",
    "image/webp", "image/gif",
    "image/heic", "image/heif", "image/avif",
  ];
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Use JPG, PNG, WebP, GIF, or HEIC.` },
      { status: 400 },
    );
  }

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
    console.error("[admin/members/[id]/photo] sharp error:", err);
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }

  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  const ext = ".webp";
  const filename = uniqueBlobFilename(ext);
  let newUrl: string;

  if (hasBlob) {
    const pathname = safeBlobPathname(`profiles/${target.id}`, filename);
    try {
      const blob = await put(pathname, outBuf, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      });
      newUrl = blob.url;
    } catch (err) {
      console.error("[admin/members/[id]/photo] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload photo: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  } else {
    // Sandbox fallback: write to /public/uploads/profiles/<memberId>/
    const localDir = path.join(process.cwd(), "public", "uploads", "profiles", target.id);
    try {
      await fs.mkdir(localDir, { recursive: true });
      const fullPath = path.join(localDir, filename);
      await fs.writeFile(fullPath, outBuf);
      newUrl = `/uploads/profiles/${target.id}/${encodeURIComponent(filename)}`;
    } catch (err) {
      console.error("[admin/members/[id]/photo] local write failed:", err);
      return NextResponse.json(
        { error: `Failed to upload photo locally: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  }

  // Delete the previous photo (if it was a Blob URL — legacy /uploads/... paths
  // are silently skipped since they don't exist on Vercel's serverless fs).
  if (target.photoUrl?.startsWith("https://") && hasBlob) {
    try {
      await del(target.photoUrl);
    } catch {
      /* ignore — old file may already be gone */
    }
  }

  const updated = await db.user.update({
    where: { id },
    data: { photoUrl: newUrl },
    select: { id: true, photoUrl: true },
  });

  return NextResponse.json({ photoUrl: updated.photoUrl });
}

/**
 * DELETE /api/admin/members/[id]/photo
 *
 * Removes the member's uploaded photo (falls back to Google `image` if any).
 * Same permission rules as POST.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const isAdmin =
    me.role === ROLES.ADMIN ||
    me.role === ROLES.SUPER_ADMIN ||
    isSuperAdmin({ email: me.email, role: me.role });
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only admins can delete member photos." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, photoUrl: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const targetIsSuperAdmin = isSuperAdminEmail(target.email);
  if (targetIsSuperAdmin && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only a Super Admin can delete another Super Admin's photo." },
      { status: 403 },
    );
  }

  if (target.photoUrl?.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(target.photoUrl);
    } catch {
      /* ignore */
    }
  }

  await db.user.update({
    where: { id },
    data: { photoUrl: null },
  });

  return NextResponse.json({ ok: true });
}
