import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost } from "@/lib/permissions";

/**
 * POST /api/admin/check-in/confirm
 * Body: { "code": "ABCD-1234" }
 *
 * Confirms a door check-in for the RSVP matching the given code.
 * Triggered when door staff press "Confirm check-in" after reviewing
 * the member info + the non-transferrable-code warning.
 *
 * ANY Super Admin / Admin / Co-host of the event can confirm. There is
 * NO pre-approval gate — the confirmation itself IS the approval.
 *
 * RACE-SAFE SINGLE-USE WRITE: Uses
 *   updateMany({ where: { id, doorCheckedAt: null }, data: { ... } })
 * so two staffers confirming the same code simultaneously don't both
 * write. If `count === 0`, another staffer beat us to it → return
 * ALREADY_USED with the original timestamp.
 *
 * Returns:
 *   200 + { status: "CONFIRMED", rsvp, confirmedAt, confirmedBy }
 *        → first check-in recorded
 *   200 + { status: "ALREADY_USED", rsvp, alreadyUsedAt, alreadyUsedBy }
 *        → another staffer confirmed first
 *   404 + { found: false } — code not found
 *   400 on empty / invalid code format
 *   403 if caller lacks permission for this event
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const isGlobalAdmin = can(me.role, "events.edit");

  // Parse body
  let body: { code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rawCode = typeof body.code === "string" ? body.code.trim() : "";
  if (!rawCode) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  // Normalize: uppercase, strip non-alphanumerics, reinsert dash
  const cleaned = rawCode.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (cleaned.length !== 8) {
    return NextResponse.json(
      {
        error:
          `Invalid code format. Expected 8 characters (e.g. "ABCD-1234"), got ${cleaned.length}.`,
        normalized: cleaned,
      },
      { status: 400 }
    );
  }
  const normalized = `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;

  const rsvp = await db.eventRsvp.findUnique({
    where: { checkInCode: normalized },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      source: true,
      checkInCode: true,
      checkedInAt: true,
      doorCheckedAt: true,
      doorCheckedBy: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          photoUrl: true,
          image: true,
          bio: true,
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startsAt: true,
          endsAt: true,
          venue: true,
          address: true,
          city: true,
        },
      },
    },
  });

  if (!rsvp) {
    return NextResponse.json(
      {
        found: false,
        normalized,
        message: `No attendee found with code "${normalized}".`,
      },
      { status: 404 }
    );
  }

  // CO_HOST scope check
  if (!isGlobalAdmin) {
    const isCoHostOfThisEvent = await isEventCoHost(me.id, rsvp.event.id);
    if (!isCoHostOfThisEvent) {
      return NextResponse.json(
        {
          error:
            "You are not a co-host of this event. Only admins and event co-hosts can confirm check-in codes for it.",
        },
        { status: 403 }
      );
    }
  }

  // Common serialized payload
  const serializedRsvp = {
    ...rsvp,
    checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
    doorCheckedAt: rsvp.doorCheckedAt?.toISOString() ?? null,
    createdAt: rsvp.createdAt.toISOString(),
    event: {
      ...rsvp.event,
      startsAt: rsvp.event.startsAt.toISOString(),
      endsAt: rsvp.event.endsAt.toISOString(),
    },
  };

  // ── ALREADY USED short-circuit ─────────────────────────────────
  // If doorCheckedAt is already set, no need to attempt the write —
  // just return ALREADY_USED.
  if (rsvp.doorCheckedAt) {
    let alreadyUsedByName: string | null = null;
    if (rsvp.doorCheckedBy) {
      const checker = await db.user.findUnique({
        where: { id: rsvp.doorCheckedBy },
        select: { name: true },
      });
      alreadyUsedByName = checker?.name ?? null;
    }
    return NextResponse.json({
      found: true,
      status: "ALREADY_USED" as const,
      normalized,
      rsvp: serializedRsvp,
      alreadyUsedAt: rsvp.doorCheckedAt.toISOString(),
      alreadyUsedBy: rsvp.doorCheckedBy,
      alreadyUsedByName,
      confirmedBy: { id: me.id, name: me.name },
      confirmedAt: new Date().toISOString(),
    });
  }

  // ── ATOMIC SINGLE-USE WRITE ────────────────────────────────────
  // updateMany with `doorCheckedAt: null` in the WHERE clause is
  // race-safe: if two staffers POST confirm at the same time, only one
  // updateMany returns count === 1 (the winner); the other returns
  // count === 0 (the loser) and we re-fetch + return ALREADY_USED.
  const updateResult = await db.eventRsvp.updateMany({
    where: { id: rsvp.id, doorCheckedAt: null },
    data: {
      doorCheckedAt: new Date(),
      doorCheckedBy: me.id,
    },
  });

  if (updateResult.count === 0) {
    // Another staffer beat us to it — re-fetch and return ALREADY_USED
    const refreshed = await db.eventRsvp.findUnique({
      where: { id: rsvp.id },
      select: { doorCheckedAt: true, doorCheckedBy: true },
    });
    let alreadyUsedByName: string | null = null;
    if (refreshed?.doorCheckedBy) {
      const checker = await db.user.findUnique({
        where: { id: refreshed.doorCheckedBy },
        select: { name: true },
      });
      alreadyUsedByName = checker?.name ?? null;
    }
    return NextResponse.json({
      found: true,
      status: "ALREADY_USED" as const,
      normalized,
      rsvp: {
        ...serializedRsvp,
        doorCheckedAt: refreshed?.doorCheckedAt?.toISOString() ?? null,
        doorCheckedBy: refreshed?.doorCheckedBy ?? null,
      },
      alreadyUsedAt: refreshed?.doorCheckedAt?.toISOString() ?? null,
      alreadyUsedBy: refreshed?.doorCheckedBy ?? null,
      alreadyUsedByName,
      confirmedBy: { id: me.id, name: me.name },
      confirmedAt: new Date().toISOString(),
    });
  }

  // ── CONFIRMED — first check-in recorded ────────────────────────
  return NextResponse.json({
    found: true,
    status: "CONFIRMED" as const,
    normalized,
    rsvp: {
      ...serializedRsvp,
      doorCheckedAt: new Date().toISOString(),
      doorCheckedBy: me.id,
    },
    confirmedAt: new Date().toISOString(),
    confirmedBy: { id: me.id, name: me.name },
  });
}
