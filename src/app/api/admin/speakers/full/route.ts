import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/speakers/full
 *
 * Returns every Speaker row in the platform with all the relations the
 * admin speakers-management page needs:
 *   - the event it belongs to (id, title, slug, startsAt)
 *   - the linked platform user (id, email, name) — if any
 *   - the agenda items (sessions) it is currently linked to
 *   - counts of images / presentations linked to it
 *
 * Also returns the full list of events (id, title, slug, startsAt) so the
 * admin UI can render an "Add to another event" picker without an extra
 * round-trip.
 *
 * Admin-only.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [speakers, events] = await Promise.all([
    db.speaker.findMany({
      orderBy: [{ event: { startsAt: "desc" } }, { order: "asc" }],
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            startsAt: true,
            venue: true,
          },
        },
        user: {
          select: { id: true, email: true, name: true, image: true },
        },
        agendaItems: {
          select: {
            id: true,
            title: true,
            type: true,
            startsAt: true,
            endsAt: true,
          },
          orderBy: { startsAt: "asc" },
        },
        _count: {
          select: { images: true, presentations: true, messages: true },
        },
      },
    }),
    db.event.findMany({
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        startsAt: true,
        venue: true,
        _count: { select: { speakers: true, agenda: true } },
      },
    }),
  ]);

  return NextResponse.json({ speakers, events });
}
