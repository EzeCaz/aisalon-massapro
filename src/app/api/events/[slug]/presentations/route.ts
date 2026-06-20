import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put } from "@vercel/blob";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/events/[slug]/presentations
 * Multipart upload. Form fields:
 *   - files: File[] (one or more presentation files)
 *   - title (optional, applied to all files in this request)
 *   - description (optional, applied to all files in this request)
 *   - speakerIds: JSON-encoded string of string[] (optional, links files to presenters)
 *   - agendaItemId: string (optional, links files to a specific agenda item/session)
 *
 * Uploads files to Vercel Blob at
 * `events/<eventId>/presentations/<timestamp>-<rand>.<ext>`.
 *
 * IMPORTANT: On Vercel's serverless filesystem, public/ is READ-ONLY at
 * runtime — we MUST use Vercel Blob (or another object storage provider)
 * for file uploads. See Task ID 10 in worklog.md for the same migration
 * that was done for image uploads.
 *
 * Accepted MIME types: PDF, PPT, PPTX, Keynote, ODP, DOC/DOCX, plain
 * text, Markdown, and common image formats (for slide exports / handouts
 * shared as images). We deliberately accept a wider set than the photos
 * uploader because presentations come in many formats.
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    // Most common cause: the multipart body exceeded Vercel's 4.5 MB
    // serverless function body limit. See /images route for details.
    console.error("[upload-presentation] req.formData() failed:", err);
    return NextResponse.json(
      {
        error:
          "Upload failed — the total request body was too large (Vercel limits each request to ~4.5 MB). " +
          "Please upload fewer files at once, or upload them one at a time.",
      },
      { status: 413 }
    );
  }
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const title = (formData.get("title") as string | null)?.trim() || null;
  const description = (formData.get("description") as string | null)?.trim() || null;
  const speakerIdsRaw = formData.get("speakerIds") as string | null;
  const agendaItemId = (formData.get("agendaItemId") as string | null)?.trim() || null;

  let speakerIds: string[] = [];
  if (speakerIdsRaw) {
    try {
      const parsed = JSON.parse(speakerIdsRaw);
      if (Array.isArray(parsed)) {
        speakerIds = parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
      }
    } catch {
      // ignore malformed JSON — treat as no speakers selected
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Validate MIME types — accept a generous list of presentation & document
  // formats. We also fall back to accepting unknown types if the filename
  // extension is on our allow-list (some browsers report "application/octet-stream"
  // for .pptx / .key, which is misleading).
  const allowedMime = [
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.presentation",
    "application/vnd.apple.keynote",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/zip", // .key is sometimes a zip
    // image formats — for slide exports / handouts shared as images
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/avif",
  ];
  const allowedExt = [
    "pdf", "ppt", "pptx", "key", "odp", "doc", "docx", "odt",
    "txt", "md", "csv", "rtf",
    "jpg", "jpeg", "png", "webp", "gif", "heic", "avif",
  ];

  for (const f of files) {
    const ext = safeFileExtension(f.name, f.type, "");
    if (!allowedMime.includes(f.type) && !allowedExt.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${f.name} (${f.type || ext})` },
        { status: 400 }
      );
    }
  }

  // Validate that the speakerIds belong to this event
  if (speakerIds.length > 0) {
    const validSpeakers = await db.speaker.findMany({
      where: { id: { in: speakerIds }, eventId: event.id },
      select: { id: true },
    });
    if (validSpeakers.length !== speakerIds.length) {
      return NextResponse.json(
        { error: "One or more speaker IDs are invalid for this event" },
        { status: 400 }
      );
    }
  }

  // Validate that the agendaItemId belongs to this event (if provided)
  if (agendaItemId) {
    const agItem = await db.eventAgendaItem.findFirst({
      where: { id: agendaItemId, eventId: event.id },
      select: { id: true },
    });
    if (!agItem) {
      return NextResponse.json(
        { error: "Agenda item not found for this event" },
        { status: 400 }
      );
    }
  }

  type CreatedFile = {
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  };

  const created: CreatedFile[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    // Use the safe extension (handles non-ASCII filenames that have no
    // extension — the old code would fail Vercel Blob's pathname regex
    // for files like "תמונה" or "מצגת").
    const ext = safeFileExtension(file.name, file.type, "bin");
    const blobName = safeBlobPathname(
      "events",
      event.id,
      "presentations",
      uniqueBlobFilename(ext)
    );

    try {
      const blob = await put(blobName, buf, {
        access: "public",
        contentType: file.type || "application/octet-stream",
        addRandomSuffix: false,
      });

      created.push({
        fileName: file.name,
        fileUrl: blob.url,
        fileSize: buf.length,
        mimeType: file.type || "application/octet-stream",
      });
    } catch (err) {
      console.error("[upload-presentation] Vercel Blob put failed:", err);
      return NextResponse.json(
        {
          error: `Failed to upload ${file.name}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
        { status: 500 }
      );
    }
  }

  // Insert DB rows
  type CreatedRecord = Awaited<ReturnType<typeof db.presentationFile.create>>;
  const createdRecords: CreatedRecord[] = [];
  for (const c of created) {
    const rec = await db.presentationFile.create({
      data: {
        eventId: event.id,
        uploaderId: user.id,
        fileName: c.fileName,
        fileUrl: c.fileUrl,
        fileSize: c.fileSize,
        mimeType: c.mimeType,
        title: title,
        description: description,
        agendaItemId: agendaItemId || null,
        speakers: speakerIds.length > 0
          ? { connect: speakerIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        uploader: { select: { id: true, name: true, email: true } },
        speakers: { select: { id: true, name: true, role: true, company: true } },
        agendaItem: { select: { id: true, title: true, startsAt: true, type: true } },
      },
    });
    createdRecords.push(rec);
  }

  return NextResponse.json({ presentations: createdRecords, count: createdRecords.length });
}

/**
 * GET /api/events/[slug]/presentations
 * Returns all presentation files for the event, ordered by createdAt desc
 * (newest first). Includes uploader, linked speakers, and linked agenda
 * item for each file.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const presentations = await db.presentationFile.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "asc" },
    include: {
      uploader: { select: { id: true, name: true, email: true } },
      speakers: { select: { id: true, name: true, role: true, company: true } },
      agendaItem: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          type: true,
          speakerId: true,
        },
      },
    },
  });

  return NextResponse.json({ presentations });
}
