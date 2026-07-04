import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { safeFileExtension } from "@/lib/blob-paths";

/**
 * POST /api/events/[slug]/presentations/register
 *
 * After the browser has used `@vercel/blob/client`'s `upload()` helper
 * to push the file directly to Vercel Blob (using a client token from
 * /client-upload), it calls this endpoint to create the DB row that
 * references the uploaded blob.
 *
 * Body: {
 *   fileName: string,           // original filename, e.g. "AI-CMO-Blueprint.pdf"
 *   fileUrl: string,            // blob.url returned by upload()
 *   fileSize: number,           // blob.size (or file.size)
 *   mimeType: string,           // the file's MIME type
 *   pathname: string,           // the blob pathname we used (for our records)
 *   title?: string,             // optional display title
 *   description?: string,       // optional description
 *   speakerIds?: string[],      // optional — link to presenters
 *   agendaItemId?: string,      // optional — link to a session
 * }
 *
 * Admin/membership: any logged-in member can register an upload they
 * just made (same gate as the old POST route).
 *
 * SECURITY NOTE: we do NOT trust the client's `fileUrl` blindly — we
 * verify it points to a Vercel Blob hostname. We also re-validate the
 * speakerIds / agendaItemId against this event.
 */
const ALLOWED_MIME = new Set([
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
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/avif",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — must match /client-upload

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const body = await req.json();
  const {
    fileName,
    fileUrl,
    fileSize,
    mimeType,
    pathname,
    title,
    description,
    speakerIds,
    agendaItemId,
  } = body as {
    fileName?: string;
    fileUrl?: string;
    fileSize?: number;
    mimeType?: string;
    pathname?: string;
    title?: string | null;
    description?: string | null;
    speakerIds?: string[];
    agendaItemId?: string | null;
  };

  // ---- Validate required fields ----
  if (!fileName || typeof fileName !== "string" || !fileName.trim()) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }
  if (!fileUrl || typeof fileUrl !== "string" || !fileUrl.startsWith("https://")) {
    return NextResponse.json({ error: "fileUrl must be a valid https URL" }, { status: 400 });
  }
  // Vercel Blob URLs look like https://<store>.public.blob.vercel-storage.com/...
  // We accept any vercel-storage.com or vercel-blob.com hostname; reject obviously foreign URLs.
  let urlHost = "";
  try {
    urlHost = new URL(fileUrl).hostname;
  } catch {
    return NextResponse.json({ error: "fileUrl is not a valid URL" }, { status: 400 });
  }
  if (!/(vercel-storage\.com|vercel-blob\.com)$/.test(urlHost)) {
    return NextResponse.json(
      { error: `fileUrl must point to Vercel Blob (got ${urlHost})` },
      { status: 400 }
    );
  }

  const size = typeof fileSize === "number" && fileSize >= 0 ? fileSize : 0;
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File is too large (${size} bytes > ${MAX_BYTES} bytes / 10 MB)` },
      { status: 413 }
    );
  }

  const mime = typeof mimeType === "string" && mimeType ? mimeType : "application/octet-stream";
  // Allow the extension-based fallback for octet-stream (some browsers
  // report .pptx / .key as octet-stream). The actual content-type was
  // already enforced at the Blob layer via allowedContentTypes.
  const ext = safeFileExtension(fileName, mime, "bin");
  if (!ALLOWED_MIME.has(mime) && mime !== "application/octet-stream") {
    return NextResponse.json(
      { error: `Unsupported MIME type: ${mime}` },
      { status: 400 }
    );
  }

  // ---- Validate speakerIds belong to this event ----
  let validSpeakerIds: string[] = [];
  if (Array.isArray(speakerIds) && speakerIds.length > 0) {
    const clean = speakerIds.filter(
      (s): s is string => typeof s === "string" && s.length > 0
    );
    if (clean.length > 0) {
      const valid = await db.speaker.findMany({
        where: { id: { in: clean }, eventId: event.id },
        select: { id: true },
      });
      validSpeakerIds = valid.map((s) => s.id);
      if (validSpeakerIds.length !== clean.length) {
        return NextResponse.json(
          { error: "One or more speakerIds are invalid for this event" },
          { status: 400 }
        );
      }
    }
  }

  // ---- Validate agendaItemId belongs to this event ----
  let resolvedAgendaItemId: string | null = null;
  if (agendaItemId && typeof agendaItemId === "string") {
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
    resolvedAgendaItemId = agItem.id;
  }

  const record = await db.presentationFile.create({
    data: {
      eventId: event.id,
      uploaderId: user.id,
      fileName: fileName.trim(),
      fileUrl,
      fileSize: size,
      mimeType: mime,
      title: typeof title === "string" ? title.trim() || null : null,
      description: typeof description === "string" ? description.trim() || null : null,
      agendaItemId: resolvedAgendaItemId,
      speakers:
        validSpeakerIds.length > 0
          ? { connect: validSpeakerIds.map((id) => ({ id })) }
          : undefined,
    },
    include: {
      uploader: { select: { id: true, name: true, email: true } },
      speakers: { select: { id: true, name: true, role: true, company: true } },
      agendaItem: { select: { id: true, title: true, startsAt: true, type: true } },
    },
  });

  return NextResponse.json({ presentation: record });
}
