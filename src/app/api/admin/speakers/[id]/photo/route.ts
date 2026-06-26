import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin, ROLES } from "@/lib/permissions";
import { safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/admin/speakers/[id]/photo
 *
 * Admin-only: upload a profile photo for any speaker. The photo is stored
 * at `speaker-photos/<speakerId>/<cuid>.webp` (Vercel Blob in production,
 * local filesystem in the sandbox). The speaker's `photoUrl` is updated.
 *
 * This is the speaker-table analog of /api/admin/members/[id]/photo.
 * Speakers have their own `photoUrl` column (separate from any linked User's
 * photoUrl) so that the speaker's photo on the event roster / mockups can
 * differ from their member-account photo if desired.
 *
 * Multipart form data:
 *   - file: single image (JPG/PNG/WebP/GIF/HEIC/AVIF, max 8 MB)
 *
 * Permission: ADMIN + SUPER_ADMIN.
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

  const isAdmin =
    me.role === ROLES.ADMIN ||
    me.role === ROLES.SUPER_ADMIN ||
    isSuperAdmin({ email: me.email, role: me.role });
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only admins can upload speaker photos." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const target = await db.speaker.findUnique({
    where: { id },
    select: { id: true, name: true, photoUrl: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
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

  // Square 512x512 WebP — same as the member photo route, so a speaker
  // headshot renders consistently whether shown as a circle on the event
  // roster or as a square card on the mockup canvas.
  let outBuf: Buffer;
  try {
    outBuf = await sharp(buf)
      .rotate()
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (err) {
    console.error("[admin/speakers/[id]/photo] sharp error:", err);
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }

  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  const filename = uniqueBlobFilename(".webp");
  let newUrl: string;

  if (hasBlob) {
    const pathname = safeBlobPathname(`speaker-photos/${target.id}`, filename);
    try {
      const blob = await put(pathname, outBuf, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      });
      newUrl = blob.url;
    } catch (err) {
      console.error("[admin/speakers/[id]/photo] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload photo: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  } else {
    const localDir = path.join(process.cwd(), "public", "uploads", "speaker-photos", target.id);
    try {
      await fs.mkdir(localDir, { recursive: true });
      const fullPath = path.join(localDir, filename);
      await fs.writeFile(fullPath, outBuf);
      newUrl = `/uploads/speaker-photos/${target.id}/${encodeURIComponent(filename)}`;
    } catch (err) {
      console.error("[admin/speakers/[id]/photo] local write failed:", err);
      return NextResponse.json(
        { error: `Failed to upload photo locally: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  }

  // Delete the previous photo if it was a Blob URL.
  if (target.photoUrl?.startsWith("https://") && hasBlob) {
    try {
      await del(target.photoUrl);
    } catch {
      /* ignore */
    }
  }

  const updated = await db.speaker.update({
    where: { id },
    data: { photoUrl: newUrl },
    select: { id: true, photoUrl: true },
  });

  return NextResponse.json({ photoUrl: updated.photoUrl });
}

/**
 * DELETE /api/admin/speakers/[id]/photo
 * Removes the speaker's photo (clears the field).
 * ADMIN + SUPER_ADMIN only.
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
      { error: "Only admins can delete speaker photos." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const target = await db.speaker.findUnique({
    where: { id },
    select: { id: true, photoUrl: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  if (target.photoUrl?.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(target.photoUrl);
    } catch {
      /* ignore */
    }
  }

  await db.speaker.update({
    where: { id },
    data: { photoUrl: null },
  });

  return NextResponse.json({ ok: true });
}
