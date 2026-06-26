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
  const { title, description, type, startsAt, endsAt, speakerId, panelistIds, newPanelists } = body as {
    title?: string;
    description?: string | null;
    type?: string;
    startsAt?: string;
    endsAt?: string | null;
    speakerId?: string | null;
    panelistIds?: string[] | null;
    newPanelists?: Array<{
      name: string;
      role?: string;
      company?: string;
      bio?: string;
      topic?: string;
      contactEmail?: string;
    }>;
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

  // ---------- Sync panelists m:n (PANEL items) ----------
  // When panelistIds is provided (even as []), treat it as the desired final
  // state of the m:n relation: disconnect removed panelists, connect new ones.
  // Cross-event speakers are auto-cloned into this event (same as POST).
  // Brand-new panelists from newPanelists are created on this event and attached.
  let syncedPanelists: Array<{ id: string; name: string }> | null = null;
  if (Array.isArray(panelistIds)) {
    // Validate PANEL type requires at least 1 panelist (after sync)
    const newCount =
      panelistIds.length + (Array.isArray(newPanelists) ? newPanelists.length : 0);
    if ((data.type === "PANEL" || (data.type === undefined && item.type === "PANEL")) && newCount === 0) {
      return NextResponse.json(
        { error: "Panel agenda items require at least 1 panelist" },
        { status: 400 }
      );
    }

    const finalPanelistIds: string[] = [];
    const createdPanelists: Array<{ id: string; name: string }> = [];

    // (a) Resolve existing speakers (with cross-event auto-clone)
    if (panelistIds.length > 0) {
      const picked = await db.speaker.findMany({
        where: { id: { in: panelistIds } },
        include: { event: { select: { id: true } } },
      });
      const maxOrderRow = await db.speaker.aggregate({
        where: { eventId: item.eventId },
        _max: { order: true },
      });
      let nextOrder = (maxOrderRow._max.order ?? -1) + 1;

      for (const sp of picked) {
        if (sp.event.id === item.eventId) {
          finalPanelistIds.push(sp.id);
        } else {
          const clone = await db.speaker.create({
            data: {
              eventId: item.eventId,
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
    if (Array.isArray(newPanelists) && newPanelists.length > 0) {
      const maxOrderRow = await db.speaker.aggregate({
        where: { eventId: item.eventId },
        _max: { order: true },
      });
      let nextOrder = (maxOrderRow._max.order ?? -1) + 1;

      for (const np of newPanelists) {
        if (!np.name?.trim()) continue;
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
            eventId: item.eventId,
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

    // Atomic m:n sync — set: [] disconnects everything, set: [ids] replaces
    await db.eventAgendaItem.update({
      where: { id },
      data: {
        panelists: { set: finalPanelistIds.map((id) => ({ id })) },
      },
    });

    syncedPanelists = createdPanelists;
  }

  // Re-fetch with panelists included so the response reflects the post-sync state
  const refreshed = await db.eventAgendaItem.findUnique({
    where: { id },
    include: {
      speaker: { select: { id: true, name: true, role: true, company: true } },
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
    },
  });

  return NextResponse.json({ agendaItem: refreshed ?? updated, createdPanelists: syncedPanelists });
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
