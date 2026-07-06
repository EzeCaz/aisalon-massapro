import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { can, isEventCoHost, isEventSpeaker, isSuperAdmin, normalizeRole, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { EventTabs } from "./event-tabs";
import { ReferralShareCard } from "@/components/ais/referral-share-card";
import { RsvpCheckInCard } from "@/components/events/rsvp-check-in-card";
import { format } from "date-fns";
import { Users } from "lucide-react";

export const metadata = { title: "Event — AI Salon Tel Aviv" };

type Params = { params: Promise<{ slug: string }> };

export default async function EventDetailPage({ params }: Params) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  // Anonymous visitors get redirected to the PUBLIC event landing
  // page (/e/[slug]) instead of /login. The public page shows the
  // full event details + a "Join AI Salon" CTA that routes to
  // /login?callbackUrl=/e/[slug]. This makes /events/[slug] reachable
  // from the public events list without forcing a login wall.
  if (!session?.user?.email) redirect(`/e/${slug}`);

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true },
  });
  if (!me) redirect("/login");

  // Brand-new users must complete onboarding before they can access any
  // event-specific page — same gate as /events and /profile.
  if (needsOnboarding(me)) redirect("/onboarding");

  const event = await db.event.findUnique({
    where: { slug },
    include: {
      // The admin-picked main image — used as the event's hero picture
      // at the top-left of the event page. null when none has been set.
      mainImage: { select: { id: true, fileUrl: true, caption: true } },
      speakers: {
        orderBy: { order: "asc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              photoUrl: true,
              image: true,
              company: true,
              bio: true,
              tags: { select: { id: true, label: true, color: true } },
            },
          },
        },
      },
      agenda: {
        orderBy: { startsAt: "asc" },
        include: {
          speaker: {
            include: {
              // Include the linked User (if any) so the client can decide
              // whether to route "Contact speaker" through the in-app chat
              // (ConversationMessage) or fall back to the one-way email
              // relay (SpeakerMessage).
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  photoUrl: true,
                  image: true,
                  company: true,
                  bio: true,
                  tags: { select: { id: true, label: true, color: true } },
                },
              },
              // Show ALL of the speaker's linked images — the user
              // requested no 4-picture cap. The agenda thumbnail shows
              // the first image as a preview, and the slideshow dialog
              // (which supports reorder) shows the full set.
              images: {
                orderBy: { slideOrder: "asc" },
                select: {
                  id: true,
                  fileUrl: true,
                  fileName: true,
                  caption: true,
                  slideOrder: true,
                },
              },
              // Same idea for presentations — just the first one for
              // the thumbnail. The full list is on the Presentations
              // tab.
              presentations: {
                take: 1,
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  fileName: true,
                  fileUrl: true,
                  mimeType: true,
                  title: true,
                },
              },
            },
          },
          // Panelists for PANEL-type agenda items (m:n). Empty for non-PANEL
          // items. Includes the linked User so the Contact Speaker dialog
          // can route via in-app chat vs. email relay (same shape as the
          // lead speaker above).
          panelists: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  photoUrl: true,
                  image: true,
                  company: true,
                  bio: true,
                  tags: { select: { id: true, label: true, color: true } },
                },
              },
              images: {
                orderBy: { slideOrder: "asc" },
                select: {
                  id: true,
                  fileUrl: true,
                  fileName: true,
                  caption: true,
                  slideOrder: true,
                },
              },
              presentations: {
                take: 1,
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  fileName: true,
                  fileUrl: true,
                  mimeType: true,
                  title: true,
                },
              },
            },
          },
          // Presentations linked directly to THIS agenda item (e.g.
          // uploaded by the admin via the Manage Agenda tab). Take
          // just the first one for the thumbnail.
          presentations: {
            take: 1,
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              mimeType: true,
              title: true,
            },
          },
        },
      },
      _count: { select: { images: true } },
    },
  });
  if (!event) notFound();

  // Compute the management tier for the current user on this event:
  //   - Super Admins + Admins can manage ANY event.
  //   - CO_HOSTs can manage only events they are explicitly a co-host of.
  //   - SPEAKERs can view (read-only) the Event Prep tab for events they
  //     are speaking at — they cannot manage the event.
  //   - Members cannot manage.
  // This drives the "🛠 Manage Event" tab on the event page.
  const isSuperAdminUser = isSuperAdmin({ email: me.email, role: me.role });
  const isAdminTier = can(me.role, "events.edit") || isSuperAdminUser;
  let isCoHostOfThisEvent = false;
  if (!isAdminTier && normalizeRole(me.role) === ROLES.CO_HOST) {
    isCoHostOfThisEvent = await isEventCoHost(me.id, event.id);
  }
  const canManageEvent = isAdminTier || isCoHostOfThisEvent;

  // SPEAKER role: can view the Event Prep tab (read-only) for events
  // they are speaking at. They cannot edit anything.
  //
  // NOTE: We intentionally do NOT require me.role === "SPEAKER" here.
  // The authoritative check is the Speaker row link (Speaker.userId).
  // This means a MEMBER who is added as a Speaker on an event also
  // gets read-only Event Prep access — which is the correct product
  // behavior (being invited to speak = being invited to prep).
  // Admins / Co-hosts already get access via canManageEvent above.
  let isSpeakerOfThisEvent = false;
  if (!canManageEvent) {
    isSpeakerOfThisEvent = await isEventSpeaker(me.id, event.id);
  }
  const canViewEventPrep = canManageEvent || isSpeakerOfThisEvent;

  // Fetch co-hosts for this event (so the Manage Event tab can show them
  // without an extra round trip). Only visible to managers.
  let coHostsList: Array<{
    id: string;
    createdAt: string;
    user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
      photoUrl: string | null;
      company: string | null;
      role: string;
    };
  }> = [];
  // Fetch full speaker roster for managers so the Manage Event tab can
  // render the same SpeakersManager component as /admin/events/[id].
  // Non-managers don't get this data (SpeakersManager hides itself).
  let speakersForEditorList: Array<{
    id: string;
    eventId: string;
    name: string;
    role: string | null;
    company: string | null;
    bio: string | null;
    topic: string | null;
    photoUrl: string | null;
    contactEmail: string | null;
    userId: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; email: string; name: string | null } | null;
    _count: { images: number; presentations: number; messages: number };
  }> = [];
  if (canManageEvent) {
    const rows = await db.eventCoHost.findMany({
      where: { eventId: event.id },
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
      orderBy: { createdAt: "asc" },
    });
    coHostsList = rows.map((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      user: c.user,
    }));

    // Full speaker roster with the shape EventForEditor.speakers expects.
    const speakerRows = await db.speaker.findMany({
      where: { eventId: event.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        user: { select: { id: true, email: true, name: true } },
        _count: {
          select: { images: true, presentations: true, messages: true },
        },
      },
    });
    speakersForEditorList = speakerRows.map((s) => ({
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
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      user: s.user,
      _count: s._count,
    }));
  }

  // Fetch RSVP + check-in counts for managers (shown in the Manage Event tab)
  // AND the GOING count shown in the public meta line (the black "14 Going"
  // pill). We always need the GOING count for the meta line, so we lift
  // the rsvpsGoing query out of the manager-only block.
  const rsvpsGoingCount = await db.eventRsvp.count({
    where: { eventId: event.id, status: "GOING" },
  });

  let eventStats: {
    rsvps: number;
    rsvpsGoing: number;
    checkedIn: number;
    images: number;
    speakers: number;
    agenda: number;
  } | null = null;
  if (canManageEvent) {
    const [rsvps, checkedIn, images, speakers, agenda] = await Promise.all([
      db.eventRsvp.count({ where: { eventId: event.id } }),
      db.eventRsvp.count({ where: { eventId: event.id, checkedInAt: { not: null } } }),
      db.eventImage.count({ where: { eventId: event.id } }),
      db.speaker.count({ where: { eventId: event.id } }),
      db.eventAgendaItem.count({ where: { eventId: event.id } }),
    ]);
    eventStats = { rsvps, rsvpsGoing: rsvpsGoingCount, checkedIn, images, speakers, agenda };
  }

  // Serialize dates for client
  const serialized = {
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    agenda: event.agenda.map((a) => ({
      ...a,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt?.toISOString() || null,
    })),
  };

  // Serialize the manager-only speaker roster (with _count + dates as ISO
  // strings so it's safe to pass across the RSC boundary into the client
  // EventEditor → SpeakersManager).
  const speakersForEditor = speakersForEditorList.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  // The "isAdmin" prop historically only drove the "Manage Agenda" tab.
  // We keep it (for backward compat with existing tab components) but
  // ALSO pass canManageEvent + canManageCoHosts for the new Manage Event tab.
  const isAdmin = canManageEvent;

  // Preload the current user's RSVP for this event so the registration +
  // check-in widget on the Overview tab can render the right CTA without
  // a flash on first paint. The client component re-fetches on mount to
  // stay fresh, but this initial value avoids the "not registered" flash
  // for users who already RSVPed on the public /e/[slug] page.
  const rsvp = await db.eventRsvp.findUnique({
    where: { eventId_email: { eventId: event.id, email: me.email } },
    select: {
      id: true,
      status: true,
      source: true,
      checkInCode: true,
      checkedInAt: true,
      createdAt: true,
    },
  });
  const serializedRsvp = rsvp
    ? {
        ...rsvp,
        checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
        createdAt: rsvp.createdAt.toISOString(),
      }
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />

      {/* Hero / title block */}
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          {/* Main image — top-left of the event page. Sized to a 16:9
              banner that spans the full hero width on small screens and
              is capped at 50% width on large screens so it sits to the
              left of (and visually anchors) the date block. */}
          {event.mainImage?.fileUrl && (
            <div className="mb-8 overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-sm">
              <div className="relative w-full aspect-[16/9] max-h-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.mainImage.fileUrl}
                  alt={event.mainImage.caption || event.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Bottom gradient so any overlaid text (none right now,
                    but ready for future caption) stays legible. */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            </div>
          )}
          <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs mb-4">
                <span className="inline-flex items-center rounded-full bg-[#FF005A]/10 text-[#FF005A] px-2.5 py-0.5 font-bold uppercase tracking-wider">
                  {event.chapter}
                </span>
                {event.city && (
                  <span className="text-black/80 font-semibold">{event.city}</span>
                )}
                <span className="text-black/80">
                  {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(event.startsAt)}
                </span>
                <span className="text-black/20">·</span>
                <span className="text-black/80 font-mono">
                  {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.startsAt)} – {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.endsAt)}
                </span>
                {event.country && (
                  <span className="text-black/80">· {event.country}</span>
                )}
                {/* Going pill — black bg, white text. Matches the spec:
                    "Tel Aviv Monday, July 13, 2026 · 18:00 – 21:30 · ISR · 14 Going"
                    where the "14 Going" is a black pill with white text. */}
                <span className="inline-flex items-center gap-1 rounded-full bg-black text-white px-2.5 py-0.5 font-bold uppercase tracking-wider">
                  <Users className="h-3 w-3" />
                  {rsvpsGoingCount} Going
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
                {event.title}
              </h1>
              {event.subtitle && (
                <p className="mt-2 text-lg text-black/80">{event.subtitle}</p>
              )}

              {event.venue && (
                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-black/70">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="font-semibold">📍 Venue:</span>
                    {event.venue}
                    {event.address && <span className="text-black/50">· {event.address}</span>}
                  </div>
                  {event.mapUrl && (
                    <a
                      href={event.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#004F98] font-semibold underline-offset-4 hover:underline"
                    >
                      Open in Maps →
                    </a>
                  )}
                  {event.wazeUrl && (
                    <a
                      href={event.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#004F98] font-semibold underline-offset-4 hover:underline"
                    >
                      Open in Waze →
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Chapter shape date block */}
            <div className="hidden lg:flex flex-col items-center">
              <div className="w-28 text-center rounded-xl overflow-hidden border border-black/15 bg-white">
                <div className="ais-gradient h-2" />
                <div className="p-4">
                  <div className="text-[0.7rem] font-bold uppercase tracking-widest text-[#FF005A]">
                    {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", month: "short" }).format(event.startsAt).toUpperCase()}
                  </div>
                  <div className="text-5xl font-extrabold text-black leading-none my-1">
                    {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", day: "2-digit" }).format(event.startsAt)}
                  </div>
                  <div className="text-[0.9rem] font-semibold uppercase tracking-wider text-black/90">
                    {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric" }).format(event.startsAt)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[0.85rem] font-mono text-black/90">
                {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.startsAt)} – {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.endsAt)}
              </div>

              {/* Register / Check-in / Save-to-Calendar widget.
                  Compact "header" variant of the same RsvpCheckInCard used
                  in the Overview sidebar. Visible on lg+ screens (matches
                  the date block visibility). Renders one of four states:
                  register / registered / check-in available / checked-in
                  with code. Synced with the Overview tab via the RSVP API. */}
              <div className="mt-4 w-44">
                <RsvpCheckInCard
                  eventSlug={event.slug}
                  eventTitle={event.title}
                  eventStartsAt={event.startsAt.toISOString()}
                  eventEndsAt={event.endsAt.toISOString()}
                  initialRsvp={serializedRsvp}
                  eventDescription={event.description}
                  eventVenue={event.venue}
                  eventAddress={event.address}
                  eventCity={event.city}
                  eventCountry={event.country}
                  variant="header"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Referral share link — compact variant. Lets members share THIS
            event page (the URL is auto-built from the current pathname, so
            it includes the /events/[slug] path + the member's utm_uid).
            Hidden for users without a utmUid (legacy accounts). */}
        {me.utmUid && (
          <div className="mb-6">
            <ReferralShareCard utmUid={me.utmUid} variant="compact" />
          </div>
        )}

        <EventTabs
          event={serialized}
          me={me}
          isAdmin={isAdmin}
          initialRsvp={serializedRsvp}
          canManageEvent={canManageEvent}
          canManageCoHosts={isAdminTier}
          isSuperAdmin={isSuperAdminUser}
          canViewEventPrep={canViewEventPrep}
          isSpeaker={isSpeakerOfThisEvent}
          coHosts={coHostsList}
          eventStats={eventStats}
          speakersForEditor={speakersForEditor}
        />
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
