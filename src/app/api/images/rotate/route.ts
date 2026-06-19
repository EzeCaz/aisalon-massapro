import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put, del } from "@vercel/blob";
import sharp from "sharp";

/**
 * POST /api/images/rotate
 * Body: { imageIds: string[], direction: "cw" | "ccw" }
 *
 * Rotates each image 90° clockwise (cw) or counter-clockwise (ccw).
 * Fetches the image from Vercel Blob, rotates with sharp, re-uploads
 * a new JPEG to Blob, updates the EventImage row with the new URL +
 * swapped width/height, and deletes the old blob.
 *
 * Permission: uploader OR admin can rotate. Bulk mode rotates all
 * images whose ids pass the permission check; ids the caller can't
 * touch are silently skipped (with a count returned).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const isAdmin = user.role === "ADMIN";

  let body: { imageIds?: unknown; direction?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageIds = Array.isArray(body.imageIds) ? (body.imageIds as string[]) : [];
  const direction = body.direction === "cw" || body.direction === "ccw" ? body.direction : null;

  if (imageIds.length === 0) {
    return NextResponse.json({ error: "No image ids provided." }, { status: 400 });
  }
  if (!direction) {
    return NextResponse.json({ error: "direction must be 'cw' or 'ccw'." }, { status: 400 });
  }

  const images = await db.eventImage.findMany({
    where: { id: { in: imageIds } },
  });

  const angle = direction === "cw" ? 90 : -90;
  const rotated: string[] = [];
  const skipped: string[] = [];

  for (const img of images) {
    if (!isAdmin && img.uploaderId !== user.id) {
      skipped.push(img.id);
      continue;
    }

    // Only Vercel Blob URLs (https://) are supported for rotation.
    // Legacy /uploads/... paths from the old filesystem approach can't
    // be rotated server-side on Vercel (read-only filesystem) — skip.
    if (!img.fileUrl.startsWith("https://")) {
      console.warn(`[rotate] skipping ${img.id}: not a blob URL (${img.fileUrl})`);
      skipped.push(img.id);
      continue;
    }

    try {
      // Fetch the current image bytes from Blob
      const resp = await fetch(img.fileUrl);
      if (!resp.ok) throw new Error(`fetch failed: HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());

      // Rotate the image. sharp uses positive angles for CW rotation.
      const out = await sharp(buf)
        .rotate(angle)
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

      // Compute new blob name. The current URL ends with .jpg (we always
      // re-encode as JPEG on upload), so the new path keeps the same
      // directory + basename but uses a "-rot<count>" suffix to avoid
      // any caching issues.
      const url = new URL(img.fileUrl);
      const parts = url.pathname.split("/");
      const oldName = parts[parts.length - 1]; // e.g. 1234-abcd.jpg
      const baseName = oldName.replace(/\.[^.]+$/, "");
      const newName = `${baseName}-rot${Date.now()}.jpg`;
      parts[parts.length - 1] = newName;
      const newBlobPath = parts.join("/"); // e.g. events/<eventId>/<baseName>-rot<ts>.jpg

      // Upload rotated version
      const newBlob = await put(newBlobPath, out, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
      });

      // Get new dimensions (width and height swap on 90° rotation)
      const meta = await sharp(out).metadata();

      // Delete old blob (best-effort)
      try {
        await del(img.fileUrl);
      } catch (e) {
        console.warn(`[rotate] failed to delete old blob for ${img.id}:`, e);
      }

      // Update DB row
      await db.eventImage.update({
        where: { id: img.id },
        data: {
          fileUrl: newBlob.url,
          width: meta.width ?? null,
          height: meta.height ?? null,
          fileSize: out.length,
          mimeType: "image/jpeg",
        },
      });
      rotated.push(img.id);
    } catch (err) {
      console.error(`[rotate] failed for ${img.id}:`, err);
      skipped.push(img.id);
    }
  }

  return NextResponse.json({
    ok: true,
    rotated,
    skipped,
    count: rotated.length,
  });
}
