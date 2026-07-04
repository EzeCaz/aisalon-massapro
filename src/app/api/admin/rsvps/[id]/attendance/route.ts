/**
 * PATCH /api/admin/rsvps/[id]/attendance
 *
 * Mark an RSVP as attended / no-show / clear attendance. Fires the
 * /api/track/event endpoint internally with the appropriate event_name
 * so GA4 + Meta CAPI get the conversion event.
 *
 * Auth: admin session only.
 *
 * Body:
 *   { status: "ATTENDED" | "NO_SHOW" | "CLEAR" }
 *
 * Response:
 *   200 { ok: true, rsvp: { id, attendedAt, noShow, attendedMarkedBy } }
 *   401 unauthorized
 *   404 rsvp not found
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // --- auth ---
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isCron = bearerToken && CRON_SECRET && bearerToken === CRON_SECRET;

  let adminUserId: string | null = null;
  let adminEmail: string | null = null;
  if (!isCron) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const me = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, role: true },
    });
    if (!me || !["SUPER_ADMIN", "ADMIN", "CO_HOST"].includes(me.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    adminUserId = me.id;
    adminEmail = me.email;
  }

  // --- parse ---
  const { id: rsvpId } = await params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const status = body.status;
  if (!["ATTENDED", "NO_SHOW", "CLEAR"].includes(status ?? "")) {
    return NextResponse.json(
      { error: "status must be ATTENDED | NO_SHOW | CLEAR" },
      { status: 400 },
    );
  }

  // --- load rsvp ---
  const rsvp = await db.eventRsvp.findUnique({
    where: { id: rsvpId },
    include: {
      event: { select: { id: true, slug: true, title: true } },
      user: { select: { id: true, email: true, firstName: true, name: true } },
    },
  });
  if (!rsvp) {
    return NextResponse.json({ error: "rsvp not found" }, { status: 404 });
  }

  const now = new Date();
  const updateData =
    status === "ATTENDED"
      ? { attendedAt: now, noShow: false, attendedMarkedBy: adminUserId }
      : status === "NO_SHOW"
        ? { attendedAt: null, noShow: true, attendedMarkedBy: adminUserId }
        : { attendedAt: null, noShow: false, attendedMarkedBy: null };

  const updated = await db.eventRsvp.update({
    where: { id: rsvpId },
    data: updateData,
    select: {
      id: true,
      attendedAt: true,
      noShow: true,
      attendedMarkedBy: true,
    },
  });

  // --- fire tracking event (best-effort, non-blocking) ---
  // Only fire on transitions (not on idempotent re-marks).
  const justMarkedAttended = status === "ATTENDED" && !rsvp.attendedAt;
  const justMarkedNoShow = status === "NO_SHOW" && !rsvp.noShow;

  if (justMarkedAttended || justMarkedNoShow) {
    const trackBody = {
      event_name: justMarkedAttended ? "CompleteRegistration" : "no_show", // no_show maps to GA4 only, not Meta standard
      event_id: rsvp.id,
      email: rsvp.email,
      event_slug: rsvp.event.slug,
      custom_data: {
        event_title: rsvp.event.title,
        marked_by: adminEmail,
      },
    };

    // Fire-and-forget — don't block the API response.
    fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/track/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify(trackBody),
    }).catch((err) => {
      console.error("[attendance] track/event fire-and-forget failed:", err);
    });
  }

  // --- trigger any flows that fire on MARKED_ATTENDED / MARKED_NO_SHOW ---
  // (best-effort — flow worker will pick up on next cron tick)
  if (justMarkedAttended || justMarkedNoShow) {
    try {
      const { triggerFlowsForRsvp } = await import("@/lib/email-orchestrator/flow-trigger");
      await triggerFlowsForRsvp({
        rsvpId: rsvp.id,
        triggerKind: justMarkedAttended ? "MARKED_ATTENDED" : "MARKED_NO_SHOW",
      });
    } catch (err) {
      console.error("[attendance] flow trigger failed:", err);
    }
  }

  return NextResponse.json({ ok: true, rsvp: updated });
}
