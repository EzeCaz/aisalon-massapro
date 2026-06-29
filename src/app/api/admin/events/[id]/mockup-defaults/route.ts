import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { put } from "@vercel/blob";

/**
 * GET /api/admin/events/[id]/mockup-defaults
 *
 * Returns all saved mockup defaults for an event.
 *
 * Response:
 *   { defaults: Array<{ id, type, dataJson, imageUrl, caption, createdAt, updatedAt }> }
 *
 * Admin-only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const defaults = await db.eventMockupDefault.findMany({
    where: { eventId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    defaults: defaults.map((d) => ({
      id: d.id,
      type: d.type,
      dataJson: d.dataJson,
      imageUrl: d.imageUrl,
      caption: d.caption,
      eventImageId: d.eventImageId,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
}

/**
 * POST /api/admin/events/[id]/mockup-defaults
 *
 * Save (or update) the default mockup for this event.
 *
 * Body:
 *   {
 *     type: "speaker-intro" | "meet-the-speaker" | "agenda-profile" | "event-profile",
 *     dataJson: string,          // full JSON serialization of the mockup data
 *     pngBase64: string,         // base64-encoded PNG snapshot (data:image/png;base64,...)
 *     caption?: string,          // optional override for the caption
 *   }
 *
 * Side effects:
 *   1. Uploads the PNG to Vercel Blob at `brand-assets/mockup-<eventId>-<type>-<timestamp>.png`
 *   2. Creates/updates EventMockupDefault row (unique on eventId+type)
 *   3. If type === "event-profile": also creates an EventImage row and
 *      sets event.mainImageId to point at it (so /events/[slug] updates).
 *
 * Response:
 *   { default: { id, type, imageUrl, caption, ... }, eventImage?: { id, fileUrl } }
 *
 * Admin-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, slug: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const { type, dataJson, pngBase64, caption } = body as {
    type: string;
    dataJson: string;
    pngBase64: string;
    caption?: string;
  };

  // Validate type
  const VALID_TYPES = new Set([
    "speaker-intro",
    "meet-the-speaker",
    "agenda-profile",
    "event-profile",
  ]);
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: `Invalid mockup type: ${type}. Must be one of: ${[...VALID_TYPES].join(", ")}` },
      { status: 400 },
    );
  }
  if (!dataJson || typeof dataJson !== "string") {
    return NextResponse.json({ error: "dataJson is required (string)" }, { status: 400 });
  }
  if (!pngBase64 || typeof pngBase64 !== "string") {
    return NextResponse.json({ error: "pngBase64 is required (data URL)" }, { status: 400 });
  }

  // Decode the base64 PNG. The frontend sends a data URL like
  // "data:image/png;base64,iVBORw0KG..." — we strip the prefix.
  const matches = pngBase64.match(/^data:image\/png;base64,(.+)$/);
  if (!matches) {
    return NextResponse.json(
      { error: "pngBase64 must be a data URL (data:image/png;base64,...)" },
      { status: 400 },
    );
  }
  const buf = Buffer.from(matches[1], "base64");

  // Upload to Vercel Blob. Fall back to a local file write if Blob isn't
  // configured (sandbox mode). Use a stable filename so re-saves overwrite.
  const safeType = type.replace(/[^a-z0-9-]/g, "");
  const safeEventId = eventId.replace(/[^a-zA-Z0-9]/g, "");
  const filename = `mockup-${safeEventId}-${safeType}-${Date.now()}.png`;
  const finalCaption = caption?.trim() || `${event.title} — ${type}`;

  let imageUrl: string;
  let eventImageId: string | null = null;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(
        `brand-assets/${filename}`,
        buf,
        {
          access: "public",
          contentType: "image/png",
          addRandomSuffix: false,
        },
      );
      imageUrl = blob.url;
    } catch (err) {
      console.error("[mockup-defaults] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload PNG: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  } else {
    // Sandbox fallback — write to /public/uploads/brand-assets/
    const path = await import("path");
    const fs = await import("fs/promises");
    const LOCAL_BRAND_DIR = path.join(process.cwd(), "public", "uploads", "brand-assets");
    await fs.mkdir(LOCAL_BRAND_DIR, { recursive: true });
    const fullPath = path.join(LOCAL_BRAND_DIR, filename);
    await fs.writeFile(fullPath, buf);
    imageUrl = `/uploads/brand-assets/${encodeURIComponent(filename)}`;
  }

  // If type === "event-profile", create an EventImage row and set it as
  // the event's mainImage. This makes /events/[slug] immediately show
  // the new mockup as the event's hero image.
  if (type === "event-profile") {
    try {
      const newImage = await db.eventImage.create({
        data: {
          eventId,
          uploaderId: me.id,
          fileName: filename,
          fileUrl: imageUrl,
          fileSize: buf.length,
          width: 1200,
          height: 1500,
          mimeType: "image/png",
          caption: finalCaption,
          slideOrder: 0,
        },
      });
      eventImageId = newImage.id;

      // Set this image as the event's mainImage.
      await db.event.update({
        where: { id: eventId },
        data: { mainImageId: newImage.id },
      });
    } catch (err) {
      console.error("[mockup-defaults] Failed to create EventImage:", err);
      // Don't fail the whole request — the PNG + JSON are still saved.
    }
  }

  // Upsert the EventMockupDefault row.
  const existing = await db.eventMockupDefault.findUnique({
    where: { eventId_type: { eventId, type } },
  });

  let defaultRow;
  if (existing) {
    defaultRow = await db.eventMockupDefault.update({
      where: { id: existing.id },
      data: {
        dataJson,
        imageUrl,
        caption: finalCaption,
        eventImageId,
      },
    });
  } else {
    defaultRow = await db.eventMockupDefault.create({
      data: {
        eventId,
        type,
        dataJson,
        imageUrl,
        caption: finalCaption,
        eventImageId,
      },
    });
  }

  return NextResponse.json({
    default: {
      id: defaultRow.id,
      type: defaultRow.type,
      imageUrl: defaultRow.imageUrl,
      caption: defaultRow.caption,
      eventImageId: defaultRow.eventImageId,
      createdAt: defaultRow.createdAt.toISOString(),
      updatedAt: defaultRow.updatedAt.toISOString(),
    },
    eventImage: eventImageId
      ? { id: eventImageId, fileUrl: imageUrl }
      : null,
  });
}

/**
 * DELETE /api/admin/events/[id]/mockup-defaults?type=<type>
 *
 * Remove the saved default for the given mockup type.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  if (!type) {
    return NextResponse.json({ error: "type query param required" }, { status: 400 });
  }

  await db.eventMockupDefault.deleteMany({
    where: { eventId, type },
  });

  return NextResponse.json({ ok: true });
}
