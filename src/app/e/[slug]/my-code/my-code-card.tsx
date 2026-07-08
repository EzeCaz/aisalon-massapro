"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Ticket,
  Loader2,
  ArrowRight,
  CheckCircle2,
  CalendarCheck,
  Copy,
  Check,
  AlertCircle,
  Calendar,
  Clock,
  ArrowLeft,
} from "lucide-react";

// ------------------------------------------------------------------
// Types — mirror what the server component passes in.
// ------------------------------------------------------------------

type EventData = {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  city: string | null;
  mainImageUrl: string | null;
};

type Me = {
  id: string;
  email: string;
  name: string | null;
};

type Rsvp = {
  id: string;
  status: string;
  checkInCode: string | null;
  checkedInAt: string | null;
} | null;

type Props = {
  event: EventData;
  me: Me;
  initialRsvp: Rsvp;
};

// ------------------------------------------------------------------
// Helpers — must mirror the server-side check in
// /api/events/[slug]/check-in/route.ts
// ------------------------------------------------------------------

/**
 * Check-in window: opens 2h before startsAt, closes 6h after endsAt.
 * Server enforces the same window; this is just for client-side UX.
 */
function isWithinCheckInWindow(startsAt: string, endsAt: string, now: Date = new Date()): boolean {
  const open = new Date(startsAt).getTime() - 2 * 60 * 60 * 1000;
  const close = new Date(endsAt).getTime() + 6 * 60 * 60 * 1000;
  return now.getTime() >= open && now.getTime() <= close;
}

function isPastEvent(endsAt: string, now: Date = new Date()): boolean {
  return new Date(endsAt).getTime() < now.getTime();
}

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

function msUntilOpen(startsAt: string): number {
  return new Date(startsAt).getTime() - 2 * 60 * 60 * 1000 - Date.now();
}

/**
 * MyCodeCard — focused, mobile-first card for the /e/[slug]/my-code page.
 *
 * Renders one of four states (mirrors RsvpCheckInCard but with a bigger,
 * single-focus layout since this page has nothing else on it):
 *
 *   1. NOT_RSVPED              → "You're not registered" + CTA to register
 *   2. RSVPED, window closed   → "Check-in opens 2h before the event" + countdown
 *   3. RSVPED, window open     → "I'm here — Check in" button
 *   4. CHECKED_IN              → BIG code + copy button (primary case)
 *
 * The unique check-in code is the same one shown on /events/[slug] — both
 * pages read from the same EventRsvp row via the same API. Checking in on
 * either page is reflected on the other.
 */
