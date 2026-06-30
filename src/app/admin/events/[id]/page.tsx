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
      speakers: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          user: { select: { id: true, email: true, name: true } },
          _count: {
            select: {
              images: true,
              presentations: true,
              messages: true,
            },
          },
        },
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
    speakers: event.speakers.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      name: s.name,
      role: s.role,
      company: s.company,
      bio: s.bio,
      topic: s.topic,
      photoUrl: s.photoUrl,
      contactEmail: s.contactEmail,
      userId: s.userId,
      order: s.order,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      user: s.user
        ? { id: s.user.id, email: s.user.email, name: s.user.name }
        : null,
      _count: {
        images: s._count.images,
        presentations: s._count.presentations,
        messages: s._count.messages,
      },
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
  // Speaker management: ADMIN+ can always manage speakers. CO_HOSTs can
  // manage speakers ONLY for events they co-host (the existing
  // requireEventSpeakersEdit guard enforces this server-side; here we
  // just decide whether to render the Add/Remove buttons).
  const canManageSpeakers = isAdmin || isCoHostOfThis;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <AdminTabs />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <EventEditor
          event={eventForEditor}
          canDelete={canDelete}
          canManageCoHosts={canManage}
          canManageSpeakers={canManageSpeakers}
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
