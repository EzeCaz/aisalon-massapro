import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * GET /api/admin/events/[id]/cohosts
 *
 * Returns the list of co-hosts assigned to this event. Each row includes
 * the user's id, email, name, role, and the co-host record's id + createdAt.
 *
 * Admin-only (events.edit).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "events.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const cohosts = await db.eventCoHost.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          photoUrl: true,
          image: true,
        },
      },
      adder: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ cohosts });
}

/**
 * POST /api/admin/events/[id]/cohosts
 *
 * Body: { userId: string }
 *
 * Adds a user as a co-host of this event. Idempotent — if the user is
 * already a co-host, returns 200 with the existing record (no error).
 *
 * Side effect: if the user's role is MEMBER, it is upgraded to CO_HOST
 * so they can actually exercise the per-event permission. (This matches
 * the platform's mental model — assigning someone as a co-host implies
 * they should be able to act as one.)
 *
 * Admin-only (events.edit).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "events.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const { userId } = body as { userId?: string };
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Don't allow adding a Super Admin as a co-host — they already have
  // access to everything via their role, and the EventCoHost row would
  // just be noise in the table.
  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Super Admins already have access to all events" },
      { status: 400 }
    );
  }

  // Upgrade MEMBER → CO_HOST so the assignment is actually meaningful.
  // (If they're already CO_HOST or ADMIN, leave the role alone.)
  if (target.role === "MEMBER") {
    await db.user.update({
      where: { id: target.id },
      data: { role: "CO_HOST" },
    });
  }

  // Upsert the EventCoHost row. The (eventId, userId) pair has a unique
  // constraint, so we use upsert to keep this idempotent.
  const cohost = await db.eventCoHost.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, addedBy: me.id },
    update: {}, // no fields to update — just return the existing row
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          photoUrl: true,
          image: true,
        },
      },
    },
  });

  return NextResponse.json({ cohost });
}
