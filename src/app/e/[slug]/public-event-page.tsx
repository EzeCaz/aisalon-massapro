"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Target,
  Gift,
  Check,
  Ticket,
  Loader2,
  ArrowRight,
  CheckCircle2,
  CalendarCheck,
  Share2,
  Copy,
  AlertCircle,
  Mic2,
} from "lucide-react";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";

// ------------------------------------------------------------------
// Types — mirror the include shape of the server component.
// ------------------------------------------------------------------

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl: string | null;
};

type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  description: string | null;
  type: string;
  speaker: { id: string; name: string; role: string | null; company: string | null; photoUrl: string | null } | null;
  panelists?: { id: string; name: string; role: string | null; company: string | null; photoUrl: string | null }[];
};

type Rsvp = {
  id: string;
  status: string;
  source: string;
  checkInCode: string | null;
  checkedInAt: string | null;
  createdAt: string;
} | null;

type Event = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  mapUrl: string | null;
  wazeUrl: string | null;
  startsAt: string;
  endsAt: string;
  description: string | null;
  takeaways: string | null;
  intendedFor: string | null;
  rsvpUrl: string | null;
  mainImage: { id: string; fileUrl: string; caption: string | null } | null;
  speakers: Speaker[];
  agenda: AgendaItem[];
  _count: { speakers: number; agenda: number; rsvps: number };
  // GOING-only count (status="GOING") — used by the black "X Going"
  // pill in the meta line. Distinct from _count.rsvps which is the
  // total of ALL RSVP statuses.
  rsvpsGoing: number;
  rsvp: Rsvp;
};

type Me = { id: string; email: string; name: string | null; utmUid: string | null } | null;

type Props = { event: Event; me: Me };

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}
function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
function fmtMonth(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", month: "short" })
    .format(d)
    .toUpperCase();
}
function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", day: "2-digit" }).format(d);
}
function fmtYear(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric" }).format(d);
}

/**
 * Check whether the current time falls inside the event-day window.
 * MUST match the server-side check in /api/events/[slug]/check-in/route.ts.
 *
 * Window: [startsAt - 2h, endsAt + 6h]
 *   - opens 2 hours before the event starts (per user spec)
 *   - closes 6 hours after the event ends (for late arrivals)
 */
function isWithinCheckInWindow(startsAt: string, endsAt: string, now: Date = new Date()): boolean {
  const open = new Date(startsAt).getTime() - 2 * 60 * 60 * 1000;
  const close = new Date(endsAt).getTime() + 6 * 60 * 60 * 1000;
  return now.getTime() >= open && now.getTime() <= close;
}

