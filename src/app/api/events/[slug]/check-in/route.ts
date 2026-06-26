import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

/**
 * Check-in API for the public event page (/e/[slug]).
 *
 *   GET  /api/events/[slug]/check-in  — returns the current user's check-in
 *                                       code if they've already checked in,
 *                                       plus whether the check-in window
 *                                       is currently open.
 *   POST /api/events/[slug]/check-in  — generates (or returns the existing)
 *                                       check-in code for the current user.
 *                                       Only works during the "event day
 *                                       window" — see isWithinCheckInWindow().
 *
 * The "event day window" is defined as:
 *   - opens 1 hour BEFORE the event startsAt
 *   - closes 6 hours AFTER the event endsAt
 *
 * This lets early arrivals check in starting 1 hour before the official
 * start, and lets stragglers check in shortly after the event ends.
 * Outside this window, the API returns 403 with a friendly message.
 *
 * Auth: requires a signed-in user. The RSVP row is created on the fly if
 * it doesn't already exist (status=GOING, source=EVENT_PAGE) — clicking
 * "I'm here" is treated as both registering AND checking in for late
 * arrivals who never pre-registered.
 *
 * Idempotent: if the user already has a checkInCode, the same code is
 * returned. The code is a stable identifier the user can show at the door
 * any number of times.
 *
 * Code format: 8 characters from the Crockford base32 alphabet
 * (0123456789ABCDEFGHJKMNPQRSTVWXYZ — excludes I, L, O, U to avoid
 * confusion with 1, 1, 0, V), formatted as "XXXX-XXXX". This gives
 * 32^8 ≈ 1.1 trillion combinations. Collision risk on insert is handled
 * by retrying with a fresh code (up to 5 attempts).
 *
 * The checkInCode is GLOBALLY unique (@unique on EventRsvp.checkInCode),
 * so a single code uniquely identifies one RSVP row across the entire
 * database — door staff can look up an attendee by code without needing
 * to know which event they're at (see /api/admin/check-in/lookup).
 */

type Params = { params: Promise<{ slug: string }> };

// Crockford base32 alphabet — unambiguous, no I/L/O/U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".split("");

function generateCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/**
 * The event-day window. Server-side computed using UTC milliseconds
 * (Date.getTime()), which is timezone-agnostic. Both the event times
 * (stored as UTC in Postgres) and the current server time are converted
 * to ms-since-epoch, so the comparison is correct regardless of the
 * server's local timezone.
 *
 * Window: [startsAt - 1h, endsAt + 6h]
 *   - opens 1 hour before the event starts (per user spec — early
 *     arrivals can check in starting 1h before doors open)
 *   - closes 6 hours after the event ends (so late arrivals can still
 *     check in shortly after the event wraps up)
 */
function isWithinCheckInWindow(startsAt: Date, endsAt: Date, now: Date = new Date()): boolean {
  const open = startsAt.getTime() - 1 * 60 * 60 * 1000;
  const close = endsAt.getTime() + 6 * 60 * 60 * 1000;
  return now.getTime() >= open && now.getTime() <= close;
}

async function getUser(req: NextRequest, slug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { user: null, event: null, status: 401 as const };
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true },
  });
  if (!user) return { user: null, event: null, status: 401 as const };
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  if (!event) return { user: null, event: null, status: 404 as const };
  return { user, event, status: 200 as const };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { user, event, status } = await getUser(_req, slug);
  if (status === 401) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (status === 404 || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const rsvp = await db.eventRsvp.findUnique({
    where: { eventId_email: { eventId: event.id, email: user!.email } },
    select: { id: true, checkInCode: true, checkedInAt: true },
  });

  // Also return whether the check-in window is currently open, so the
  // client can decide whether to show the "Check in" button.
  const windowOpen = isWithinCheckInWindow(event.startsAt, event.endsAt);

  return NextResponse.json({
    rsvp,
    windowOpen,
    eventStartsAt: event.startsAt.toISOString(),
    eventEndsAt: event.endsAt.toISOString(),
  });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const { user, event, status } = await getUser(_req, slug);
  if (status === 401) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (status === 404 || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Enforce the event-day window. Outside the window, the API refuses to
  // issue a code — the client is expected to hide the "Check in" button,
  // but we defend in depth here so direct API calls can't bypass it.
  if (!isWithinCheckInWindow(event.startsAt, event.endsAt)) {
    return NextResponse.json(
      {
        error:
          "Check-in opens 1 hour before the event starts. " +
          "The button will appear here on the day of the event.",
        windowOpen: false,
      },
      { status: 403 }
    );
  }

  // Find or create the RSVP row. If it already has a checkInCode, we
  // return that same code (idempotent). Otherwise we generate a new code
  // and persist it with checkedInAt = now.
  const existing = await db.eventRsvp.findUnique({
    where: { eventId_email: { eventId: event.id, email: user!.email } },
    select: { id: true, checkInCode: true, checkedInAt: true },
  });

  if (existing?.checkInCode) {
    return NextResponse.json({
      rsvp: existing,
      windowOpen: true,
      eventTitle: event.title,
      eventStartsAt: event.startsAt.toISOString(),
    });
  }

  // Generate a fresh code. Retry on unique-constraint collision (rare, but
  // possible — 1 in 1.1 trillion per attempt, so 5 retries is overkill).
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const rsvp = await db.eventRsvp.upsert({
        where: { eventId_email: { eventId: event.id, email: user!.email } },
        create: {
          eventId: event.id,
          userId: user!.id,
          email: user!.email,
          name: user!.name,
          status: "GOING",
          source: "EVENT_PAGE",
          checkInCode: code,
          checkedInAt: new Date(),
        },
        update: {
          checkInCode: code,
          checkedInAt: new Date(),
        },
        select: { id: true, checkInCode: true, checkedInAt: true },
      });
      return NextResponse.json({
        rsvp,
        windowOpen: true,
        eventTitle: event.title,
        eventStartsAt: event.startsAt.toISOString(),
      });
    } catch (err) {
      // P2002 = unique constraint violation. If it's on checkInCode, retry
      // with a fresh code. Otherwise rethrow.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("checkInCode") || msg.includes("P2002")) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  // All retries exhausted (essentially impossible).
  console.error("[check-in] code generation exhausted retries:", lastErr);
  return NextResponse.json(
    { error: "Could not generate a unique check-in code. Please try again." },
    { status: 500 }
  );
}
