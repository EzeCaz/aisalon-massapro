import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

/**
 * POST /api/images/rotate
 * Body: { imageIds: string[], direction: "cw" | "ccw" }
 *
 * Rotates the on-disk JPEG file 90° clockwise (cw) or counter-clockwise
 * (ccw) for each provided image id. Updates width/height in the DB
 * (they swap on each 90° rotation). Re-encodes as JPEG.
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

    const absPath = path.join(process.cwd(), "public", img.fileUrl);
    try {
      const buf = await fs.readFile(absPath);
      // Rotate the image. sharp uses positive angles for CW rotation.
      const out = await sharp(buf)
        .rotate(angle)
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

      // Re-write to the same path (overwrite). Always JPEG.
      const newPath = absPath.replace(/\.[^.]+$/, ".jpg");
      const newUrl = img.fileUrl.replace(/\.[^.]+$/, ".jpg");
      await fs.writeFile(newPath, out);

      // If the original wasn't .jpg, remove the old file
      if (newPath !== absPath) {
        try {
          await fs.unlink(absPath);
        } catch {
          /* ignore */
        }
      }

      // Get new dimensions (width and height swap on 90° rotation)
      const meta = await sharp(out).metadata();
      await db.eventImage.update({
        where: { id: img.id },
        data: {
          fileUrl: newUrl,
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