export function MyCodeCard({ event, me, initialRsvp }: Props) {
  const [rsvp, setRsvp] = React.useState<Rsvp>(initialRsvp);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [now, setNow] = React.useState<Date | null>(null);

  // Live-update "now" every 30s so countdown stays fresh without re-fetching.
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hasCheckedIn = !!rsvp?.checkInCode;
  const windowOpen = isWithinCheckInWindow(event.startsAt, event.endsAt, now ?? new Date(0));
  const past = isPastEvent(event.endsAt, now ?? new Date(0));

  // ── Actions ─────────────────────────────────────────────────────────────

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/events/${event.slug}/check-in`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not check in. Please try again.");
        return;
      }
      setRsvp({
        id: data.rsvp.id,
        status: "GOING",
        checkInCode: data.rsvp.checkInCode,
        checkedInAt: data.rsvp.checkedInAt,
      });
      toast.success("You're checked in! Show this code at the door.");
    } catch (err) {
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
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please long-press the code to copy manually.");
    }
  }

  // ── State 4: Already checked in → show entry code (PRIMARY case) ────────
  if (hasCheckedIn && rsvp?.checkInCode) {
    return (
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#007E72]/10 border border-[#007E72]/30 px-3 py-1 text-[#007E72]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-bold text-xs uppercase tracking-wider">You&apos;re checked in</span>
          </div>
          <h1 className="text-2xl font-extrabold text-black leading-tight">{event.title}</h1>
          {event.venue && (
            <p className="text-sm text-black/60">
              {event.venue}
              {event.city ? ` · ${event.city}` : ""}
            </p>
          )}
        </div>

        <div className="rounded-2xl border-2 border-[#007E72]/40 bg-white p-6 text-center shadow-sm">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-black/60 mb-2">
            Your entry code
          </div>
          <div className="text-5xl sm:text-6xl font-extrabold font-mono tracking-[0.15em] text-[#007E72] leading-tight break-all">
            {rsvp.checkInCode}
          </div>
          {rsvp.checkedInAt && (
            <div className="mt-3 text-xs text-black/60">
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
          onClick={handleCopyCode}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-black/15 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-black/[0.03] ais-lift"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy code
            </>
          )}
        </button>

        <p className="text-center text-xs text-black/50 leading-relaxed px-2">
          Show this code at the door. This code is unique to you and tracks your attendance across all AI Salon events.
        </p>
      </div>
    );
  }

  // ── State 1: Not registered ─────────────────────────────────────────────
  if (!rsvp) {
    return (
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1 text-black/70">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="font-bold text-xs uppercase tracking-wider">Not registered</span>
          </div>
          <h1 className="text-2xl font-extrabold text-black leading-tight">{event.title}</h1>
        </div>

        <div className="rounded-2xl border-2 border-[#FF005A]/20 bg-gradient-to-br from-[#FF005A]/5 to-white p-6 space-y-4">
          <p className="text-sm text-black/80 leading-relaxed">
            You don&apos;t have an RSVP for this event yet. Register first, then come back here on the day of the event to get your entry code.
          </p>
          <a
            href={`/e/${event.slug}`}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF005A] text-white font-semibold px-4 py-3 text-sm hover:bg-[#FF005A]/90 ais-lift"
          >
            Register to event <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  // ── State 2/3: Registered, not yet checked in ───────────────────────────
  // Sub-state: event is in the past
  if (past) {
    return (
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-extrabold text-black leading-tight">{event.title}</h1>
        </div>
        <div className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center space-y-2">
          <Calendar className="h-8 w-8 text-black/40 mx-auto" />
          <p className="text-sm text-black/70">
            This event has ended. Check-in is no longer available.
          </p>
        </div>
        <a
          href="/events"
          className="block text-center text-sm text-black/60 hover:text-black underline"
        >
          See upcoming events
        </a>
      </div>
    );
  }

  // Sub-state: window not yet open — show countdown
  if (!windowOpen) {
    const msLeft = msUntilOpen(event.startsAt);
    const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
    const minsLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));
    const opensSoon = msLeft > 0 && msLeft <= 6 * 60 * 60 * 1000; // within 6h

    return (
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#00E6FF]/10 border border-[#00E6FF]/30 px-3 py-1 text-[#007E72]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-bold text-xs uppercase tracking-wider">You&apos;re registered</span>
          </div>
          <h1 className="text-2xl font-extrabold text-black leading-tight">{event.title}</h1>
          <p className="text-sm text-black/60">
            {fmtDate(new Date(event.startsAt))} ·{" "}
            <span className="font-mono">{fmtTime(new Date(event.startsAt))}</span>
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[#00E6FF]/30 bg-gradient-to-br from-[#00E6FF]/5 to-white p-6 text-center space-y-3">
          <Clock className="h-8 w-8 text-[#007E72] mx-auto" />
          <p className="text-sm text-black/80 leading-relaxed">
            Check-in opens <strong>2 hours before</strong> the event starts.
          </p>
          {opensSoon && (
            <div className="rounded-lg bg-[#007E72]/10 px-4 py-2 text-sm font-mono text-[#007E72]">
              Opens in {hoursLeft}h {minsLeft}m
            </div>
          )}
          <p className="text-xs text-black/50">
            Come back to this page on the day of the event — the button will appear here automatically.
          </p>
        </div>

        <a
          href={`/e/${event.slug}`}
          className="block text-center text-sm text-black/60 hover:text-black underline"
        >
          View event details
        </a>
      </div>
    );
  }

  // Sub-state: window is open — show check-in button
  return (
    <div className="w-full max-w-md space-y-4">
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#00E6FF]/10 border border-[#00E6FF]/30 px-3 py-1 text-[#007E72]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="font-bold text-xs uppercase tracking-wider">You&apos;re registered</span>
        </div>
        <h1 className="text-2xl font-extrabold text-black leading-tight">{event.title}</h1>
        <p className="text-sm text-black/60">
          {event.venue}
          {event.city ? ` · ${event.city}` : ""}
        </p>
      </div>

      <div className="rounded-2xl border-2 border-[#007E72]/30 bg-gradient-to-br from-[#007E72]/5 to-[#00E6FF]/5 p-6 space-y-4">
        <p className="text-sm text-black/80 leading-relaxed text-center">
          You&apos;re at the venue? Tap below to reveal your entry code.
        </p>
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={checkingIn}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#007E72] text-white font-bold px-4 py-4 text-base hover:bg-[#007E72]/90 disabled:opacity-50 ais-lift"
        >
          {checkingIn ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Checking in…
            </>
          ) : (
            <>
              <CalendarCheck className="h-5 w-5" /> I&apos;m here — Check in
            </>
          )}
        </button>
      </div>

      <a
        href={`/e/${event.slug}`}
        className="inline-flex items-center justify-center gap-1 text-sm text-black/60 hover:text-black underline w-full"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to event details
      </a>
    </div>
  );
}
