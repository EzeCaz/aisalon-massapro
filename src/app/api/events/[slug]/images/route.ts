import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put } from "@vercel/blob";
import sharp from "sharp";

/**
 * POST /api/events/[slug]/images
 * Multipart upload. Form fields:
 *   - files: File[] (one or more image files)
 *   - caption (optional, applied to all images in this request)
 *
 * Uploads files to Vercel Blob at `events/<eventId>/<cuid>.jpg`.
 * Stores the returned Blob URL in EventImage.fileUrl.
 *
 * IMPORTANT: On Vercel's serverless filesystem, public/ is READ-ONLY at
 * runtime — we MUST use Vercel Blob (or another object storage provider)
 * for image uploads. Writing to public/uploads/... was the old approach
 * and failed with EROFS/EACCES.
 *
 * EXIF: Mobile phones save photos in sensor-native orientation and embed
 * an EXIF orientation tag. Browsers honor this for display but `sharp`
 * does NOT auto-apply it — you have to call `.rotate()` (no argument)
 * explicitly. Without this, photos uploaded from a phone in portrait
 * come out sideways. Here we call `.rotate()` first, then resize/re-encode,
 * so the saved file is always visually upright.
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

  // Compute starting slideOrder
  const maxOrder = await db.eventImage.aggregate({
    where: { eventId: event.id },
    _max: { slideOrder: true },
  });
  let nextOrder = (maxOrder._max.slideOrder ?? -1) + 1;

  type CreatedImage = {
    fileName: string;
    fileUrl: string;
    fileSize: number;
    width: number | null;
    height: number | null;
    mimeType: string;
  };

  const created: CreatedImage[] = [];
  for (const file of files) {
    // Read file buffer
    const buf = Buffer.from(await file.arrayBuffer());

    // Use sharp to apply EXIF orientation, get dimensions, and re-encode.
    let width: number | null = null;
    let height: number | null = null;
    let uploadBuf: Buffer = buf;
    let uploadExt = (file.name.split(".").pop()?.toLowerCase() || "jpg");
    let mimeType = file.type;

    try {
      // .rotate() with no angle auto-applies EXIF orientation
      const rotated = sharp(buf).rotate();
      const meta = await rotated.metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;

      // Re-encode as JPEG for storage efficiency + guaranteed browser support
      uploadBuf = await rotated
        .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();
      uploadExt = "jpg";
      mimeType = "image/jpeg";
    } catch (err) {
      console.warn("[upload] sharp processing failed, uploading original:", err);
      // uploadBuf and uploadExt remain as the original file
    }

    const blobName = `events/${event.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${uploadExt}`;

    try {
      const blob = await put(blobName, uploadBuf, {
        access: "public",
        contentType: mimeType,
        addRandomSuffix: false,
      });

      created.push({
        fileName: file.name,
        fileUrl: blob.url,
        fileSize: uploadBuf.length,
        width,
        height,
        mimeType,
      });
    } catch (err) {
      console.error("[upload] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload ${file.name}: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // Insert DB rows
  const images: Awaited<ReturnType<typeof db.eventImage.create>>[] = [];
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
