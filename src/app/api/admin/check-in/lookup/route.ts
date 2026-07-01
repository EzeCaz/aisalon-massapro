import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost } from "@/lib/permissions";

/**
 * GET /api/admin/check-in/lookup?code=XXXX-XXXX
 *
 * Cross-event check-in code lookup for door staff. Given a check-in code
 * (the 8-char Crockford base32 string the attendee shows at the door),
 * returns the RSVP + linked user + event details so door staff can verify
 * the attendee is legit and know which event they're entering.
 *
 * The checkInCode column is GLOBALLY unique (@unique on EventRsvp.checkInCode),
 * so a single code uniquely identifies exactly one RSVP row across the
 * entire database — no event context required. This is what makes the
 * lookup work across all events.
 *
 * Auth: requires events.edit permission (admin or super-admin) OR
 * co-host access on the event the RSVP belongs to. CO_HOSTs can use
 * this endpoint to look up codes for events they co-host.
 *
 * SINGLE-USE ENFORCEMENT: When a code is looked up for the FIRST time,
 * doorCheckedAt is set to NOW() and doorCheckedBy is set to the calling
 * user's ID. On SUBSEQUENT lookups of the same code, the API returns
 * 409 Conflict with a "code already used" warning + the original
 * doorCheckedAt timestamp so door staff know the attendee already
 * entered.
 *
 * Code normalization: the API accepts the code in any of these formats:
 *   "ABCD-1234"  →  ABCD-1234
 *   "abcd-1234"  →  ABCD-1234  (uppercased)
 *   "abcd1234"   →  ABCD-1234  (dash reinserted)
 *   " ABCD-1234 "→  ABCD-1234  (whitespace trimmed)
 *   "abcd_1234"  →  ABCD-1234  (other separators stripped)
 *
 * Returns:
 *   200 + {rsvp, user, event, firstCheckIn: true}    on first lookup
 *   200 + {rsvp, user, event, firstCheckIn: false, alreadyUsedAt}  on subsequent
 *   404 on miss
 *   400 on empty/invalid code
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
      // Co-host pre-approval fields
      approvedByCoHostId: true,
      approvedAt: true,
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

  // CO-HOST APPROVAL CHECK — a code can only be admitted at the door if
  // a co-host (or admin) has pre-approved it on the event. If approval
  // is missing, return 403 with a clear "not approved" message so the
  // door staff know to ask the attendee to contact the co-host. We
  // DON'T set doorCheckedAt in this path — the code is still unused.
  if (!rsvp.approvedByCoHostId || !rsvp.approvedAt) {
    return NextResponse.json(
      {
        found: true,
        normalized,
        approved: false,
        message:
          "This check-in code has not been approved by a co-host yet. Ask the attendee to message the event co-host, who can approve them on the event admin page.",
        rsvp: {
          ...rsvp,
          checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
          doorCheckedAt: rsvp.doorCheckedAt?.toISOString() ?? null,
          approvedByCoHostId: rsvp.approvedByCoHostId,
          approvedAt: rsvp.approvedAt?.toISOString() ?? null,
          createdAt: rsvp.createdAt.toISOString(),
          event: {
            ...rsvp.event,
            startsAt: rsvp.event.startsAt.toISOString(),
            endsAt: rsvp.event.endsAt.toISOString(),
          },
        },
        lookedUpBy: { id: me.id, name: me.name },
        lookedUpAt: new Date().toISOString(),
      },
      { status: 403 }
    );
  }

  // Fetch the approver's name + email so the door panel can show
  // "Approved by [Co-host_name] at HH:MM on DD MMM YY".
  const approver = await db.user.findUnique({
    where: { id: rsvp.approvedByCoHostId },
    select: { id: true, name: true, email: true },
  });

  const approvalInfo = {
    approvedBy: approver
      ? { id: approver.id, name: approver.name, email: approver.email }
      : null,
    approvedAt: rsvp.approvedAt.toISOString(),
  };

  // SINGLE-USE ENFORCEMENT — if doorCheckedAt is already set, this code
  // has already been used at the door. Return success (so door staff see
  // the attendee info) but flag firstCheckIn: false + the original
  // check-in time so they know the attendee already entered.
  if (rsvp.doorCheckedAt) {
    return NextResponse.json({
      found: true,
      normalized,
      approved: true,
      ...approvalInfo,
      firstCheckIn: false,
      alreadyUsedAt: rsvp.doorCheckedAt.toISOString(),
      alreadyUsedBy: rsvp.doorCheckedBy,
      rsvp: {
        ...rsvp,
        checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
        doorCheckedAt: rsvp.doorCheckedAt.toISOString(),
        createdAt: rsvp.createdAt.toISOString(),
        event: {
          ...rsvp.event,
          startsAt: rsvp.event.startsAt.toISOString(),
          endsAt: rsvp.event.endsAt.toISOString(),
        },
      },
      lookedUpBy: { id: me.id, name: me.name },
      lookedUpAt: new Date().toISOString(),
    });
  }

  // FIRST LOOKUP — atomically mark doorCheckedAt + doorCheckedBy. Use
  // updateMany with a where clause that requires doorCheckedAt IS NULL
  // to prevent race conditions (two door staff scanning the same code
  // simultaneously).
  const updateResult = await db.eventRsvp.updateMany({
    where: { id: rsvp.id, doorCheckedAt: null },
    data: {
      doorCheckedAt: new Date(),
      doorCheckedBy: me.id,
    },
  });

  // If updateResult.count === 0, another door-staff lookup beat us to
  // it — re-fetch and return the already-used state.
  if (updateResult.count === 0) {
    const refreshed = await db.eventRsvp.findUnique({
      where: { id: rsvp.id },
      select: { doorCheckedAt: true, doorCheckedBy: true },
    });
    return NextResponse.json({
      found: true,
      normalized,
      approved: true,
      ...approvalInfo,
      firstCheckIn: false,
      alreadyUsedAt: refreshed?.doorCheckedAt?.toISOString() ?? null,
      alreadyUsedBy: refreshed?.doorCheckedBy,
      rsvp: {
        ...rsvp,
        checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
        doorCheckedAt: refreshed?.doorCheckedAt?.toISOString() ?? null,
        createdAt: rsvp.createdAt.toISOString(),
        event: {
          ...rsvp.event,
          startsAt: rsvp.event.startsAt.toISOString(),
          endsAt: rsvp.event.endsAt.toISOString(),
        },
      },
      lookedUpBy: { id: me.id, name: me.name },
      lookedUpAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    found: true,
    normalized,
    approved: true,
    ...approvalInfo,
    firstCheckIn: true,
    rsvp: {
      ...rsvp,
      checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
      doorCheckedAt: new Date().toISOString(),
      createdAt: rsvp.createdAt.toISOString(),
      event: {
        ...rsvp.event,
        startsAt: rsvp.event.startsAt.toISOString(),
        endsAt: rsvp.event.endsAt.toISOString(),
      },
    },
    lookedUpBy: { id: me.id, name: me.name },
    lookedUpAt: new Date().toISOString(),
  });
}
