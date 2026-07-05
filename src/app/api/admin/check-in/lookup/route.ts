import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost } from "@/lib/permissions";

/**
 * GET /api/admin/check-in/lookup?code=XXXX-XXXX
 *
 * Door-staff lookup of an attendee's check-in code. Returns the RSVP +
 * linked user + event details so door staff can review them BEFORE
 * confirming the check-in.
 *
 * NO PRE-APPROVAL GATE — any Super Admin / Admin / Co-host of the event
 * can look up a code. The actual door-check-in write happens in a
 * separate POST /api/admin/check-in/confirm call, triggered when the
 * door staffer presses "Confirm check-in" after reviewing the member
 * info + the non-transferrable-code warning.
 *
 * The checkInCode column is GLOBALLY unique (@unique on
 * EventRsvp.checkInCode), so a single code uniquely identifies exactly
 * one RSVP row across the entire database — no event context required.
 *
 * Auth: requires events.edit permission (Admin / Super-Admin) OR
 * co-host access on the event the RSVP belongs to. CO_HOSTs can use
 * this endpoint to look up codes for events they co-host.
 *
 * Returns ONE of:
 *   200 + { found: true, status: "PENDING_CONFIRM", rsvp, ... }
 *        → code valid, not yet used; show confirm panel
 *   200 + { found: true, status: "ALREADY_USED", rsvp, alreadyUsedAt, alreadyUsedBy, ... }
 *        → code valid, already door-checked; show already-used panel
 *   404 + { found: false, normalized, message }
 *        → no RSVP has this code
 *   400 on empty / invalid code format
 *   403 if caller lacks permission for this event
 */
export async function GET(req: NextRequest) {
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
  // Global admins + super-admins can look up any code.
  // CO_HOSTs can look up codes only for events they co-host (checked below
  // after we resolve the RSVP — we need to know the eventId first).
  const isGlobalAdmin = can(me.role, "events.edit");

  const url = new URL(req.url);
  const rawCode = (url.searchParams.get("code") || "").trim();
  if (!rawCode) {
    return NextResponse.json({ error: "code parameter is required" }, { status: 400 });
  }

  // Normalize: uppercase, strip everything except alphanumerics, reinsert
  // the dash after the first 4 chars. Codes are always 8 alphanumerics.
  const cleaned = rawCode
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, ""); // drop dashes, spaces, underscores, etc.
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

  // CO_HOST scope check: if caller is not a global admin, verify they
  // are a co-host of the RSVP's event.
  if (!isGlobalAdmin) {
    const isCoHostOfThisEvent = await isEventCoHost(me.id, rsvp.event.id);
    if (!isCoHostOfThisEvent) {
      return NextResponse.json(
        {
          error:
            "You are not a co-host of this event. Only admins and event co-hosts can look up check-in codes for it.",
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

  const base = {
    found: true as const,
    normalized,
    rsvp: serializedRsvp,
    lookedUpBy: { id: me.id, name: me.name },
    lookedUpAt: new Date().toISOString(),
  };

  // ── ALREADY USED ────────────────────────────────────────────────
  // doorCheckedAt is set → the code has already been used at the door.
  // Return success (so door staff see the attendee info) but flag
  // status: "ALREADY_USED" + the original check-in time. NO write
  // happens in lookup — the actual door-check-in write happens in the
  // POST /confirm endpoint.
  if (rsvp.doorCheckedAt) {
    // Fetch the original door-checker's name for display
    let alreadyUsedByName: string | null = null;
    if (rsvp.doorCheckedBy) {
      const checker = await db.user.findUnique({
        where: { id: rsvp.doorCheckedBy },
        select: { name: true },
      });
      alreadyUsedByName = checker?.name ?? null;
    }
    return NextResponse.json({
      ...base,
      status: "ALREADY_USED" as const,
      alreadyUsedAt: rsvp.doorCheckedAt.toISOString(),
      alreadyUsedBy: rsvp.doorCheckedBy,
      alreadyUsedByName,
    });
  }

  // ── PENDING CONFIRM ─────────────────────────────────────────────
  // Code valid + not yet used → return member info so door staff can
  // review + press "Confirm check-in" (which triggers POST /confirm).
  return NextResponse.json({
    ...base,
    status: "PENDING_CONFIRM" as const,
  });
}
