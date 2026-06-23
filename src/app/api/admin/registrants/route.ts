import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/registrants
 *
 * Manually add a registrant (RSVP) to an event. Used by the admin
 * Registrants tab when adding someone by email (e.g. importing a
 * paper RSVP, or pre-registering a VIP).
 *
 * Body: {
 *   eventId: string,
 *   email: string,
 *   name?: string,
 *   status?: "GOING" | "MAYBE" | "NOT_GOING",   // default GOING
 *   source?: string,                             // default MANUAL
 * }
 *
 * If the email matches a platform user, the RSVP is linked to that
 * user via userId. The (eventId, email) pair is unique — duplicates
 * return the existing RSVP unchanged (idempotent).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { eventId, email, name, status, source } = body as {
    eventId?: string;
    email?: string;
    name?: string;
    status?: string;
    source?: string;
  };

  if (!eventId || !email || !email.trim()) {
    return NextResponse.json(
      { error: "eventId and email are required" },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Auto-link to a platform user if one exists with this email.
  const linkedUser = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  // upsert — (eventId, email) is unique. Idempotent for duplicate submits.
  const rsvp = await db.eventRsvp.upsert({
    where: {
      eventId_email: { eventId, email: normalizedEmail },
    },
    create: {
      eventId,
      email: normalizedEmail,
      name: name?.trim() || null,
      status: status || "GOING",
      source: source || "MANUAL",
      userId: linkedUser?.id || null,
    },
    update: {
      // Don't overwrite an existing RSVP — just return it.
    },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ rsvp });
}

/**
 * GET /api/admin/registrants?eventId=…
 *
 * Returns all RSVPs across all events (or filtered by eventId).
 * Used by the admin Registrants tab for live refresh after edits.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");

  const rsvps = await db.eventRsvp.findMany({
    where: eventId ? { eventId } : undefined,
    orderBy: [{ event: { startsAt: "desc" } }, { createdAt: "desc" }],
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ rsvps });
}
