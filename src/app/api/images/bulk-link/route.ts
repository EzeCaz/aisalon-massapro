import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/images/bulk-link
 * Body: { imageIds: string[], speakerIds?: string[], agendaItemIds?: string[] }
 * Links every image in imageIds to:
 *   - every speaker in speakerIds (replaces existing speaker links per image)
 *   - every agenda item in agendaItemIds (replaces existing session tags per image)
 *
 * Either `speakerIds` OR `agendaItemIds` (or both) may be provided. When a
 * field is omitted, that relation is left untouched on every image. When a
 * field is provided as `[]`, that relation is cleared on every image.
 *
 * This dual-target behavior is what lets the Photos tab have two parallel
 * bulk actions — "Link to speaker" and "Link to session" — without one
 * clobbering the other's tags when the user only intended to update one.
 *
 * Used for the "bulk link" UI on the photo gallery.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { imageIds, speakerIds, agendaItemIds } = (await req.json()) as {
    imageIds: string[];
    speakerIds?: string[];
    agendaItemIds?: string[];
  };

  if (!Array.isArray(imageIds)) {
    return NextResponse.json({ error: "imageIds is required" }, { status: 400 });
  }
  if (imageIds.length === 0) {
    return NextResponse.json({ error: "No images selected" }, { status: 400 });
  }
  // At least one of speakerIds / agendaItemIds must be provided (otherwise
  // the call is a no-op and almost certainly a client bug). We allow `[]`
  // because that's a legitimate "clear all tags" operation.
  if (!Array.isArray(speakerIds) && !Array.isArray(agendaItemIds)) {
    return NextResponse.json(
      { error: "speakerIds or agendaItemIds (or both) required" },
      { status: 400 }
    );
  }

  // Verify all images exist + the user has permission (uploader or admin)
  const images = await db.eventImage.findMany({
    where: { id: { in: imageIds } },
    select: { id: true, uploaderId: true },
  });
  if (images.length !== imageIds.length) {
    return NextResponse.json({ error: "Some images not found" }, { status: 404 });
  }
  const isAdmin = user.role === "ADMIN";
  for (const img of images) {
    if (!isAdmin && img.uploaderId !== user.id) {
      return NextResponse.json(
        { error: `Forbidden for image ${img.id}` },
        { status: 403 }
      );
    }
  }

  // Verify speakers exist (when provided)
  if (Array.isArray(speakerIds) && speakerIds.length > 0) {
    const speakers = await db.speaker.findMany({
      where: { id: { in: speakerIds } },
      select: { id: true },
    });
    if (speakers.length !== speakerIds.length) {
      return NextResponse.json({ error: "Some speakers not found" }, { status: 404 });
    }
  }

  // Verify agenda items exist (when provided). We don't cross-check that
  // each agenda item belongs to the same event as the image — same reasoning
  // as PATCH /api/images/[id]: the client only ever shows this event's own
  // agenda items, so cross-event ids can't reach this code path in practice.
  if (Array.isArray(agendaItemIds) && agendaItemIds.length > 0) {
    const items = await db.eventAgendaItem.findMany({
      where: { id: { in: agendaItemIds } },
      select: { id: true },
    });
    if (items.length !== agendaItemIds.length) {
      return NextResponse.json({ error: "Some agenda items not found" }, { status: 404 });
    }
  }

  // Build the per-image update payload. We only set the keys that were
  // provided so an omitted field doesn't accidentally clear an existing
  // relation the user didn't intend to touch.
  const buildPayload = () => {
    const payload: Record<string, unknown> = {};
    if (Array.isArray(speakerIds)) {
      payload.speakers = { set: speakerIds.map((sid) => ({ id: sid })) };
    }
    if (Array.isArray(agendaItemIds)) {
      payload.agendaItems = { set: agendaItemIds.map((aid) => ({ id: aid })) };
    }
    return payload;
  };

  await db.$transaction(
    imageIds.map((id) =>
      db.eventImage.update({
        where: { id },
        data: buildPayload(),
      })
    )
  );

  return NextResponse.json({ ok: true, linked: imageIds.length });
}
