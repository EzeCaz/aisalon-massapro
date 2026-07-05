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
} from "lucide-react";
import { SaveToCalendar } from "@/components/events/save-to-calendar";

// ------------------------------------------------------------------
// Types — mirror the EventRsvp shape returned by /api/events/[slug]/rsvp
// ------------------------------------------------------------------

export type Rsvp = {
  id: string;
  status: string;
  source: string;
  checkInCode: string | null;
  checkedInAt: string | null;
  createdAt: string;
} | null;

type Props = {
  eventSlug: string;
  eventTitle: string;
  eventStartsAt: string;
  eventEndsAt: string;
  initialRsvp?: Rsvp;
  /** Optional event details for the "Save to Calendar" CTA shown after registration. */
  eventDescription?: string | null;
  eventVenue?: string | null;
  eventAddress?: string | null;
  eventCity?: string | null;
  eventCountry?: string | null;
};

// ------------------------------------------------------------------
// Helpers — must mirror the server-side check in
// /api/events/[slug]/check-in/route.ts
// ------------------------------------------------------------------

/**
 * Check-in window: opens 1h before startsAt, closes 6h after endsAt.
 * Server enforces the same window; this is just for client-side UX.
 */
function isWithinCheckInWindow(startsAt: string, endsAt: string, now: Date = new Date()): boolean {
  const open = new Date(startsAt).getTime() - 1 * 60 * 60 * 1000;
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

/**
 * RsvpCheckInCard
 * ----------------
 * Members-only event registration + day-of check-in widget.
 *
 * Renders one of four states based on RSVP + check-in status + time
 * relative to the event window:
 *
 *   1. NOT_RSVPED              → "Register to attend" button (POST /rsvp)
 *   2. RSVPED, window closed   → "You're registered" + countdown hint
 *   3. RSVPED, window open     → "I'm here — Check in" button (POST /check-in)
 *   4. CHECKED_IN              → Big green panel with unique entry code
 *
 * On the members-only /events/[slug] page, the user is ALWAYS logged in
 * (the page redirects to /login otherwise), so there's no anonymous
 * branch here — unlike the public /e/[slug] page.
 *
 * The unique check-in code is:
 *   - 8 chars from Crockford base32 (no I/L/O/U to avoid confusion)
 *   - Formatted as "XXXX-XXXX"
 *   - GLOBALLY unique across all events — door staff can scan without
 *     knowing which event the attendee is at
 *   - Idempotent — clicking "Check in" again returns the same code
 *
 * Used by door staff via /admin/check-in to verify entry and track
 * attendance across all events.
 */
export function RsvpCheckInCard({
  eventSlug,
  eventTitle,
  eventStartsAt,
  eventEndsAt,
  initialRsvp = null,
  eventDescription = null,
  eventVenue = null,
  eventAddress = null,
  eventCity = null,
  eventCountry = null,
}: Props) {
  // Server-passed initial state — avoids a flash of the wrong CTA.
  const [rsvp, setRsvp] = React.useState<Rsvp>(initialRsvp);
  const [registering, setRegistering] = React.useState(false);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());

  // Tick every minute so the "Check in" button appears/disappears at the
  // exact moment the window opens (within 60s granularity).
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Re-fetch RSVP state on mount — handles the case where the user just
  // registered on the public /e/[slug] page and came back here, or where
  // the server-rendered rsvp is stale.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventSlug}/rsvp`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.rsvp) setRsvp(data.rsvp);
      } catch {
        /* swallow — non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventSlug]);

  const windowOpen = isWithinCheckInWindow(eventStartsAt, eventEndsAt, now);
  const isPast = isPastEvent(eventEndsAt, now);
  const hasCheckedIn = !!rsvp?.checkInCode;
  const hasRsvped = !!rsvp && rsvp.status === "GOING";

  // ---- Action handlers ----

  async function handleRegister() {
    setRegistering(true);
    try {
      const res = await fetch(`/api/events/${eventSlug}/rsvp`, { method: "POST" });
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

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/events/${eventSlug}/check-in`, { method: "POST" });
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

  // ---------- State 4: Already checked in → show entry code ----------
  if (hasCheckedIn && rsvp?.checkInCode) {
    return (
      <div className="rounded-xl border-2 border-[#007E72]/30 bg-gradient-to-br from-[#007E72]/5 to-[#00E6FF]/5 p-5 space-y-3">
        <div className="flex items-center gap-2 text-[#007E72]">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-bold text-sm uppercase tracking-wider">You&apos;re checked in</span>
        </div>
        <p className="text-xs text-black/80 leading-relaxed">
          Show this code at the door to enter the venue. Keep it on your screen — door staff will scan it.
          This code is unique to you and tracks your attendance across all AI Salon events.
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
          onClick={handleCopyCode}
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

  // ---------- Past event ----------
  if (isPast) {
    return (
      <div className="rounded-xl border border-black/10 bg-black/[0.03] p-5 space-y-3">
        <div className="flex items-center gap-2 text-black/80">
          <AlertCircle className="h-5 w-5" />
          <span className="font-bold text-sm">This event has ended</span>
        </div>
        <p className="text-xs text-black/80 leading-relaxed">
          Registration and check-in are closed. Browse the Photos, Slideshow, and Presentations tabs
          to revisit the event.
        </p>
      </div>
    );
  }

  // ---------- State 1: Not yet registered ----------
  if (!hasRsvped) {
    return (
      <div className="rounded-xl border-2 border-[#FF005A]/20 bg-gradient-to-br from-[#FF005A]/5 to-white p-5 space-y-3">
        <div className="flex items-center gap-2 text-[#FF005A]">
          <Ticket className="h-5 w-5" />
          <span className="font-bold text-sm uppercase tracking-wider">Register to attend</span>
        </div>
        <p className="text-xs text-black/70 leading-relaxed">
          Click below to confirm your spot at this event. We&apos;ll see you at the venue!
        </p>
        <button
          type="button"
          onClick={handleRegister}
          disabled={registering}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-3 text-sm hover:bg-[#FF005A]/90 disabled:opacity-50 ais-lift"
        >
          {registering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Registering…
            </>
          ) : (
            <>
              Register to event <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        {windowOpen && (
          <div className="pt-2 border-t border-black/10 space-y-2">
            <p className="text-[0.65rem] text-[#007E72] font-semibold uppercase tracking-wider">
              Event day is here
            </p>
            <p className="text-xs text-black/80 leading-relaxed">
              Already registered? Click below to check in and get your entry code.
            </p>
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={checkingIn}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#007E72]/40 bg-white text-[#007E72] font-semibold px-4 py-2.5 text-sm hover:bg-[#007E72]/5 disabled:opacity-50"
            >
              {checkingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking in…
                </>
              ) : (
                <>
                  <CalendarCheck className="h-4 w-4" /> I&apos;m here — Check in
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- State 2/3: Registered, not yet checked in ----------
  return (
    <div className="rounded-xl border-2 border-[#00E6FF]/30 bg-gradient-to-br from-[#00E6FF]/5 to-white p-5 space-y-3">
      <div className="flex items-center gap-2 text-[#007E72]">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-bold text-sm uppercase tracking-wider">You&apos;re registered</span>
      </div>
      <p className="text-xs text-black/70 leading-relaxed">
        See you on <strong>{fmtDate(new Date(eventStartsAt))}</strong> at{" "}
        <strong className="font-mono">{fmtTime(new Date(eventStartsAt))}</strong>.
      </p>

      {/* Save to Calendar CTA — shown immediately after registration so
          the user can add the event to their calendar right away. */}
      <SaveToCalendar
        event={{
          title: eventTitle,
          description: eventDescription,
          startsAt: eventStartsAt,
          endsAt: eventEndsAt,
          venue: eventVenue,
          address: eventAddress,
          city: eventCity,
          country: eventCountry,
          url: typeof window !== "undefined" ? window.location.href : null,
        }}
        variant="outline"
        size="sm"
        className="w-full justify-center"
      />

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
            onClick={handleCheckIn}
            disabled={checkingIn}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#007E72] text-white font-semibold px-4 py-3 text-sm hover:bg-[#007E72]/90 disabled:opacity-50 ais-lift"
          >
            {checkingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Checking in…
              </>
            ) : (
              <>
                <CalendarCheck className="h-4 w-4" /> I&apos;m here — Check in
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="pt-2 border-t border-black/10 space-y-1.5">
          <p className="text-[0.65rem] text-black/80 leading-relaxed">
            The check-in button will appear here <strong>1 hour before</strong> the event starts.
          </p>
          <div className="flex items-center gap-1.5 text-[0.65rem] text-black/50">
            <Calendar className="h-3 w-3" />
            <span>{fmtDate(new Date(eventStartsAt))}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[0.65rem] text-black/50">
            <Clock className="h-3 w-3" />
            <span className="font-mono">{fmtTime(new Date(eventStartsAt))} TLV</span>
          </div>
        </div>
      )}
    </div>
  );
}
