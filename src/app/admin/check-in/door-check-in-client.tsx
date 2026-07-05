"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  QrCode,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  RotateCcw,
  AlertCircle,
  ShieldAlert,
  UserCheck,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────
// Types — shared between lookup (GET) and confirm (POST) responses
// ────────────────────────────────────────────────────────────────────

type RsvpUser = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  photoUrl: string | null;
  image: string | null;
  bio: string | null;
};

type RsvpEvent = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  address: string | null;
  city: string | null;
};

type RsvpPayload = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  checkInCode: string;
  checkedInAt: string | null;
  doorCheckedAt: string | null;
  doorCheckedBy: string | null;
  createdAt: string;
  user: RsvpUser | null;
  event: RsvpEvent;
};

type LookupResult =
  | {
      found: false;
      normalized?: string;
      message?: string;
    }
  | {
      found: true;
      normalized: string;
      status: "PENDING_CONFIRM";
      rsvp: RsvpPayload;
      lookedUpBy: { id: string; name: string | null };
      lookedUpAt: string;
    }
  | {
      found: true;
      normalized: string;
      status: "ALREADY_USED";
      rsvp: RsvpPayload;
      alreadyUsedAt: string;
      alreadyUsedBy: string | null;
      alreadyUsedByName: string | null;
      lookedUpBy: { id: string; name: string | null };
      lookedUpAt: string;
    };

type ConfirmResult =
  | {
      found: true;
      status: "CONFIRMED";
      normalized: string;
      rsvp: RsvpPayload;
      confirmedAt: string;
      confirmedBy: { id: string; name: string | null };
    }
  | {
      found: true;
      status: "ALREADY_USED";
      normalized: string;
      rsvp: RsvpPayload;
      alreadyUsedAt: string;
      alreadyUsedBy: string | null;
      alreadyUsedByName: string | null;
      confirmedBy: { id: string; name: string | null };
      confirmedAt: string;
    }
  | {
      found: false;
      normalized?: string;
      message?: string;
    };

// ────────────────────────────────────────────────────────────────────
// Main client component
// ────────────────────────────────────────────────────────────────────

/**
 * DoorCheckInClient
 * -----------------
 * Two-step door check-in flow:
 *
 *   STEP 1 — LOOK UP: Door staff type or scan the 8-char code. GET
 *            /api/admin/check-in/lookup returns one of:
 *              • MISS            → red "Not found" panel
 *              • PENDING_CONFIRM → amber "Confirm member to check in"
 *                                  panel with member info + non-
 *                                  transferrable-code warning +
 *                                  "Confirm check-in" button
 *              • ALREADY_USED    → amber "Code already used" panel
 *                                  with original check-in time
 *
 *   STEP 2 — CONFIRM: Door staff press "Confirm check-in". POST
 *            /api/admin/check-in/confirm atomically sets
 *            doorCheckedAt + doorCheckedBy (race-safe via updateMany
 *            with `doorCheckedAt: null` guard). Returns:
 *              • CONFIRMED    → green "Check-in confirmed" panel
 *              • ALREADY_USED → amber "Code already used" panel
 *                               (another staffer beat us to it)
 *
 * ANY Super Admin / Admin / Co-host of the event can confirm — there
 * is no pre-approval gate. The confirmation itself IS the approval.
 *
 * After each lookup/confirm, the input clears + refocuses for the
 * next attendee.
 */
