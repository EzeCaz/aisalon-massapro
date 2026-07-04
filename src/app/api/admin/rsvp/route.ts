import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/admin/rsvp
 *
 * Admin adds or updates an RSVP for a (event, email) pair.
 *
 * Body:
 *   {
 *     eventId: string,
 *     email: string,
 *     name?: string,
 *     status: "GOING" | "MAYBE" | "NOT_GOING" | "WAITLIST",
 *     userId?: string   // optional — if email matches a User, link it
 *   }
 *
 * Returns the upserted EventRsvp.
 *
 * This is the manual path. CSV import is a separate endpoint.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { eventId, email, name, status, userId } = body as {
    eventId: string;
    email: string;
    name?: string;
    status: string;
    userId?: string;
  };

  if (!eventId || !email || !status) {
    return NextResponse.json(
      { error: "eventId, email, status are required" },
      { status: 400 }
    );
  }

  const validStatuses = ["GOING", "MAYBE", "NOT_GOING", "WAITLIST"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Try to link to a User by email if userId not given
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    resolvedUserId = user?.id;
  }

  const rsvp = await db.eventRsvp.upsert({
    where: { eventId_email: { eventId, email: email.toLowerCase() } },
    create: {
      eventId,
      email: email.toLowerCase(),
      name: name || null,
      status,
      source: "MANUAL",
      userId: resolvedUserId || null,
    },
    update: {
      name: name || null,
      status,
      userId: resolvedUserId || null,
    },
  });

  return NextResponse.json({ rsvp });
}

/**
 * GET /api/admin/rsvp?eventId=<id>
 *
 * Returns all RSVPs for a given event.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const rsvps = await db.eventRsvp.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rsvps });
}
