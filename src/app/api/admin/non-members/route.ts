import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/non-members
 *
 * List all NonMembers across all events. Optional query params:
 *   - status= pending|none|merged|ignored  (filter by duplicateStatus)
 *   - eventId=<id>                          (only non-members registered for this event)
 *   - q=<search>                            (case-insensitive search on name/email/company)
 *
 * Returns each NonMember with their event registrations + the candidate
 * User (if duplicateOfUserId is set) for side-by-side comparison in the
 * admin UI.
 *
 * Admin-only.
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
  const status = url.searchParams.get("status");
  const eventId = url.searchParams.get("eventId");
  const q = url.searchParams.get("q")?.trim().toLowerCase();

  const where: Record<string, unknown> = {};
  if (status) where.duplicateStatus = status;
  if (eventId) where.eventRegistrations = { some: { eventId } };
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q, mode: "insensitive" } },
    ];
  }

  const nonMembers = await db.nonMember.findMany({
    where,
    include: {
      eventRegistrations: {
        include: {
          event: { select: { id: true, title: true, slug: true, startsAt: true } },
        },
        orderBy: { registeredAt: "desc" },
      },
      duplicateOf: {
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          mobile: true,
          linkedinUrl: true,
          bio: true,
          photoUrl: true,
          image: true,
          createdAt: true,
          tags: { select: { label: true, color: true } },
          eventRegistrations: {
            select: { eventId: true, registeredAt: true },
          },
        },
      },
    },
    orderBy: [{ duplicateStatus: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    nonMembers: nonMembers.map((nm) => ({
      id: nm.id,
      email: nm.email,
      name: nm.name,
      mobile: nm.mobile,
      company: nm.company,
      linkedinUrl: nm.linkedinUrl,
      bio: nm.bio,
      importSource: nm.importSource,
      duplicateStatus: nm.duplicateStatus,
      duplicateReason: nm.duplicateReason,
      createdAt: nm.createdAt.toISOString(),
      events: nm.eventRegistrations.map((r) => ({
        eventId: r.event.id,
        eventTitle: r.event.title,
        eventSlug: r.event.slug,
        eventStartsAt: r.event.startsAt.toISOString(),
        registeredAt: r.registeredAt.toISOString(),
        source: r.source,
      })),
      duplicateOf: nm.duplicateOf
        ? {
            id: nm.duplicateOf.id,
            email: nm.duplicateOf.email,
            name: nm.duplicateOf.name,
            company: nm.duplicateOf.company,
            mobile: nm.duplicateOf.mobile,
            linkedinUrl: nm.duplicateOf.linkedinUrl,
            bio: nm.duplicateOf.bio,
            image: nm.duplicateOf.photoUrl ?? nm.duplicateOf.image,
            createdAt: nm.duplicateOf.createdAt.toISOString(),
            tags: nm.duplicateOf.tags,
            registeredEventIds: nm.duplicateOf.eventRegistrations.map((r) => r.eventId),
          }
        : null,
    })),
  });
}
