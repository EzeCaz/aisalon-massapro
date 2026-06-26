import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost, isSuperAdmin, ROLES, normalizeRole } from "@/lib/permissions";

/**
 * /api/admin/events/[id]/co-hosts
 *
 * GET  — list current co-hosts of the event (admin/super-admin/co-host-of-this-event)
 * POST — add a co-host by email or userId (admin/super-admin only)
 *
 * CO_HOSTs can view the co-hosts list of events they're co-hosting (so
 * they can see who else is collaborating), but only ADMIN+ can add new
 * co-hosts.
 */

async function authorizeView(meId: string, meRole: string, meEmail: string | null, eventId: string) {
  if (can(meRole, "events.edit") || isSuperAdmin({ email: meEmail, role: meRole })) {
    return true;
  }
  if (normalizeRole(meRole) === ROLES.CO_HOST) {
    return await isEventCoHost(meId, eventId);
  }
  return false;
}

function authorizeManage(meRole: string, meEmail: string | null) {
  return can(meRole, "events.edit") || isSuperAdmin({ email: meEmail, role: meRole });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const authorized = await authorizeView(me.id, me.role, me.email, eventId);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const coHosts = await db.eventCoHost.findMany({
    where: { eventId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          photoUrl: true,
          company: true,
          role: true,
        },
      },
      adder: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    coHosts: coHosts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!authorizeManage(me.role, me.email)) {
    return NextResponse.json({ error: "Forbidden — Admins only" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const { email, userId } = body as { email?: string; userId?: string };

  if (!email && !userId) {
    return NextResponse.json({ error: "email or userId required" }, { status: 400 });
  }

  // Resolve to a user — by userId directly, or by email (including secondary emails)
  let targetUserId: string | null = null;
  if (userId) {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (u) targetUserId = u.id;
  } else if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const u = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true },
    });
    if (u) {
      targetUserId = u.id;
    } else {
      // Try secondary emails
      const sec = await db.userEmail.findUnique({
        where: { email: normalizedEmail },
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      });
      if (sec) targetUserId = sec.user.id;
    }
  }

  if (!targetUserId) {
    return NextResponse.json(
      { error: "User not found. Ask them to sign in to the platform first." },
      { status: 404 }
    );
  }

  // Don't allow duplicates
  const existing = await db.eventCoHost.findUnique({
    where: { eventId_userId: { eventId, userId: targetUserId } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "User is already a co-host of this event" },
      { status: 409 }
    );
  }

  // If the target user is a MEMBER, promote them to CO_HOST role so the
  // permission gates recognize them. (ADMIN/SUPER_ADMIN keep their role.)
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });
  if (target && normalizeRole(target.role) === ROLES.MEMBER) {
    await db.user.update({
      where: { id: targetUserId },
      data: { role: ROLES.CO_HOST },
    });
  }

  const coHost = await db.eventCoHost.create({
    data: {
      eventId,
      userId: targetUserId,
      addedBy: me.id,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          photoUrl: true,
          company: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json({
    coHost: {
      ...coHost,
      createdAt: coHost.createdAt.toISOString(),
    },
  });
}
