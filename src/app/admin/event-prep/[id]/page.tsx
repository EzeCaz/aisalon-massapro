import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canSeeAdminNav,
  isEventCoHost,
  isEventSpeaker,
  isSuperAdminEmail,
  ROLES,
} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Mic2,
  Users,
  FileText,
  Image as ImageIcon,
  CalendarCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export const metadata = { title: "Event Prep — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * /admin/event-prep/[id] — Read-only event detail page for Event Prep.
 *
 * Shows the full event information (description, agenda, speakers,
 * presentations, basic stats) in READ-ONLY mode. No edit buttons,
 * no co-host management, no delete.
 *
 * Access rules:
 *   - SPEAKER       → must be linked as a Speaker for THIS event
 *   - CO_HOST       → must be a co-host of THIS event
 *   - ADMIN+        → can view any event
 *   - MEMBER        → redirect to /events
 *
 * This is the safe "viewing" surface for SPEAKER users. The editable
 * event editor at /admin/events/[id] remains restricted to ADMIN+ and
 * CO_HOSTs of the event.
 */
export default async function EventPrepDetailPage({ params }: Params) {
  const { id: eventId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=/admin/event-prep/${eventId}`);
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Gate 1: must be SPEAKER, CO_HOST, ADMIN, or SUPER_ADMIN
  if (!canSeeAdminNav(me.role)) {
    redirect("/events");
  }

  // Gate 2: per-event scope check
  // - ADMIN+ always passes
  // - CO_HOST must be co-host of this event
  // - SPEAKER must be speaker of this event
  const r = me.role;
  let hasAccess = false;
  if (r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN) {
    hasAccess = true;
  } else if (r === ROLES.CO_HOST) {
    hasAccess = await isEventCoHost(me.id, eventId);
  } else if (r === ROLES.SPEAKER) {
    hasAccess = await isEventSpeaker(me.id, eventId);
  }
  if (!hasAccess) {
    redirect("/admin/event-prep");
  }

  // Load the event with everything a speaker would need to prep:
  const event = await db.event.findUnique({
    where: { id: eventId },
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
      startsAt: true,
      endsAt: true,
      description: true,
      takeaways: true,
      intendedFor: true,
      rsvpUrl: true,
      _count: {
        select: {
          speakers: true,
          agenda: true,
          images: true,
          presentations: true,
          rsvps: true,
        },
      },
    },
  });

  if (!event) notFound();

  // Load agenda items with their lead speaker and panelists
  const agendaItems = await db.eventAgendaItem.findMany({
    where: { eventId },
    orderBy: { startsAt: "asc" },
    include: {
      speaker: {
        select: {
          id: true,
          name: true,
          role: true,
          company: true,
          topic: true,
          photoUrl: true,
          userId: true,
        },
      },
      panelists: {
        select: {
          id: true,
          name: true,
          role: true,
          company: true,
          topic: true,
          photoUrl: true,
          userId: true,
        },
        orderBy: { order: "asc" },
      },
      presentations: {
        select: { id: true, fileName: true, fileUrl: true, fileSize: true },
      },
    },
  });

  // Load speakers roster
  const speakers = await db.speaker.findMany({
    where: { eventId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      company: true,
      bio: true,
      topic: true,
      photoUrl: true,
      userId: true,
      order: true,
    },
  });

  // Mark which speakers are "me" (for SPEAKER users)
  const mySpeakerIds = new Set<string>();
  if (r === ROLES.SPEAKER) {
    for (const s of speakers) {
      if (s.userId === me.id) mySpeakerIds.add(s.id);
    }
  }

  // Serialize datetimes
  const eventJson = {
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
  };
  const agendaJson = agendaItems.map((a) => ({
    ...a,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt?.toISOString() ?? null,
  }));
  const speakersJson = speakers.map((s) => ({ ...s }));

  const startDate = new Date(eventJson.startsAt);
  const endDate = new Date(eventJson.endsAt);
  const dateStr = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = `${startDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })} – ${endDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <Link
            href="/admin/event-prep"
            className="inline-flex items-center gap-1 text-xs font-semibold text-black/50 hover:text-black mb-3"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Event Prep
          </Link>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            <CalendarCheck className="inline h-3 w-3 mr-1" />
            Event Prep · Read-only
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            {event.title}
          </h1>
          {event.subtitle && (
            <p className="mt-2 text-base text-black/60">{event.subtitle}</p>
          )}
        </div>

        {/* Event vitals */}
        <div className="rounded-2xl border border-black/10 bg-gradient-to-br from-[#FF005A]/5 to-[#820A7D]/5 p-5 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Vital
              icon={<CalendarDays className="h-4 w-4" />}
              label="Date"
              value={dateStr}
            />
            <Vital
              icon={<Clock className="h-4 w-4" />}
              label="Time"
              value={timeStr}
            />
            <Vital
              icon={<MapPin className="h-4 w-4" />}
              label="Venue"
              value={
                event.venue
                  ? `${event.venue}${event.city ? `, ${event.city}` : ""}`
                  : "TBD"
              }
            />
            <Vital
              icon={<Users className="h-4 w-4" />}
              label="Chapter"
              value={event.chapter}
            />
          </div>
          {event.address && (
            <div className="mt-3 pt-3 border-t border-black/10 flex items-center gap-2 text-xs text-black/60">
              <MapPin className="h-3 w-3" />
              {event.address}
              {event.country ? `, ${event.country}` : ""}
              {event.mapUrl && (
                <a
                  href={event.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-[#FF005A] hover:underline font-semibold"
                >
                  View on map →
                </a>
              )}
            </div>
          )}
        </div>

        {/* "You're speaking" banner — SPEAKER only */}
        {r === ROLES.SPEAKER && mySpeakerIds.size > 0 && (
          <div className="rounded-xl bg-[#FFB300]/10 border border-[#FFB300]/40 p-4 mb-8">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-[#8a5a00] mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-[#8a5a00]">
                  You&apos;re speaking at this event
                </p>
                {speakers
                  .filter((s) => mySpeakerIds.has(s.id))
                  .map((s) => (
                    <div key={s.id} className="mt-1 text-sm text-black/70">
                      <span className="font-medium">{s.name}</span>
                      {s.role ? ` · ${s.role}` : ""}
                      {s.company ? ` · ${s.company}` : ""}
                      {s.topic && (
                        <span className="block italic text-black/60 mt-0.5">
                          &ldquo;{s.topic}&rdquo;
                        </span>
                      )}
                    </div>
                  ))}
                <p className="mt-2 text-xs text-black/50">
                  To update your bio, photo, or topic, contact the event
                  organizer. Speakers can&apos;t edit their own info.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <Section title="About this event" icon={<FileText className="h-4 w-4" />}>
            <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line">
              {event.description}
            </p>
          </Section>
        )}

        {/* Intended for + takeaways */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {event.intendedFor && (
            <Section title="Who is this for" icon={<Users className="h-4 w-4" />}>
              <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line">
                {event.intendedFor}
              </p>
            </Section>
          )}
          {event.takeaways && (
            <Section title="What you&apos;ll take away" icon={<Sparkles className="h-4 w-4" />}>
              <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line">
                {event.takeaways}
              </p>
            </Section>
          )}
        </div>

        {/* Agenda */}
        <Section title="Agenda" icon={<CalendarDays className="h-4 w-4" />}>
          {agendaJson.length === 0 ? (
            <EmptyState message="Agenda hasn't been published yet. Check back closer to the event date." />
          ) : (
            <ol className="space-y-3">
              {agendaJson.map((item) => {
                const itemStart = new Date(item.startsAt);
                const itemTime = itemStart.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const itemEnd = item.endsAt
                  ? new Date(item.endsAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null;
                const isMine =
                  item.speaker && mySpeakerIds.has(item.speaker.id);
                const isMyPanel = item.panelists.some((p) =>
                  mySpeakerIds.has(p.id)
                );
                const highlightMe = isMine || isMyPanel;

                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border p-4 ${
                      highlightMe
                        ? "border-[#FFB300]/50 bg-[#FFB300]/5"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs font-bold text-[#FF005A]">
                          {itemTime}
                        </div>
                        {itemEnd && (
                          <div className="text-[0.65rem] text-black/40">
                            {itemEnd}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-black text-sm">
                            {item.title}
                          </h4>
                          <TypeBadge type={item.type} />
                          {highlightMe && (
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[#8a5a00] bg-[#FFB300]/20 px-1.5 py-0.5 rounded">
                              Your slot
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1 text-xs text-black/60">
                            {item.description}
                          </p>
                        )}
                        {item.speaker && (
                          <p className="mt-1.5 text-xs text-black/60">
                            <span className="font-medium text-black/80">
                              {item.speaker.name}
                            </span>
                            {item.speaker.role ? ` · ${item.speaker.role}` : ""}
                            {item.speaker.company
                              ? ` · ${item.speaker.company}`
                              : ""}
                          </p>
                        )}
                        {item.panelists.length > 0 && (
                          <div className="mt-1.5">
                            <p className="text-[0.65rem] uppercase tracking-wider text-black/40 font-semibold mb-0.5">
                              Panelists
                            </p>
                            <p className="text-xs text-black/60">
                              {item.panelists
                                .map(
                                  (p) =>
                                    `${p.name}${p.company ? ` (${p.company})` : ""}`
                                )
                                .join(", ")}
                            </p>
                          </div>
                        )}
                        {item.presentations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.presentations.map((p) => (
                              <a
                                key={p.id}
                                href={p.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF005A] hover:underline bg-[#FF005A]/5 px-2 py-1 rounded"
                              >
                                <FileText className="h-3 w-3" />
                                {p.fileName}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        {/* Speakers roster */}
        <Section title="Speakers" icon={<Mic2 className="h-4 w-4" />}>
          {speakersJson.length === 0 ? (
            <EmptyState message="No speakers have been announced yet." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {speakersJson.map((s) => {
                const isMe = mySpeakerIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-4 flex gap-3 ${
                      isMe
                        ? "border-[#FFB300]/50 bg-[#FFB300]/5"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {s.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.photoUrl}
                          alt={s.name}
                          className="h-14 w-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-full bg-black/5 flex items-center justify-center text-black/40 text-lg font-bold">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-black text-sm">
                          {s.name}
                        </h4>
                        {isMe && (
                          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-[#8a5a00] bg-[#FFB300]/20 px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </div>
                      {(s.role || s.company) && (
                        <p className="text-xs text-black/60">
                          {[s.role, s.company].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {s.topic && (
                        <p className="mt-1 text-xs italic text-black/70">
                          &ldquo;{s.topic}&rdquo;
                        </p>
                      )}
                      {s.bio && (
                        <p className="mt-1 text-xs text-black/50 line-clamp-3">
                          {s.bio}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Quick stats footer */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Mic2 className="h-4 w-4" />}
            value={event._count.speakers}
            label="Speakers"
          />
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            value={event._count.agenda}
            label="Agenda items"
          />
          <StatCard
            icon={<ImageIcon className="h-4 w-4" />}
            value={event._count.images}
            label="Images"
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            value={event._count.presentations}
            label="Presentations"
          />
        </div>

        {/* Public event link */}
        <div className="mt-8 rounded-xl bg-black/[0.02] border border-black/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-black/40 mb-0.5">
              Public event page
            </p>
            <p className="text-sm text-black/70">
              View this event as it appears to the community
            </p>
          </div>
          <Link
            href={`/events/${event.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#FF005A] hover:underline"
          >
            View public page
            <ArrowLeft className="h-3 w-3 rotate-180" />
          </Link>
        </div>
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>Platform by MassaPro</span>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 text-base font-bold text-black mb-3 pb-2 border-b border-black/10">
        <span className="text-[#FF005A]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Vital({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-shrink-0 mt-0.5 text-[#FF005A]">{icon}</div>
      <div>
        <p className="text-[0.65rem] uppercase tracking-wider text-black/40 font-semibold">
          {label}
        </p>
        <p className="text-sm font-medium text-black/80">{value}</p>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3 text-center">
      <div className="inline-flex items-center justify-center text-black/40 mb-1">
        {icon}
      </div>
      <div className="text-xl font-extrabold text-black">{value}</div>
      <div className="text-[0.65rem] uppercase tracking-wider text-black/40 font-semibold">
        {label}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-6 text-center">
      <AlertCircle className="h-6 w-6 text-black/20 mx-auto mb-2" />
      <p className="text-sm text-black/50">{message}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    TALK: "bg-[#FF005A]/10 text-[#FF005A]",
    PANEL: "bg-[#820A7D]/10 text-[#820A7D]",
    BREAK: "bg-black/5 text-black/60",
    NETWORKING: "bg-[#00E6FF]/15 text-[#007E72]",
    FAST_PITCH: "bg-[#FFB300]/15 text-[#8a5a00]",
    WELCOME: "bg-[#FF005A]/10 text-[#FF005A]",
  };
  const labels: Record<string, string> = {
    TALK: "Talk",
    PANEL: "Panel",
    BREAK: "Break",
    NETWORKING: "Networking",
    FAST_PITCH: "Fast pitch",
    WELCOME: "Welcome",
  };
  const colorClass = colors[type] || "bg-black/5 text-black/60";
  const label = labels[type] || type;
  return (
    <span
      className={`text-[0.6rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${colorClass}`}
    >
      {label}
    </span>
  );
}

// Suppress unused-import warning for CheckCircle2 — kept for future
// "RSVP confirmed" indicator.
void CheckCircle2;
