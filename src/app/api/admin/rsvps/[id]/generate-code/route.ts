import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { can, isEventCoHost, isSuperAdmin } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth-guards";
import { randomBytes } from "crypto";

/**
 * POST /api/admin/rsvps/[id]/generate-code
 *
 * Generate a check-in code for an RSVP that doesn't have one yet. Used by
 * admin/super-admin/co-host to pre-issue a code for an attendee who hasn't
 * clicked "I'm here — Check in" themselves (e.g. paper RSVP, manual
 * addition, walk-in).
 *
 * Permission:
 *   - SUPER_ADMIN + ADMIN → can generate for any RSVP
 *   - CO_HOST             → can generate only for RSVPs on events they co-host
 *   - MEMBER              → 403
 *
 * Body: (none)
 *
 * Returns:
 *   200 + { ok: true, checkInCode, checkedInAt } on success
 *   200 + { ok: true, alreadyExists: true, checkInCode } if RSVP already has a code (idempotent)
 *   404 if RSVP not found
 *   403 if caller lacks permission
 *
 * Code format: 8 chars from Crockford base32 alphabet, formatted as
 * "XXXX-XXXX". Same alphabet + format as the user self-service endpoint
 * at /api/events/[slug]/check-in so door staff can scan uniformly.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const { id } = await params;
  const rsvp = await db.eventRsvp.findUnique({
    where: { id },
    select: {
      id: true,
      eventId: true,
      email: true,
      name: true,
      checkInCode: true,
      checkedInAt: true,
    },
  });
  if (!rsvp) {
    return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
  }

  // Permission check — global admins/super-admins OR co-hosts of this event.
  const isGlobalAdmin =
    can(me.role, "events.edit") || isSuperAdmin({ email: me.email, role: me.role });
  if (!isGlobalAdmin) {
    const isCoHostOfThisEvent = await isEventCoHost(me.id, rsvp.eventId);
    if (!isCoHostOfThisEvent) {
      return NextResponse.json(
        {
          error:
            "You are not a co-host of this event. Only admins, super-admins, and event co-hosts can generate check-in codes.",
        },
        { status: 403 }
      );
    }
  }

  // Idempotent: if the RSVP already has a checkInCode, return it.
  if (rsvp.checkInCode) {
    return NextResponse.json({
      ok: true,
      alreadyExists: true,
      checkInCode: rsvp.checkInCode,
      checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
    });
  }

  // Generate a fresh code with retry on unique-constraint collision.
  // Same alphabet + format as the public check-in endpoint.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const updated = await db.eventRsvp.update({
        where: { id: rsvp.id },
        data: {
          checkInCode: code,
          checkedInAt: new Date(),
        },
        select: {
          id: true,
          checkInCode: true,
          checkedInAt: true,
        },
      });
      return NextResponse.json({
        ok: true,
        generated: true,
        checkInCode: updated.checkInCode,
        checkedInAt: updated.checkedInAt?.toISOString() ?? null,
        generatedBy: me.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("checkInCode") || msg.includes("P2002")) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  console.error("[generate-code] exhausted retries:", lastErr);
  return NextResponse.json(
    { error: "Could not generate a unique check-in code. Please try again." },
    { status: 500 }
  );
}

// Crockford base32 alphabet — unambiguous (no I/L/O/U).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".split("");

function generateCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