export function DoorCheckInClient({ adminName }: { adminName: string }) {
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [lookup, setLookup] = React.useState<LookupResult | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── STEP 1: Look up the code ────────────────────────────────────
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setLookup(null);
    setConfirm(null);
    try {
      const url = `/api/admin/check-in/lookup?code=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data: LookupResult = await res.json().catch(() => ({
        found: false as const,
        message: "Invalid response from server",
      }));

      if (!res.ok && !data.found) {
        // 404 MISS or 400 invalid → show miss panel / toast
        setLookup(data);
        if (res.status !== 404) {
          toast.error(
            (data as { message?: string }).message ||
              `Lookup failed (HTTP ${res.status})`
          );
        }
      } else if (!data.found) {
        setLookup(data);
      } else {
        setLookup(data);
        if (data.status === "PENDING_CONFIRM") {
          // Don't toast success — door staff still need to confirm
        } else if (data.status === "ALREADY_USED") {
          toast.warning(
            `Code already used at ${new Date(
              data.alreadyUsedAt
            ).toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem" })} TLV`,
            { duration: 6000 }
          );
        }
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(false);
      // Don't clear the code yet — door staff may want to re-scan if
      // they got a MISS. Just refocus.
      setCode("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // ── STEP 2: Confirm the check-in (POST) ────────────────────────
  async function handleConfirm() {
    if (!lookup || !lookup.found || lookup.status !== "PENDING_CONFIRM") return;
    const normalized = lookup.normalized;

    setConfirming(true);
    try {
      const res = await fetch(`/api/admin/check-in/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const data: ConfirmResult = await res.json().catch(() => ({
        found: false as const,
        message: "Invalid response from server",
      }));
      setConfirm(data);
      if (data.found && data.status === "CONFIRMED") {
        toast.success("Check-in confirmed — attendee may enter");
      } else if (data.found && data.status === "ALREADY_USED") {
        toast.warning(
          `Code already used — another staffer confirmed at ${new Date(
            data.alreadyUsedAt
          ).toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem" })} TLV`,
          { duration: 6000 }
        );
      } else {
        toast.error(
          (data as { message?: string }).message || "Confirm failed"
        );
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setConfirming(false);
    }
  }

  function handleReset() {
    setLookup(null);
    setConfirm(null);
    setCode("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Render the active panel based on state
  let activePanel: React.ReactNode = null;
  if (lookup) {
    if (!lookup.found) {
      activePanel = <MissPanel result={lookup} onReset={handleReset} />;
    } else if (lookup.status === "ALREADY_USED") {
      activePanel = (
        <AlreadyUsedPanel
          rsvp={lookup.rsvp}
          alreadyUsedAt={lookup.alreadyUsedAt}
          alreadyUsedByName={lookup.alreadyUsedByName}
          onReset={handleReset}
        />
      );
    } else if (lookup.status === "PENDING_CONFIRM") {
      if (confirm && confirm.found && confirm.status === "CONFIRMED") {
        activePanel = (
          <ConfirmedPanel
            rsvp={confirm.rsvp}
            confirmedAt={confirm.confirmedAt}
            confirmedByName={confirm.confirmedBy.name}
            onReset={handleReset}
          />
        );
      } else if (confirm && confirm.found && confirm.status === "ALREADY_USED") {
        activePanel = (
          <AlreadyUsedPanel
            rsvp={confirm.rsvp}
            alreadyUsedAt={confirm.alreadyUsedAt}
            alreadyUsedByName={confirm.alreadyUsedByName}
            onReset={handleReset}
          />
        );
      } else {
        activePanel = (
          <PendingConfirmPanel
            rsvp={lookup.rsvp}
            onConfirm={handleConfirm}
            onCancel={handleReset}
            confirming={confirming}
          />
        );
      }
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFAC30]/15 text-[#FFAC30]">
          <QrCode className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-black">Door Check-in</h1>
          <p className="text-sm text-black/50">
            Look up any attendee by their 8-character entry code — works across all events.
          </p>
        </div>
      </div>

      {/* Lookup form — always visible so door staff can scan the next
          code immediately after pressing Confirm. */}
      <form onSubmit={handleLookup} className="mb-6">
        <label
          htmlFor="code"
          className="block text-xs font-bold uppercase tracking-widest text-black/80 mb-2"
        >
          Attendee entry code
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-black/30" />
            <input
              ref={inputRef}
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD-1234"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full pl-11 pr-4 py-3 text-lg font-mono tracking-[0.2em] uppercase border-2 border-black/15 rounded-md focus:outline-none focus:border-[#FFAC30] focus:ring-2 focus:ring-[#FFAC30]/20"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-black text-white font-semibold px-5 py-3 text-sm hover:bg-black/90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Looking up…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" /> Look up
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-black/80">
          Codes are 8 characters in Crockford base32 (no I/L/O/U), formatted as XXXX-XXXX.
          The lookup is case-insensitive and accepts the code with or without the dash.
        </p>
      </form>

      {/* Active panel */}
      {activePanel && (
        <div className="space-y-3">
          {activePanel}
          <div className="text-center text-xs text-black/30 pt-2">
            Looked up by {adminName} ·{" "}
            {new Date().toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" })}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared sub-components
// ────────────────────────────────────────────────────────────────────

function MemberInfoBlock({ rsvp }: { rsvp: RsvpPayload }) {
  const user = rsvp.user;
  const event = rsvp.event;
  const eventStart = new Date(event.startsAt);
  const eventEnd = new Date(event.endsAt);
  const photoUrl = user?.photoUrl || user?.image;

  return (
    <>
      <div className="flex gap-4 items-start">
        {/* Photo / avatar */}
        <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-black/5 border-2 border-[#007E72]/30">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={rsvp.name || "attendee"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-black/80">
              {(rsvp.name || rsvp.email || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name + email */}
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold text-black">
            {rsvp.name || "(no name)"}
          </div>
          <div className="text-sm text-black/80 break-all">{rsvp.email}</div>
          {user?.company && (
            <div className="text-xs text-black/50 mt-0.5">{user.company}</div>
          )}
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#007E72] bg-[#007E72]/10 px-2 py-0.5 rounded">
            <Ticket className="h-3 w-3" /> {rsvp.checkInCode}
          </div>
        </div>
      </div>

      {/* Event details */}
      <div className="rounded-lg bg-white border border-black/10 p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-widest text-black/80 mb-1">
          Registered for
        </div>
        <div className="font-bold text-black text-lg">{event.title}</div>
        <div className="space-y-1.5 text-sm text-black/70">
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 mt-0.5 text-black/80 flex-shrink-0" />
            <span>
              {new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Jerusalem",
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              }).format(eventStart)}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 text-black/80 flex-shrink-0" />
            <span className="font-mono">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Jerusalem",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(eventStart)}
              {" – "}
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Jerusalem",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(eventEnd)}
              {" TLV"}
            </span>
          </div>
          {event.venue && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-black/80 flex-shrink-0" />
              <span>
                {event.venue}
                {event.address && (
                  <span className="text-black/50"> · {event.address}</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-black/80">
        <span>
          RSVP source: <strong className="text-black/80">{rsvp.source}</strong>
        </span>
        <span>
          Registered:{" "}
          <strong className="text-black/80">
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Jerusalem",
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).format(new Date(rsvp.createdAt))}
          </strong>
        </span>
        {rsvp.checkedInAt && (
          <span>
            Self check-in:{" "}
            <strong className="text-[#007E72]">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Jerusalem",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                day: "2-digit",
                month: "short",
              }).format(new Date(rsvp.checkedInAt))}{" "}
              TLV
            </strong>
          </span>
        )}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Panel components — one per state
// ────────────────────────────────────────────────────────────────────

/**
 * PendingConfirmPanel — shown after a successful lookup, before the
 * door staffer confirms. Amber styling, member info, non-transferrable
 * warning, and Confirm / Cancel buttons.
 */
function PendingConfirmPanel({
  rsvp,
  onConfirm,
  onCancel,
  confirming,
}: {
  rsvp: RsvpPayload;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  return (
    <div className="rounded-xl border-2 border-[#FFAC30]/60 bg-gradient-to-br from-[#FFAC30]/10 to-white p-6 space-y-4">
      <div className="flex items-center gap-2 text-[#8a5a00]">
        <UserCheck className="h-6 w-6" />
        <span className="font-bold uppercase tracking-wider">
          Confirm member to check in
        </span>
      </div>

      <MemberInfoBlock rsvp={rsvp} />

      {/* Non-transferrable code warning */}
      <div className="rounded-lg bg-[#FF005A]/8 border border-[#FF005A]/30 px-4 py-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-5 w-5 mt-0.5 flex-shrink-0 text-[#FF005A]" />
          <div className="text-sm text-[#FF005A]">
            <strong>Personal, non-transferrable code.</strong> This code
            belongs to{" "}
            <strong>{rsvp.name || rsvp.email}</strong> only. Verifying it
            admits <strong>this person</strong> into the event — do not
            confirm if the attendee at the door is not the person shown
            above. The code can only be used once.
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#007E72] text-white font-semibold px-4 py-3 text-sm hover:bg-[#007E72]/90 disabled:opacity-50"
        >
          {confirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
            </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> Confirm check-in
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-white text-black border border-black/15 font-semibold px-4 py-3 text-sm hover:bg-black/5 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Cancel
          </button>
        </div>
    </div>
  );
}

/**
 * ConfirmedPanel — shown after a successful POST /confirm. Green
 * styling, member info, confirmation timestamp + checker name.
 */
function ConfirmedPanel({
  rsvp,
  confirmedAt,
  confirmedByName,
  onReset,
}: {
  rsvp: RsvpPayload;
  confirmedAt: string;
  confirmedByName: string | null;
  onReset: () => void;
}) {
  const confirmedDate = new Date(confirmedAt);
  const confirmedFormatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(confirmedDate);

  return (
    <div className="rounded-xl border-2 border-[#007E72]/50 bg-gradient-to-br from-[#007E72]/8 to-[#00E6FF]/5 p-6 space-y-4">
      <div className="flex items-center gap-2 text-[#007E72]">
        <CheckCircle2 className="h-6 w-6" />
        <span className="font-bold uppercase tracking-wider">
          Check-in confirmed
        </span>
      </div>

      {/* Confirmation banner */}
      <div className="rounded-lg bg-[#007E72]/10 border border-[#007E72]/30 px-4 py-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#007E72]" />
          <div className="text-sm text-[#007E72]">
            <strong>
              Confirmed by {confirmedByName || "you"} at {confirmedFormatted} TLV.
            </strong>
            <div className="mt-0.5 text-xs opacity-80">
              First door check-in recorded — attendee may enter.
            </div>
          </div>
        </div>
      </div>

      <MemberInfoBlock rsvp={rsvp} />

      <button
        type="button"
        onClick={onReset}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90"
      >
        <RotateCcw className="h-4 w-4" /> Scan next attendee
      </button>
    </div>
  );
}

/**
 * AlreadyUsedPanel — shown when the code has already been door-checked.
 * Amber styling, member info, original check-in timestamp + checker name.
 */
function AlreadyUsedPanel({
  rsvp,
  alreadyUsedAt,
  alreadyUsedByName,
  onReset,
}: {
  rsvp: RsvpPayload;
  alreadyUsedAt: string;
  alreadyUsedByName: string | null;
  onReset: () => void;
}) {
  const usedDate = new Date(alreadyUsedAt);
  const usedFormatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    day: "2-digit",
    month: "short",
  }).format(usedDate);

  return (
    <div className="rounded-xl border-2 border-[#FFAC30]/60 bg-gradient-to-br from-[#FFAC30]/10 to-white p-6 space-y-4">
      <div className="flex items-center gap-2 text-[#8a5a00]">
        <AlertCircle className="h-6 w-6" />
        <span className="font-bold uppercase tracking-wider">
          Code already used
        </span>
      </div>

      {/* Already-used banner */}
      <div className="rounded-lg bg-[#FFAC30]/15 border border-[#FFAC30]/40 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#8a5a00]" />
          <div className="text-sm text-[#8a5a00]">
            <strong>This code was already used at the door.</strong> The
            attendee may have already entered. If you wish to re-admit
            them, do so manually — the system will not re-validate this
            code.
            <div className="mt-1 text-xs text-[#8a5a00]/80">
              Original check-in: {usedFormatted} TLV
              {alreadyUsedByName && ` by ${alreadyUsedByName}`}
            </div>
          </div>
        </div>
      </div>

      <MemberInfoBlock rsvp={rsvp} />

      <button
        type="button"
        onClick={onReset}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90"
      >
        <RotateCcw className="h-4 w-4" /> Scan next attendee
      </button>
    </div>
  );
}

function MissPanel({
  result,
  onReset,
}: {
  result: { message?: string; normalized?: string };
  onReset: () => void;
}) {
  return (
    <div className="rounded-xl border-2 border-[#FF005A]/40 bg-gradient-to-br from-[#FF005A]/5 to-white p-6 space-y-4">
      <div className="flex items-center gap-2 text-[#FF005A]">
        <XCircle className="h-6 w-6" />
        <span className="font-bold uppercase tracking-wider">Not found</span>
      </div>
      <p className="text-sm text-black/70 leading-relaxed">
        {result.message ||
          `No attendee found with code "${result.normalized || "?"}".`}
      </p>
      <div className="rounded-lg bg-white border border-black/10 p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-black/80 mb-2">
          Possible reasons
        </div>
        <ul className="space-y-1 text-sm text-black/70">
          <li>• The attendee mistyped their code (codes are 8 chars, no I/L/O/U).</li>
          <li>
            • The attendee hasn&apos;t checked in yet — ask them to open the event
            page and tap &quot;I&apos;m here — Check in&quot;.
          </li>
          <li>• The code was generated for a different event and may have been invalidated.</li>
        </ul>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90"
      >
        <RotateCcw className="h-4 w-4" /> Try another code
      </button>
    </div>
  );
}
