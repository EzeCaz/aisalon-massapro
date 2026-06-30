import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost, isSuperAdmin, ROLES } from "@/lib/permissions";

/**
 * /api/admin/events/[id]
 *
 * GET    — fetch a single event with co-hosts, RSVP counts, and
 *          check-in stats. Used by the edit-event page.
 * PATCH  — update event fields (title, subtitle, dates, venue, etc.)
 *          Admin/Super-Admin only (CO_HOST cannot edit core event fields,
 *          only agenda/speakers/images via their own endpoints).
 * DELETE — delete an event. Super-Admin only.
 */

async function authorizeForEventEdit(meRole: string, meEmail: string | null) {
  // Super Admins and Admins can edit ANY event.
  if (can(meRole, "events.edit") || isSuperAdmin({ email: meEmail, role: meRole })) {
    return true;
  }
  // CO_HOSTs can edit events they're explicitly a co-host of — but only
  // agenda/speakers/images, NOT core event fields. For the PATCH endpoint
  // below we still allow CO_HOST read access (GET), but block writes.
  return false;
}

async function authorizeForEventView(meId: string, meRole: string, meEmail: string | null, eventId: string) {
  if (can(meRole, "events.edit") || isSuperAdmin({ email: meEmail, role: meRole })) {
    return true;
  }
  // CO_HOST of this event can view (so they can see the management page).
  if (meRole === ROLES.CO_HOST) {
    return await isEventCoHost(meId, eventId);
  }
  return false;
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
  const authorized = await authorizeForEventView(me.id, me.role, me.email, eventId);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      coHosts: {
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
      },
      _count: {
        select: {
          images: true,
          speakers: true,
          agenda: true,
          rsvps: true,
        },
      },
    },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Compute check-in stats
  const checkedInCount = await db.eventRsvp.count({
    where: { eventId, checkedInAt: { not: null } },
  });
  const goingCount = await db.eventRsvp.count({
    where: { eventId, status: "GOING" },
  });

  return NextResponse.json({
    event: {
      ...event,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      coHosts: event.coHosts.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
      _count: {
        ...event._count,
        rsvpsGoing: goingCount,
        checkedIn: checkedInCount,
      },
    },
  });
}

export async function PATCH(
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

  const { id: eventId } = await params;
  const authorized = authorizeForEventEdit(me.role, me.email);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    title,
    subtitle,
    chapter,
    venue,
    address,
    city,
    country,
    mapUrl,
    wazeUrl,
    startsAt,
    endsAt,
    description,
    takeaways,
    intendedFor,
    rsvpUrl,
    slug,
  } = body as Record<string, string | null | undefined>;

  // Build the update payload — only fields that are explicitly present
  // in the body (so partial updates work). Null clears the field.
  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title || "";
  if (subtitle !== undefined) data.subtitle = subtitle || null;
  if (chapter !== undefined) data.chapter = chapter || "Tel Aviv";
  if (venue !== undefined) data.venue = venue || null;
  if (address !== undefined) data.address = address || null;
  if (city !== undefined) data.city = city || null;
  if (country !== undefined) data.country = country || null;
  if (mapUrl !== undefined) data.mapUrl = mapUrl || null;
  if (wazeUrl !== undefined) data.wazeUrl = wazeUrl || null;
  if (description !== undefined) data.description = description || null;
  if (takeaways !== undefined) data.takeaways = takeaways || null;
  if (intendedFor !== undefined) data.intendedFor = intendedFor || null;
  if (rsvpUrl !== undefined) data.rsvpUrl = rsvpUrl || null;
  if (startsAt !== undefined) {
    if (!startsAt) return NextResponse.json({ error: "startsAt cannot be empty" }, { status: 400 });
    data.startsAt = new Date(startsAt);
  }
  if (endsAt !== undefined) {
    if (!endsAt) return NextResponse.json({ error: "endsAt cannot be empty" }, { status: 400 });
    data.endsAt = new Date(endsAt);
  }
  if (slug !== undefined && slug !== null && slug !== "") {
    // Verify uniqueness before assigning
    const existing = await db.event.findUnique({ where: { slug }, select: { id: true } });
    if (existing && existing.id !== eventId) {
      return NextResponse.json({ error: "Slug already taken by another event" }, { status: 400 });
    }
    data.slug = slug;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db.event.update({
    where: { id: eventId },
    data,
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      chapter: true,
      venue: true,
      address: true,
      city: true,
      country: true,
      mapUrl: true,
      wazeUrl: true,
      startsAt: true,
      endsAt: true,
      description: true,
      takeaways: true,
      intendedFor: true,
      rsvpUrl: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    event: {
      ...updated,
      startsAt: updated.startsAt.toISOString(),
      endsAt: updated.endsAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
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
  // Only SUPER_ADMIN can delete events
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
  }

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, title: true } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  await db.event.delete({ where: { id: eventId } });

  return NextResponse.json({ ok: true, deleted: event.title });
}
