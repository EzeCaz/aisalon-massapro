import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost, isSuperAdminEmail, isSuperAdmin, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { EventEditor, type EventForEditor } from "@/components/admin/event-editor";

export const metadata = { title: "Edit Event — Admin — AI Salon Tel Aviv" };

type Params = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Params) {
  const { id: eventId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect(`/login?callbackUrl=/admin/events/${eventId}`);

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN role
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Permission gate: ADMIN + SUPER_ADMIN + (CO_HOST of THIS event)
  const isAdmin = can(me.role, "events.edit") || isSuperAdmin({ email: me.email, role: me.role });
  const isCoHostOfThis = me.role === ROLES.CO_HOST ? await isEventCoHost(me.id, eventId) : false;
  if (!isAdmin && !isCoHostOfThis) {
    redirect("/events");
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

  if (!event) notFound();

  const checkedInCount = await db.eventRsvp.count({
    where: { eventId: event.id, checkedInAt: { not: null } },
  });
  const goingCount = await db.eventRsvp.count({
    where: { eventId: event.id, status: "GOING" },
  });

  const eventForEditor: EventForEditor = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle,
    chapter: event.chapter,
    venue: event.venue,
    address: event.address,
    city: event.city,
    country: event.country,
    mapUrl: event.mapUrl,
    wazeUrl: event.wazeUrl,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    description: event.description,
    takeaways: event.takeaways,
    intendedFor: event.intendedFor,
    rsvpUrl: event.rsvpUrl,
    coHosts: event.coHosts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
    _count: {
      images: event._count.images,
      speakers: event._count.speakers,
      agenda: event._count.agenda,
      rsvps: event._count.rsvps,
      rsvpsGoing: goingCount,
      checkedIn: checkedInCount,
    },
  };

  // CO_HOSTs can view the event + co-hosts list, but only ADMIN+ can
  // add/remove co-hosts or delete the event.
  const canManage = isAdmin;
  const canDelete = isSuperAdmin({ email: me.email, role: me.role });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <AdminTabs />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <EventEditor
          event={eventForEditor}
          canDelete={canDelete}
          canManageCoHosts={canManage}
          showBackButton
          backHref="/admin/events"
        />
        {!canManage && (
          <p className="mt-4 text-xs text-black/40 italic">
            You are a co-host of this event. Co-host management (adding/removing other
            co-hosts) is restricted to Admins and Super Admins.
          </p>
        )}
      </main>
      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/60 underline-offset-4 hover:underline"
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
