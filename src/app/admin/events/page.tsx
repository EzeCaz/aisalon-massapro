import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AdminEventsListWithActions } from "./admin-events-list-with-actions";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";

export const metadata = { title: "Events — Admin — AI Salon Tel Aviv" };

export default async function AdminEventsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/events");

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN role from the allowlist
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Permission gate: ADMIN + SUPER_ADMIN can manage events. CO_HOSTs are
  // redirected to /events (they can manage specific events they co-host
  // via the "Manage Event" tab on the event detail page).
  if (!can(me.role, "events.edit") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: {
        select: {
          images: true,
          speakers: true,
          agenda: true,
          rsvps: true,
        },
      },
      coHosts: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              photoUrl: true,
              image: true,
              company: true,
              role: true,
            },
          },
        },
      },
      mainImage: { select: { id: true, fileUrl: true, caption: true } },
    },
  });

  // Compute check-in counts in a single batched query
  const checkedInCounts = await Promise.all(
    events.map((e) =>
      db.eventRsvp.count({ where: { eventId: e.id, checkedInAt: { not: null } } })
    )
  );

  const serialized = events.map((e, i) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    subtitle: e.subtitle,
    chapter: e.chapter,
    venue: e.venue,
    country: e.country,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    mainImage: e.mainImage
      ? { id: e.mainImage.id, fileUrl: e.mainImage.fileUrl }
      : null,
    coHosts: e.coHosts.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.user.name || c.user.email,
      userPhotoUrl: c.user.photoUrl || c.user.image || null,
    })),
    _count: {
      images: e._count.images,
      speakers: e._count.speakers,
      agenda: e._count.agenda,
      rsvps: e._count.rsvps,
      checkedIn: checkedInCounts[i],
    },
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <AdminTabs />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
              Admin
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black leading-tight">
              Manage <span className="ais-gradient-text">events</span>
            </h1>
            <p className="mt-2 text-sm text-black/80 max-w-2xl">
              Edit event details, manage co-hosts, view RSVPs & check-in stats.
              Click an event to edit it, or create a new one.
            </p>
          </div>
          <Link
            href="/admin/events/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] hover:bg-[#D8004D] text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            <CalendarPlus className="h-4 w-4" />
            New event
          </Link>
        </div>

        <AdminEventsListWithActions events={serialized} />
      </main>
      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/80 underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              MassaPro
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
