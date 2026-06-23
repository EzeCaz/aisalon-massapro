import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEventAgendaEdit, isError } from "@/lib/auth-guards";

/**
 * PATCH /api/admin/agenda/[id]
 * Body: {
 *   title?, description?, type?, startsAt?, endsAt?, speakerId?
 * }
 * Pass speakerId: null to unlink the speaker.
 *
 * Permission: admins can edit any agenda item; CO_HOST users can edit
 * only items in events they're co-hosting.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await db.eventAgendaItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
  }

  // Permission check — uses item.eventId for CO_HOST scope
  const me = await requireEventAgendaEdit(item.eventId);
  if (isError(me)) return me;

  const body = await req.json();
  const { title, description, type, startsAt, endsAt, speakerId } = body as {
    title?: string;
    description?: string | null;
    type?: string;
    startsAt?: string;
    endsAt?: string | null;
    speakerId?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (typeof title === "string") data.title = title.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (typeof type === "string") data.type = type;
  if (typeof startsAt === "string") data.startsAt = new Date(startsAt);
  if (endsAt !== undefined) data.endsAt = endsAt ? new Date(endsAt) : null;
  if (speakerId !== undefined) {
    // null is allowed (unlink speaker); otherwise verify it belongs to the same event
    if (speakerId === null) {
      data.speakerId = null;
    } else {
      const sp = await db.speaker.findFirst({
        where: { id: speakerId, eventId: item.eventId },
        select: { id: true },
      });
      if (!sp) {
        return NextResponse.json(
          { error: "Speaker not found for this event" },
          { status: 400 }
        );
      }
      data.speakerId = speakerId;
    }
  }

  const updated = await db.eventAgendaItem.update({
    where: { id },
    data,
    include: {
      speaker: { select: { id: true, name: true, role: true, company: true } },
    },
  });
  return NextResponse.json({ agendaItem: updated });
}

/**
 * DELETE /api/admin/agenda/[id]
 * Removes the agenda item. Linked presentation files are deleted (DB
 * rows + Vercel Blob objects). The linked speaker row is preserved —
 * speakers belong to the event, not to a single agenda item.
 * Admin-only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await db.eventAgendaItem.findUnique({
    where: { id },
    include: { presentations: { select: { id: true, fileUrl: true } } },
  });
  if (!item) {
    return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
  }

  // Permission check — uses item.eventId for CO_HOST scope
  const me = await requireEventAgendaEdit(item.eventId);
  if (isError(me)) return me;

  // Delete linked presentation files (DB rows + Blobs) — best-effort
  for (const pres of item.presentations) {
    if (pres.fileUrl.startsWith("https://")) {
      try {
        await del(pres.fileUrl);
      } catch (e) {
        console.warn("[admin/agenda DELETE] blob removal failed:", e);
      }
    }
    await db.presentationFile.delete({ where: { id: pres.id } });
  }

  await db.eventAgendaItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
