import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEventSpeakersEdit, isError } from "@/lib/auth-guards";

/**
 * PATCH /api/admin/speakers/[id]
 * Update an existing speaker's editable fields. Re-runs the auto-link
 * logic when contactEmail changes — if a User with the new email exists,
 * the speaker is linked to them (userId set); otherwise userId is cleared.
 *
 * Permission: admins can edit any speaker; CO_HOST users can edit only
 * speakers in events they're co-hosting.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await db.speaker.findUnique({
    where: { id },
    select: { id: true, contactEmail: true, userId: true, eventId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  // Permission check — uses speaker.eventId for CO_HOST scope
  const me = await requireEventSpeakersEdit(existing.eventId);
  if (isError(me)) return me;

  const body = await req.json();
  const { name, role, company, bio, topic, photoUrl, contactEmail, userId, order } =
    body as {
      name?: string;
      role?: string | null;
      company?: string | null;
      bio?: string | null;
      topic?: string | null;
      photoUrl?: string | null;
      contactEmail?: string | null;
      userId?: string | null;
      order?: number;
    };

  // Normalize contact email + auto-link to a user when changed.
  let normalizedEmail = existing.contactEmail;
  let resolvedUserId = existing.userId;

  if (contactEmail !== undefined) {
    normalizedEmail = contactEmail?.trim().toLowerCase() || null;
    if (normalizedEmail) {
      const linkedUser = await db.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      resolvedUserId = linkedUser?.id ?? null;
    } else {
      resolvedUserId = null;
    }
  }

  // Explicit userId override (e.g. admin picks a user manually from a
  // dropdown). null clears the link.
  if (userId !== undefined) {
    if (userId === null) {
      resolvedUserId = null;
    } else {
      const u = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (u) resolvedUserId = u.id;
    }
  }

  const updated = await db.speaker.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(role !== undefined ? { role: role?.trim() || null } : {}),
      ...(company !== undefined ? { company: company?.trim() || null } : {}),
      ...(bio !== undefined ? { bio: bio?.trim() || null } : {}),
      ...(topic !== undefined ? { topic: topic?.trim() || null } : {}),
      ...(photoUrl !== undefined ? { photoUrl: photoUrl?.trim() || null } : {}),
      ...(contactEmail !== undefined ? { contactEmail: normalizedEmail } : {}),
      userId: resolvedUserId,
      ...(order !== undefined ? { order: Number(order) } : {}),
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ speaker: updated });
}

/**
 * DELETE /api/admin/speakers/[id]
 * Permanently remove a speaker. Related EventImage / PresentationFile /
 * SpeakerMessage rows are cascade-deleted by Prisma.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await db.speaker.findUnique({
    where: { id },
    select: { id: true, eventId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  // Permission check — uses speaker.eventId for CO_HOST scope
  const me = await requireEventSpeakersEdit(existing.eventId);
  if (isError(me)) return me;

  await db.speaker.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
