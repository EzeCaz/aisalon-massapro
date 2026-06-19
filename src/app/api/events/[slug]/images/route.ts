import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

/**
 * POST /api/events/[slug]/images
 * Multipart upload. Form fields:
 *   - files: File[] (one or more image files)
 *   - caption (optional, applied to all images in this request)
 *
 * Saves files to /public/uploads/events/<eventId>/<cuid>.<ext>
 * Creates EventImage records with slideOrder = max+1, ...
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const caption = formData.get("caption") as string | null;

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Validate image MIME types
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/avif"];
  for (const f of files) {
    if (!allowed.includes(f.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${f.name} (${f.type})` },
        { status: 400 }
      );
    }
  }

  // Ensure upload dir exists
  const uploadDir = path.join(process.cwd(), "public", "uploads", "events", event.id);
  await fs.mkdir(uploadDir, { recursive: true });

  // Compute starting slideOrder
  const maxOrder = await db.eventImage.aggregate({
    where: { eventId: event.id },
    _max: { slideOrder: true },
  });
  let nextOrder = (maxOrder._max.slideOrder ?? -1) + 1;

  const created = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const absPath = path.join(uploadDir, fileName);

    // Read file buffer
    const buf = Buffer.from(await file.arrayBuffer());

    // Use sharp to get dimensions and (optionally) normalize to JPEG for size.
    let width: number | null = null;
    let height: number | null = null;
    let savedSize = buf.length;
    let savedMime = file.type;
    try {
      const meta = await sharp(buf).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      // Re-encode large photos to JPEG for storage efficiency (max 2200px)
      if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") {
        const normalized = await sharp(buf)
          .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 86, mozjpeg: true })
          .toBuffer();
        await fs.writeFile(absPath.replace(/\.[^.]+$/, ".jpg"), normalized);
        // Update filename + size + mime
        const newName = fileName.replace(/\.[^.]+$/, ".jpg");
        created.push({
          fileName: file.name,
          fileUrl: `/uploads/events/${event.id}/${newName}`,
          fileSize: normalized.length,
          width,
          height,
          mimeType: "image/jpeg",
        });
        savedSize = normalized.length;
        savedMime = "image/jpeg";
        // remove the old absPath reference if changed
        continue;
      }
    } catch (err) {
      console.warn("[upload] sharp metadata failed:", err);
    }

    // Fallback: write original file as-is
    await fs.writeFile(absPath, buf);
    created.push({
      fileName: file.name,
      fileUrl: `/uploads/events/${event.id}/${fileName}`,
      fileSize: savedSize,
      width,
      height,
      mimeType: savedMime,
    });
  }

  // Insert DB rows
  const images = [];
  for (const c of created) {
    const img = await db.eventImage.create({
      data: {
        eventId: event.id,
        uploaderId: user.id,
        fileName: c.fileName,
        fileUrl: c.fileUrl,
        fileSize: c.fileSize,
        width: c.width,
        height: c.height,
        mimeType: c.mimeType,
        caption: caption || null,
        slideOrder: nextOrder++,
      },
    });
    images.push(img);
  }

  return NextResponse.json({ images, count: images.length });
}

/**
 * GET /api/events/[slug]/images
 * Returns all images for the event, ordered by slideOrder.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const images = await db.eventImage.findMany({
    where: { eventId: event.id },
    orderBy: { slideOrder: "asc" },
    include: {
      uploader: { select: { id: true, name: true, email: true, image: true } },
      speakers: { select: { id: true, name: true, role: true, company: true } },
    },
  });
  return NextResponse.json({ images });
}