function isPastEvent(endsAt: string, now: Date = new Date()): boolean {
  return new Date(endsAt).getTime() < now.getTime();
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

export function PublicEventPage({ event, me }: Props) {
  const router = useRouter();
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  const [rsvp, setRsvp] = React.useState<Rsvp>(event.rsvp);
  const [registering, setRegistering] = React.useState(false);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${event.slug}/rsvp`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.rsvp) setRsvp(data.rsvp);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.slug]);

  const windowOpen = isWithinCheckInWindow(event.startsAt, event.endsAt, now);
  const isPast = isPastEvent(event.endsAt, now);
  const hasCheckedIn = !!rsvp?.checkInCode;
  const hasRsvped = !!rsvp && rsvp.status === "GOING";

  async function handleRegisterClick() {
    if (!me) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/e/${event.slug}`)}`);
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch(`/api/events/${event.slug}/rsvp`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || `Could not register (HTTP ${res.status}).`);
        return;
      }
      setRsvp(data.rsvp);
      toast.success("You're registered! See you at the event.");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleCheckInClick() {
    if (!me) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/e/${event.slug}`)}`);
      return;
    }
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/events/${event.slug}/check-in`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || `Could not check in (HTTP ${res.status}).`);
        return;
      }
      setRsvp((prev) => ({
        id: data.rsvp.id,
        status: prev?.status || "GOING",
        source: prev?.source || "EVENT_PAGE",
        checkInCode: data.rsvp.checkInCode,
        checkedInAt: data.rsvp.checkedInAt,
        createdAt: prev?.createdAt || new Date().toISOString(),
      }));
      toast.success("Checked in! Show your code at the door.");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleCopyCode() {
    if (!rsvp?.checkInCode) return;
    try {
      await navigator.clipboard.writeText(rsvp.checkInCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* swallow */
    }
  }

  async function handleShare() {
    // Build a share URL with the member's utm_uid appended so visits
    // + signups + RSVPs are attributed back to them on /admin/analytics.
    // Anonymous visitors get a plain URL (no utm_uid) — they can still
    // share, they just don't get credit.
    //
    // We share /events/[slug] (the authenticated member view) rather than
    // /e/[slug] because /events/[slug] auto-redirects anonymous visitors
    // to /e/[slug] (the public landing page) — so logged-out recipients
    // still get the public experience, while logged-in ones go straight
    // to the full member event page. This matches the URLs shown in the
    // ReferralShareCard on /events/[slug].
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const path = `/events/${event.slug}`;
    let url: string;
    if (me?.utmUid) {
      const u = new URL(path, baseUrl || "https://aisalon.massapro.com");
      u.searchParams.set("utm_source", "member");
      u.searchParams.set("utm_medium", "referral");
      u.searchParams.set("utm_campaign", "aisalon");
      u.searchParams.set("utm_uid", me.utmUid);
      url = u.toString();
    } else {
      url = typeof window !== "undefined" ? window.location.href : path;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(me?.utmUid ? "Referral link copied — you'll get credit for signups!" : "Link copied to clipboard.");
      }
    } catch {
      /* swallow */
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicHeader me={me} />

      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          {event.mainImage?.fileUrl && (
            <div className="mb-8 overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-sm">
              <div className="relative w-full aspect-[16/9] max-h-96">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.mainImage.fileUrl}
                  alt={event.mainImage.caption || event.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
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
                <span className="text-black/80">{fmtDate(start)}</span>
                <span className="text-black/20">·</span>
                <span className="text-black/80 font-mono">
                  {fmtTime(start)} – {fmtTime(end)}
                </span>
                {event.country && <span className="text-black/80">· {event.country}</span>}
                {/* Going pill — black bg, white text. Matches the spec:
                    "Tel Aviv Monday, July 13, 2026 · 18:00 – 21:30 · ISR · 14 Going"
                    where "14 Going" is a black pill with white text. */}
                <span className="inline-flex items-center gap-1 rounded-full bg-black text-white px-2.5 py-0.5 font-bold uppercase tracking-wider">
                  <Users className="h-3 w-3" />
                  {event.rsvpsGoing} Going
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
                {event.title}
              </h1>
              {event.subtitle && <p className="mt-2 text-lg text-black/80">{event.subtitle}</p>}

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

              <div className="mt-4 flex items-center gap-4 text-xs text-black/50">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {event._count.rsvps} registered
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mic2 className="h-3.5 w-3.5" />
                  {event._count.speakers} speaker{event._count.speakers === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1 text-black/80 hover:text-black"
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-center">
              <div className="w-28 text-center rounded-xl overflow-hidden border border-black/15 bg-white">
                <div className="ais-gradient h-2" />
                <div className="p-4">
                  <div className="text-[0.7rem] font-bold uppercase tracking-widest text-[#FF005A]">
                    {fmtMonth(start)}
                  </div>
                  <div className="text-5xl font-extrabold text-black leading-none my-1">{fmtDay(start)}</div>
                  <div className="text-[0.9rem] font-semibold uppercase tracking-wider text-black/90">
                    {fmtYear(start)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[0.85rem] font-mono text-black/90">
                {fmtTime(start)} – {fmtTime(end)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === Prominent below-hero CTA — visible on ALL screen sizes ===
          Per user spec 2026-07-10: "below all events hero image there
          must be either a register button or the already registered flow
          with the add to calendar/checkin flow". On mobile, the sidebar
          aside is rendered far below the long content sections, so users
          who only see the hero + title would have no visible register
          CTA. This block fixes that by re-rendering the same CtaCard
          right below the hero, full-width, with extra visual weight on
          small screens. The sticky aside on desktop keeps its existing
          copy. Both share state (rsvp, registering, etc.) from the
          parent so a click in either updates both. */}
      <section className="border-b border-black/10 bg-white lg:hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <CtaCard
            event={event}
            me={me}
            rsvp={rsvp}
            windowOpen={windowOpen}
            isPast={isPast}
            hasRsvped={hasRsvped}
            hasCheckedIn={hasCheckedIn}
            registering={registering}
            checkingIn={checkingIn}
            copied={copied}
            onRegister={handleRegisterClick}
            onCheckIn={handleCheckInClick}
            onCopyCode={handleCopyCode}
          />
        </div>
      </section>

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-[1fr_360px] gap-10">
          <div className="space-y-10 min-w-0">
            {event.description && (
              <Section title="About this event" accent="#FF005A">
                <p className="text-black/80 leading-relaxed whitespace-pre-line">{event.description}</p>
              </Section>
            )}

            {event.takeaways && (
              <Section title="What you'll take home" accent="#007E72" icon={<Gift className="h-4 w-4" />}>
                <ul className="space-y-2">
                  {event.takeaways
                    .split("\n")
                    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
                    .filter(Boolean)
                    .map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-black/80">
                        <Check className="h-4 w-4 mt-0.5 text-[#007E72] flex-shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                </ul>
              </Section>
            )}

            {event.intendedFor && (
              <Section title="Who this is for" accent="#004F98" icon={<Target className="h-4 w-4" />}>
                <p className="text-black/80 leading-relaxed whitespace-pre-line">{event.intendedFor}</p>
              </Section>
            )}

            {event.speakers.length > 0 && (
              <Section title="Speakers" accent="#820A7D" icon={<Mic2 className="h-4 w-4" />}>
                <div className="grid sm:grid-cols-2 gap-4">
                  {event.speakers.map((s) => (
                    <SpeakerCard key={s.id} speaker={s} />
                  ))}
                </div>
              </Section>
            )}

            {event.agenda.length > 0 && (
              <Section title="Agenda" accent="#004F98" icon={<Calendar className="h-4 w-4" />}>
                <ol className="relative border-l-2 border-black/10 ml-3 space-y-5">
                  {event.agenda.map((a) => {
                    const aStart = new Date(a.startsAt);
                    return (
                      <li key={a.id} className="pl-5 relative">
                        <span
                          className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${typeColor(
                            a.type
                          )}`}
                        />
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-xs font-mono text-black/50">{fmtTime(aStart)}</span>
                          {a.endsAt && (
                            <span className="text-xs font-mono text-black/80">
                              – {fmtTime(new Date(a.endsAt))}
                            </span>
                          )}
                          <span
                            className={`text-[0.55rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeBadgeClass(
                              a.type
                            )}`}
                          >
                            {typeLabel(a.type)}
                          </span>
                        </div>
                        <h4 className="font-semibold text-black mt-1">{a.title}</h4>
                        {a.speaker && (
                          <p
                            className={`text-xs mt-0.5 ${
                              a.type === "PANEL" ? "text-[#7C3AED]" : "text-black/80"
                            }`}
                          >
                            {a.type === "PANEL" && (
                              <span className="font-bold">Moderator: </span>
                            )}
                            {a.speaker.name}
                            {a.speaker.role ? ` · ${a.speaker.role}` : ""}
                            {a.speaker.company ? ` · ${a.speaker.company}` : ""}
                          </p>
                        )}
                        {a.type === "PANEL" &&
                          a.panelists &&
                          a.panelists.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {a.panelists.map((p) => {
                                const initials = p.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase();
                                return (
                                  <span
                                    key={p.id}
                                    className="inline-flex items-center gap-1 rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/5 px-2 py-0.5 text-[0.65rem] font-semibold text-[#7C3AED]"
                                  >
                                    {p.photoUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={p.photoUrl}
                                        alt={p.name}
                                        className="h-4 w-4 rounded-full object-cover flex-shrink-0"
                                      />
                                    ) : (
                                      <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#7C3AED]/20 text-[#7C3AED] text-[0.5rem] font-bold flex-shrink-0">
                                        {initials || "?"}
                                      </span>
                                    )}
                                    {p.name}
                                    {(p.role || p.company) && (
                                      <span className="text-[#7C3AED]/60 font-normal">
                                        {p.role && ` · ${p.role}`}
                                        {p.company && ` · ${p.company}`}
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        {a.description && (
                          <p className="text-sm text-black/70 mt-1 leading-relaxed">{a.description}</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </Section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 h-fit space-y-4">
            <CtaCard
              event={event}
              me={me}
              rsvp={rsvp}
              windowOpen={windowOpen}
              isPast={isPast}
              hasRsvped={hasRsvped}
              hasCheckedIn={hasCheckedIn}
              registering={registering}
              checkingIn={checkingIn}
              copied={copied}
              onRegister={handleRegisterClick}
              onCheckIn={handleCheckInClick}
              onCopyCode={handleCopyCode}
            />

            <div className="rounded-xl border border-black/10 bg-white p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-black/80 mb-4">Event details</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-black/80 flex-shrink-0" />
                  <div>
                    <dt className="text-black/80 text-xs">Date</dt>
                    <dd className="font-semibold text-black">{fmtDate(start)}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 text-black/80 flex-shrink-0" />
                  <div>
                    <dt className="text-black/80 text-xs">Time</dt>
                    <dd className="font-semibold text-black font-mono">
                      {fmtTime(start)} – {fmtTime(end)}
                    </dd>
                  </div>
                </div>
                {event.venue && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5 text-black/80 flex-shrink-0" />
                    <div>
                      <dt className="text-black/80 text-xs">Venue</dt>
                      <dd className="font-semibold text-black">{event.venue}</dd>
                      {event.address && <dd className="text-black/80 text-xs">{event.address}</dd>}
                    </div>
                  </div>
                )}
              </dl>
              {event.mapUrl && (
                <a
                  href={event.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 block w-full rounded-md bg-black text-white text-sm font-semibold py-2.5 text-center hover:bg-black/90"
                >
                  Open in Maps
                </a>
              )}
              {event.wazeUrl && (
                <a
                  href={event.wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block w-full rounded-md bg-[#33CCFF] text-black text-sm font-semibold py-2.5 text-center hover:bg-[#33CCFF]/90"
                >
                  Open in Waze
                </a>
              )}
            </div>

            <div className="rounded-xl border border-[#00E6FF]/30 bg-[#00E6FF]/5 p-5">
              <p className="text-xs text-black/70 leading-relaxed">
                <strong className="text-black">Members-only community.</strong> Photos, presentations, and
                recordings from this event are shared with registered AI Salon Tel Aviv members. Sign in to
                access the full event experience including the photo gallery, speaker chat, and community
                slideshow.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function PublicHeader({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/events" className="flex items-center gap-2">
            <AiSalonLogoServer variant="horizontal-tagline" className="text-[1.05rem]" />
            <span className="hidden sm:inline-block ml-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-black/80 border-l border-black/15 pl-3">
              Tel Aviv Chapter
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {me ? (
              <Link
                href="/events"
                className="px-3 py-1.5 text-sm font-semibold text-black/70 hover:text-black hover:bg-black/5 rounded-md transition-colors"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 sm:px-3 py-2 sm:py-1.5 text-sm sm:text-sm font-semibold text-black/70 hover:text-black hover:bg-black/5 rounded-md transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/login"
                  className="px-4 sm:px-3 py-2 sm:py-1.5 text-sm sm:text-sm font-semibold bg-[#FF005A] text-white rounded-md hover:bg-[#FF005A]/90 transition-colors shadow-sm sm:shadow-none"
                >
                  Join the community
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-black/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
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
  );
}

function Section({
  title,
  accent,
  icon,
  children,
}: {
  title: string;
  accent: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-4" style={{ color: accent }}>
        {icon}
        {title}
      </h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function SpeakerCard({ speaker }: { speaker: Speaker }) {
  const initial = speaker.name.charAt(0).toUpperCase();
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 flex gap-3">
      <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-black/5 border border-black/10">
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={speaker.photoUrl} alt={speaker.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-bold text-black/80">
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-black text-sm">{speaker.name}</div>
        {speaker.role && <div className="text-xs text-black/80">{speaker.role}</div>}
        {speaker.company && <div className="text-xs text-black/50">{speaker.company}</div>}
        {speaker.topic && (
          <div className="mt-1.5 text-xs text-[#820A7D] font-medium italic">"{speaker.topic}"</div>
        )}
        {speaker.bio && <p className="mt-1.5 text-xs text-black/70 line-clamp-3">{speaker.bio}</p>}
      </div>
    </div>
  );
}

/**
 * The sticky call-to-action card on the right side of the page.
 *
 * Renders one of four states based on the user's session + RSVP + check-in:
 *
 *   1. NOT_LOGGED_IN → "Register to event" (routes to /login?callbackUrl=…)
 *   2. LOGGED_IN, NO_RSVP → "Register to event" (POST /api/events/[slug]/rsvp)
 *   3. LOGGED_IN + RSVP, NOT_CHECKED_IN → "You're registered" + check-in button
 *      (only shown if windowOpen is true; otherwise just "You're registered")
 *   4. LOGGED_IN + CHECKED_IN → Big green panel showing the unique code
 */
function CtaCard({
  event,
  me,
  rsvp,
  windowOpen,
  isPast,
  hasRsvped,
  hasCheckedIn,
  registering,
  checkingIn,
  copied,
  onRegister,
  onCheckIn,
  onCopyCode,
}: {
  event: Event;
  me: Me;
  rsvp: Rsvp;
  windowOpen: boolean;
  isPast: boolean;
  hasRsvped: boolean;
  hasCheckedIn: boolean;
  registering: boolean;
  checkingIn: boolean;
  copied: boolean;
  onRegister: () => void;
  onCheckIn: () => void;
  onCopyCode: () => void;
}) {
  // ---------- State 4: Already checked in → show entry code ----------
  if (hasCheckedIn && rsvp?.checkInCode) {
    return (
      <div className="rounded-xl border-2 border-[#007E72]/30 bg-gradient-to-br from-[#007E72]/5 to-[#00E6FF]/5 p-5 space-y-3">
        <div className="flex items-center gap-2 text-[#007E72]">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-bold text-sm uppercase tracking-wider">You're checked in</span>
        </div>
        <p className="text-xs text-black/80 leading-relaxed">
          Show this code at the door to enter the venue. Keep it on your screen — door staff will scan it.
        </p>
        <div className="rounded-lg bg-white border-2 border-[#007E72]/40 p-4 text-center">
          <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/80 mb-1">
            Your entry code
          </div>
          <div className="text-3xl font-extrabold font-mono tracking-[0.15em] text-[#007E72]">
            {rsvp.checkInCode}
          </div>
          {rsvp.checkedInAt && (
            <div className="mt-2 text-[0.6rem] text-black/80">
              Checked in at{" "}
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Jerusalem",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                day: "2-digit",
                month: "short",
              }).format(new Date(rsvp.checkedInAt))}{" "}
              TLV
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCopyCode}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-black/[0.03]"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy code
            </>
          )}
        </button>
      </div>
    );
  }

  // ---------- Past event → recap messaging ----------
  if (isPast) {
    return (
      <div className="rounded-xl border border-black/10 bg-black/[0.03] p-5 space-y-3">
        <div className="flex items-center gap-2 text-black/80">
          <AlertCircle className="h-5 w-5" />
          <span className="font-bold text-sm">This event has ended</span>
        </div>
        {me ? (
          <p className="text-xs text-black/80 leading-relaxed">
            Visit the members-only event page to view the photo gallery, presentations, and recap.
          </p>
        ) : (
          <p className="text-xs text-black/80 leading-relaxed">
            Sign in to access the photo gallery, presentations, and recap from this event.
          </p>
        )}
        {me && (
          <Link
            href={`/events/${event.slug}`}
            className="block w-full text-center rounded-md bg-black text-white text-sm font-semibold py-2.5 hover:bg-black/90"
          >
            View recap & photos
          </Link>
        )}
      </div>
    );
  }

  // ---------- State 1/2: Not yet registered ----------
  if (!hasRsvped) {
    return (
      <div className="rounded-xl border-2 border-[#FF005A]/20 bg-gradient-to-br from-[#FF005A]/5 to-white p-5 space-y-3">
        <div className="flex items-center gap-2 text-[#FF005A]">
          <Ticket className="h-5 w-5" />
          <span className="font-bold text-sm uppercase tracking-wider">
            {me ? "Register to attend" : "Join AI Salon"}
          </span>
        </div>
        <p className="text-xs text-black/70 leading-relaxed">
          {me
            ? "Click below to confirm your spot. We'll see you at the venue!"
            : "Sign in or create a free account to reserve your spot at this event."}
        </p>
        <button
          type="button"
          onClick={onRegister}
          disabled={registering}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-3 text-sm hover:bg-[#FF005A]/90 disabled:opacity-50 ais-lift"
        >
          {registering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Registering…
            </>
          ) : (
            <>
              {me ? "Register to event" : "Join AI Salon"} <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        {!me && (
          <p className="text-[0.65rem] text-black/80 text-center">
            New here? You'll be able to create an account on the next screen.
          </p>
        )}
      </div>
    );
  }

  // ---------- State 3: Registered, not yet checked in ----------
  return (
    <div className="rounded-xl border-2 border-[#00E6FF]/30 bg-gradient-to-br from-[#00E6FF]/5 to-white p-5 space-y-3">
      <div className="flex items-center gap-2 text-[#007E72]">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-bold text-sm uppercase tracking-wider">You're registered</span>
      </div>
      <p className="text-xs text-black/70 leading-relaxed">
        See you on <strong>{fmtDate(new Date(event.startsAt))}</strong> at{" "}
        <strong className="font-mono">{fmtTime(new Date(event.startsAt))}</strong>.
      </p>

      {windowOpen ? (
        <div className="pt-2 border-t border-black/10 space-y-2">
          <p className="text-[0.65rem] text-[#007E72] font-semibold uppercase tracking-wider">
            Event day is here
          </p>
          <p className="text-xs text-black/80 leading-relaxed">
            Click below to check in and get your unique entry code for the door.
          </p>
          <button
            type="button"
            onClick={onCheckIn}
            disabled={checkingIn}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#007E72] text-white font-semibold px-4 py-3 text-sm hover:bg-[#007E72]/90 disabled:opacity-50 ais-lift"
          >
            {checkingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Checking in…
              </>
            ) : (
              <>
                <CalendarCheck className="h-4 w-4" /> I'm here — Check in
              </>
            )}
          </button>
        </div>
      ) : (
        <p className="text-[0.65rem] text-black/80 leading-relaxed pt-2 border-t border-black/10">
          The check-in button will appear here 2 hours before the event starts.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Agenda type helpers
// ------------------------------------------------------------------

function typeColor(type: string): string {
  switch (type) {
    case "TALK":
      return "bg-[#FF005A]";
    case "BREAK":
      return "bg-black/30";
    case "NETWORKING":
      return "bg-[#00E6FF]";
    case "FAST_PITCH":
      return "bg-[#820A7D]";
    case "WELCOME":
      return "bg-[#004F98]";
    case "PANEL":
      return "bg-[#7C3AED]";
    default:
      return "bg-black/40";
  }
}
function typeBadgeClass(type: string): string {
  switch (type) {
    case "TALK":
      return "bg-[#FF005A]/10 text-[#FF005A]";
    case "BREAK":
      return "bg-black/5 text-black/50";
    case "NETWORKING":
      return "bg-[#00E6FF]/10 text-[#007E72]";
    case "FAST_PITCH":
      return "bg-[#820A7D]/10 text-[#820A7D]";
    case "WELCOME":
      return "bg-[#004F98]/10 text-[#004F98]";
    case "PANEL":
      return "bg-[#7C3AED]/10 text-[#7C3AED]";
    default:
      return "bg-black/5 text-black/80";
  }
}
function typeLabel(type: string): string {
  switch (type) {
    case "TALK":
      return "Talk";
    case "BREAK":
      return "Break";
    case "NETWORKING":
      return "Networking";
    case "FAST_PITCH":
      return "Fast pitch";
    case "WELCOME":
      return "Welcome";
    case "PANEL":
      return "Panel";
    default:
      return type;
  }
}
