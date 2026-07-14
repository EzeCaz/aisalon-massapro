import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put } from "@vercel/blob";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";
import { requireEventAgendaEdit, isError } from "@/lib/auth-guards";

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
const ALLOWED_TYPES = ["TALK", "FAST_PITCH", "WELCOME", "BREAK", "NETWORKING", "PANEL"];

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
  // First parse the form data so we can read eventId for the scope check
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
  if (!eventId) {
    return NextResponse.json(
      { error: "eventId is required" },
      { status: 400 }
    );
  }

  // Permission check — admins can edit any event; CO_HOST users can
  // edit only events they're explicitly co-hosting.
  const me = await requireEventAgendaEdit(eventId);
  if (isError(me)) return me;
  const title = (formData.get("title") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const sessionUrl = (formData.get("sessionUrl") as string | null)?.trim() || null;
  const type = (formData.get("type") as string | null)?.trim() || "FAST_PITCH";
  const startsAt = formData.get("startsAt") as string | null;
  const endsAt = (formData.get("endsAt") as string | null)?.trim() || null;
  const speakerId = (formData.get("speakerId") as string | null)?.trim() || null;
  const newSpeakerRaw = formData.get("newSpeaker") as string | null;

  // Panel-specific fields (only used when type === "PANEL")
  const panelistIdsRaw = formData.get("panelistIds") as string | null;
  const newPanelistsRaw = formData.get("newPanelists") as string | null;

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
    let parsed: { name?: string; role?: string; company?: string; bio?: string; topic?: string; photoUrl?: string; contactEmail?: string };
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

    // Normalize the contact email — lowercase + trim. We'll attempt to
    // auto-link this speaker to a platform User with the same email so
    // members can chat with the speaker via the in-app ConversationMessage
    // system (two-way). If no matching user exists yet, the link is left
    // null and members fall back to the one-way SpeakerMessage flow.
    const contactEmail = parsed.contactEmail?.trim().toLowerCase() || null;
    let linkedUserId: string | null = null;
    if (contactEmail) {
      const linkedUser = await db.user.findUnique({
        where: { email: contactEmail },
        select: { id: true },
      });
      if (linkedUser) linkedUserId = linkedUser.id;
    }

    const sp = await db.speaker.create({
      data: {
        eventId,
        name: parsed.name.trim(),
        role: parsed.role?.trim() || null,
        company: parsed.company?.trim() || null,
        bio: parsed.bio?.trim() || null,
        topic: parsed.topic?.trim() || null,
        photoUrl: parsed.photoUrl?.trim() || null,
        contactEmail,
        userId: linkedUserId,
        order: nextOrder,
      },
    });
    resolvedSpeakerId = sp.id;
    createdSpeaker = { id: sp.id, name: sp.name };
  }

  // ---------- Panel validation + panelist resolution ----------
  // For PANEL items, the admin must provide at least 1 panelist (either
  // an existing speaker from the roster or a brand-new panelist typed
  // inline). The moderator is separate (speakerId above) and is optional.
  let panelistIds: string[] = [];
  let newPanelists: Array<{
    name: string;
    role?: string;
    company?: string;
    bio?: string;
    topic?: string;
    contactEmail?: string;
  }> = [];

  if (panelistIdsRaw) {
    try {
      const parsed = JSON.parse(panelistIdsRaw);
      if (Array.isArray(parsed)) {
        panelistIds = parsed
          .map((s) => (typeof s === "string" ? s.trim() : ""))
          .filter((s) => s.length > 0);
      }
    } catch {
      return NextResponse.json(
        { error: "panelistIds must be a JSON array of strings" },
        { status: 400 }
      );
    }
  }
  if (newPanelistsRaw) {
    try {
      const parsed = JSON.parse(newPanelistsRaw);
      if (Array.isArray(parsed)) {
        newPanelists = parsed
          .filter((p): p is Record<string, unknown> =>
            !!p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string"
          )
          .map((p) => ({
            name: ((p.name as string) || "").trim(),
            role: typeof p.role === "string" ? p.role.trim() : undefined,
            company: typeof p.company === "string" ? p.company.trim() : undefined,
            bio: typeof p.bio === "string" ? p.bio.trim() : undefined,
            topic: typeof p.topic === "string" ? p.topic.trim() : undefined,
            contactEmail: typeof p.contactEmail === "string" ? p.contactEmail.trim() : undefined,
          }))
          .filter((p) => p.name.length > 0);
      }
    } catch {
      return NextResponse.json(
        { error: "newPanelists must be a JSON array of objects" },
        { status: 400 }
      );
    }
  }

  if (type === "PANEL" && panelistIds.length === 0 && newPanelists.length === 0) {
    return NextResponse.json(
      { error: "Panel agenda items require at least 1 panelist" },
      { status: 400 }
    );
  }

  // ---------- Create the agenda item ----------
  const agendaItem = await db.eventAgendaItem.create({
    data: {
      eventId,
      title,
      description,
      sessionUrl,
      type,
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      speakerId: resolvedSpeakerId,
    },
    include: {
      speaker: { select: { id: true, name: true, role: true, company: true } },
    },
  });

  // ---------- Attach panelists (PANEL only) ----------
  // Two passes:
  //   (a) Existing speakers from the roster. If they belong to THIS event,
  //       attach directly. If they belong to ANOTHER event, auto-clone them
  //       into this event first (so the panelist now appears on this event's
  //       roster too — matching the V3.7 "auto-cloned on save" behaviour).
  //   (b) Brand-new panelists typed inline in the dialog → create as
  //       Speaker rows on this event, with the same contactEmail → User
  //       auto-link logic as the lead speaker flow.
  const createdPanelists: Array<{ id: string; name: string }> = [];
  const finalPanelistIds: string[] = [];

  if (type === "PANEL") {
    // (a) Resolve existing speakers (with cross-event auto-clone)
    if (panelistIds.length > 0) {
      const picked = await db.speaker.findMany({
        where: { id: { in: panelistIds } },
        include: { event: { select: { id: true } } },
      });
      const maxOrderRow = await db.speaker.aggregate({
        where: { eventId },
        _max: { order: true },
      });
      let nextOrder = (maxOrderRow._max.order ?? -1) + 1;

      for (const sp of picked) {
        if (sp.event.id === eventId) {
          // Already on this event — attach directly
          finalPanelistIds.push(sp.id);
        } else {
          // Cross-event speaker — clone into this event
          const clone = await db.speaker.create({
            data: {
              eventId,
              name: sp.name,
              role: sp.role,
              company: sp.company,
              bio: sp.bio,
              topic: sp.topic,
              photoUrl: sp.photoUrl,
              contactEmail: sp.contactEmail,
              userId: sp.userId,
              order: nextOrder++,
            },
          });
          finalPanelistIds.push(clone.id);
          createdPanelists.push({ id: clone.id, name: clone.name });
        }
      }
    }

    // (b) Create brand-new panelists typed inline
    if (newPanelists.length > 0) {
      const maxOrderRow = await db.speaker.aggregate({
        where: { eventId },
        _max: { order: true },
      });
      let nextOrder = (maxOrderRow._max.order ?? -1) + 1;

      for (const np of newPanelists) {
        const contactEmail = np.contactEmail?.trim().toLowerCase() || null;
        let linkedUserId: string | null = null;
        if (contactEmail) {
          const linkedUser = await db.user.findUnique({
            where: { email: contactEmail },
            select: { id: true },
          });
          if (linkedUser) linkedUserId = linkedUser.id;
        }
        const sp = await db.speaker.create({
          data: {
            eventId,
            name: np.name.trim(),
            role: np.role?.trim() || null,
            company: np.company?.trim() || null,
            bio: np.bio?.trim() || null,
            topic: np.topic?.trim() || null,
            contactEmail,
            userId: linkedUserId,
            order: nextOrder++,
          },
        });
        finalPanelistIds.push(sp.id);
        createdPanelists.push({ id: sp.id, name: sp.name });
      }
    }

    if (finalPanelistIds.length > 0) {
      await db.eventAgendaItem.update({
        where: { id: agendaItem.id },
        data: {
          panelists: { connect: finalPanelistIds.map((id) => ({ id })) },
        },
      });
    }
  }

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
    panelists: createdPanelists,
  });
}

/**
 * GET /api/admin/agenda?eventId=...
 * Returns the full agenda for an event (with descriptions), for admin
 * editing. Includes linked speaker + count of presentation files per item.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // Permission check — admins can view any event's agenda; CO_HOST
  // users can view only their own events.
  const me = await requireEventAgendaEdit(eventId);
  if (isError(me)) return me;

  const items = await db.eventAgendaItem.findMany({
    where: { eventId },
    orderBy: { startsAt: "asc" },
    include: {
      speaker: { select: { id: true, name: true, role: true, company: true, bio: true, topic: true } },
      panelists: {
        select: {
          id: true,
          name: true,
          role: true,
          company: true,
          bio: true,
          topic: true,
          photoUrl: true,
        },
      },
      // Per-item main image (used as fallback when the speaker/panelists
      // have no linked images). Admins pick this in the EditAgendaItemDialog.
      mainImage: {
        select: {
          id: true,
          fileUrl: true,
          fileName: true,
          caption: true,
          slideOrder: true,
        },
      },
      _count: { select: { presentations: true } },
    },
  });

  return NextResponse.json({ items });
}
