import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put } from "@vercel/blob";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/admin/agenda
 * Multipart form (because we may upload a presentation file alongside).
 *
 * Form fields:
 *   - eventId: string
 *   - title: string              — agenda item title (e.g. "Acme AI — Fraud detection")
 *   - description?: string       — longer description
 *   - type: string               — "TALK" | "FAST_PITCH" | "WELCOME" | "BREAK" | "NETWORKING"
 *   - startsAt: string           — ISO datetime
 *   - endsAt?: string            — ISO datetime
 *   - speakerId?: string         — ID of existing speaker (mutually exclusive with newSpeaker)
 *   - newSpeaker?: JSON string   — { name, role?, company?, bio?, topic?, photoUrl? } — creates a new speaker on the fly
 *
 *   - file?: File                — optional presentation file to attach
 *   - fileTitle?: string         — display title for the uploaded file
 *   - fileDescription?: string   — description for the uploaded file
 *
 * Admin-only.
 *
 * Returns: { agendaItem, speaker (if created), presentation (if uploaded) }
 */
const ALLOWED_TYPES = ["TALK", "FAST_PITCH", "WELCOME", "BREAK", "NETWORKING"];

const ALLOWED_MIME = [
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
];
const ALLOWED_EXT = [
  "pdf", "ppt", "pptx", "key", "odp", "doc", "docx", "odt",
  "txt", "md", "csv", "rtf",
  "jpg", "jpeg", "png", "webp", "gif", "heic", "avif",
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    // Most common cause: the multipart body exceeded Vercel's 4.5 MB
    // serverless function body limit. See /images route for details.
    console.error("[admin/agenda] req.formData() failed:", err);
    return NextResponse.json(
      {
        error:
          "Upload failed — the total request body was too large (Vercel limits each request to ~4.5 MB). " +
          "Please use a smaller presentation file (under ~4 MB).",
      },
      { status: 413 }
    );
  }
  const eventId = (formData.get("eventId") as string | null)?.trim();
  const title = (formData.get("title") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const type = (formData.get("type") as string | null)?.trim() || "FAST_PITCH";
  const startsAt = formData.get("startsAt") as string | null;
  const endsAt = (formData.get("endsAt") as string | null)?.trim() || null;
  const speakerId = (formData.get("speakerId") as string | null)?.trim() || null;
  const newSpeakerRaw = formData.get("newSpeaker") as string | null;

  const file = formData.get("file");
  const fileTitle = (formData.get("fileTitle") as string | null)?.trim() || null;
  const fileDescription = (formData.get("fileDescription") as string | null)?.trim() || null;

  // ---------- Validate ----------
  if (!eventId || !title || !startsAt) {
    return NextResponse.json(
      { error: "eventId, title, and startsAt are required" },
      { status: 400 }
    );
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Validate the start/end times fall within the event window (best-effort,
  // not a hard requirement — admin may extend agenda beyond the main
  // event window for side-sessions).
  const startsAtDate = new Date(startsAt);
  if (isNaN(startsAtDate.getTime())) {
    return NextResponse.json({ error: "Invalid startsAt" }, { status: 400 });
  }
  let endsAtDate: Date | null = null;
  if (endsAt) {
    endsAtDate = new Date(endsAt);
    if (isNaN(endsAtDate.getTime())) {
      return NextResponse.json({ error: "Invalid endsAt" }, { status: 400 });
    }
  }

  // Speaker resolution
  let resolvedSpeakerId: string | null = null;
  let createdSpeaker: { id: string; name: string } | null = null;

  if (speakerId) {
    // Verify the speaker belongs to this event
    const sp = await db.speaker.findFirst({
      where: { id: speakerId, eventId },
      select: { id: true, name: true },
    });
    if (!sp) {
      return NextResponse.json(
        { error: "Speaker not found for this event" },
        { status: 400 }
      );
    }
    resolvedSpeakerId = sp.id;
  } else if (newSpeakerRaw) {
    // Create a new speaker on the fly
    let parsed: { name?: string; role?: string; company?: string; bio?: string; topic?: string; photoUrl?: string };
    try {
      parsed = JSON.parse(newSpeakerRaw);
    } catch {
      return NextResponse.json(
        { error: "newSpeaker must be valid JSON" },
        { status: 400 }
      );
    }
    if (!parsed.name || !parsed.name.trim()) {
      return NextResponse.json(
        { error: "newSpeaker.name is required" },
        { status: 400 }
      );
    }
    const maxOrder = await db.speaker.aggregate({
      where: { eventId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    const sp = await db.speaker.create({
      data: {
        eventId,
        name: parsed.name.trim(),
        role: parsed.role?.trim() || null,
        company: parsed.company?.trim() || null,
        bio: parsed.bio?.trim() || null,
        topic: parsed.topic?.trim() || null,
        photoUrl: parsed.photoUrl?.trim() || null,
        order: nextOrder,
      },
    });
    resolvedSpeakerId = sp.id;
    createdSpeaker = { id: sp.id, name: sp.name };
  }

  // ---------- Create the agenda item ----------
  const agendaItem = await db.eventAgendaItem.create({
    data: {
      eventId,
      title,
      description,
      type,
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      speakerId: resolvedSpeakerId,
    },
    include: {
      speaker: { select: { id: true, name: true, role: true, company: true } },
    },
  });

  // ---------- Optional: upload the presentation file ----------
  let createdPresentation: { id: string; fileName: string; fileUrl: string } | null = null;
  if (file instanceof File) {
    const ext = safeFileExtension(file.name, file.type, "");
    if (!ALLOWED_MIME.includes(file.type) && !ALLOWED_EXT.includes(ext)) {
      // Don't fail the whole request — the agenda item was already created.
      // Just skip the file upload and report a warning in the response.
      console.warn("[admin/agenda] Skipping unsupported file:", file.name, file.type);
    } else {
      const buf = Buffer.from(await file.arrayBuffer());
      const blobName = safeBlobPathname(
        "events",
        eventId,
        "presentations",
        uniqueBlobFilename(ext || "bin")
      );
      try {
        const blob = await put(blobName, buf, {
          access: "public",
          contentType: file.type || "application/octet-stream",
          addRandomSuffix: false,
        });
        const pres = await db.presentationFile.create({
          data: {
            eventId,
            uploaderId: me.id,
            fileName: file.name,
            fileUrl: blob.url,
            fileSize: buf.length,
            mimeType: file.type || "application/octet-stream",
            title: fileTitle,
            description: fileDescription,
            agendaItemId: agendaItem.id,
            speakers: resolvedSpeakerId
              ? { connect: [{ id: resolvedSpeakerId }] }
              : undefined,
          },
        });
        createdPresentation = {
          id: pres.id,
          fileName: pres.fileName,
          fileUrl: pres.fileUrl,
        };
      } catch (err) {
        console.error("[admin/agenda] presentation upload failed:", err);
        // Again, don't fail the whole request — the agenda item is already saved.
      }
    }
  }

  return NextResponse.json({
    agendaItem,
    speaker: createdSpeaker,
    presentation: createdPresentation,
  });
}

/**
 * GET /api/admin/agenda?eventId=...
 * Returns the full agenda for an event (with descriptions), for admin
 * editing. Includes linked speaker + count of presentation files per item.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const items = await db.eventAgendaItem.findMany({
    where: { eventId },
    orderBy: { startsAt: "asc" },
    include: {
      speaker: { select: { id: true, name: true, role: true, company: true, bio: true, topic: true } },
      _count: { select: { presentations: true } },
    },
  });

  return NextResponse.json({ items });
}
