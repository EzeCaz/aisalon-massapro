"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  QrCode,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  User,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  RotateCcw,
  AlertCircle,
} from "lucide-react";

type LookupResult = {
  found: boolean;
  normalized?: string;
  message?: string;
  firstCheckIn?: boolean;
  alreadyUsedAt?: string;
  alreadyUsedBy?: string;
  /** Co-host pre-approval state (Task 4). */
  approved?: boolean;
  approvedBy?: { id: string; name: string | null; email: string } | null;
  approvedAt?: string;
  rsvp?: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    source: string;
    checkInCode: string;
    checkedInAt: string | null;
    doorCheckedAt?: string | null;
    doorCheckedBy?: string | null;
    createdAt: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      company: string | null;
      photoUrl: string | null;
      image: string | null;
      bio: string | null;
    } | null;
    event: {
      id: string;
      title: string;
      slug: string;
      startsAt: string;
      endsAt: string;
      venue: string | null;
      address: string | null;
      city: string | null;
    };
  };
  lookedUpBy?: { id: string; name: string | null };
  lookedUpAt?: string;
};

/**
 * DoorCheckInClient
 * -----------------
 * Single-input form for door staff. Type or scan an attendee's 8-char
 * check-in code (e.g. "ABCD-1234"), then see one of three outcomes:
 *
 *   ✓ HIT  → green panel: attendee photo/name/email + event title/date/venue
 *   ✗ MISS → red panel: "Not found" + possible-reasons list
 *   ! ERR  → toast + inline error panel
 *
 * The input is cleared + refocused after each lookup so door staff can
 * immediately scan the next attendee without manual cleanup.
 */
export function DoorCheckInClient({ adminName }: { adminName: string }) {
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<LookupResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);
    try {
      const url = `/api/admin/check-in/lookup?code=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data: LookupResult = await res.json().catch(() => ({ found: false, message: "Invalid response" }));

      if (!res.ok && !data.found) {
        if (res.status === 404) {
          setResult(data);
        } else {
          toast.error(data.message || `Lookup failed (HTTP ${res.status})`);
          setResult(data);
        }
      } else if (res.status === 403 && data.found && data.approved === false) {
        // Co-host has not approved this code yet — show a dedicated
        // "Not approved" panel (not the green HIT panel). The code is
        // valid but the attendee needs to ask their co-host to approve.
        setResult(data);
        toast.warning("Code not approved — ask a co-host to approve this RSVP", {
          duration: 6000,
        });
      } else {
        setResult(data);
        if (data.firstCheckIn === false && data.alreadyUsedAt) {
          toast.warning(
            `Code already used at ${new Date(data.alreadyUsedAt).toLocaleTimeString()}`,
            { duration: 6000 }
          );
        } else {
          toast.success("Attendee found — first check-in recorded");
        }
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(false);
      // Clear input + refocus for next attendee
      setCode("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleReset() {
    setResult(null);
    setCode("");
    requestAnimationFrame(() => inputRef.current?.focus());
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

      {/* Lookup form */}
      <form onSubmit={handleLookup} className="mb-6">
        <label htmlFor="code" className="block text-xs font-bold uppercase tracking-widest text-black/80 mb-2">
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

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {result.found && result.rsvp && result.approved === false ? (
            <NotApprovedPanel result={result} onReset={handleReset} />
          ) : result.found && result.rsvp ? (
            <HitPanel result={result} onReset={handleReset} />
          ) : (
            <MissPanel result={result} onReset={handleReset} />
          )}
          <div className="text-center text-xs text-black/30 pt-2">
            Looked up by {adminName} · {new Date().toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" })}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function HitPanel({ result, onReset }: { result: LookupResult; onReset: () => void }) {
  const rsvp = result.rsvp!;
  const user = rsvp.user;
  const event = rsvp.event;
  const eventStart = new Date(event.startsAt);
  const eventEnd = new Date(event.endsAt);
  const checkedInAt = rsvp.checkedInAt ? new Date(rsvp.checkedInAt) : null;
  const doorCheckedAt = rsvp.doorCheckedAt ? new Date(rsvp.doorCheckedAt) : null;
  const alreadyUsed = result.firstCheckIn === false && !!doorCheckedAt;
  const approvedAt = result.approvedAt ? new Date(result.approvedAt) : null;
  const approverName = result.approvedBy?.name || result.approvedBy?.email || "a co-host";

  // Format the approval timestamp as "HH:MM on the DD, MMM YY" (per user spec).
  const approvalFormatted = approvedAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jerusalem",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        day: "2-digit",
        month: "short",
        year: "2-digit",
      }).format(approvedAt)
    : "";

  const photoUrl = user?.photoUrl || user?.image;

  return (
    <div
      className={`rounded-xl border-2 p-6 space-y-4 ${
        alreadyUsed
          ? "border-[#FFAC30]/50 bg-gradient-to-br from-[#FFAC30]/10 to-white"
          : "border-[#007E72]/40 bg-gradient-to-br from-[#007E72]/5 to-[#00E6FF]/5"
      }`}
    >
      <div
        className={`flex items-center gap-2 ${
          alreadyUsed ? "text-[#8a5a00]" : "text-[#007E72]"
        }`}
      >
        {alreadyUsed ? (
          <AlertCircle className="h-6 w-6" />
        ) : (
          <CheckCircle2 className="h-6 w-6" />
        )}
        <span className="font-bold uppercase tracking-wider">
          {alreadyUsed ? "Code already used" : "Attendee verified"}
        </span>
      </div>

      {/* Approval banner — always shown when the code was approved.
          On first use: green "Approved by X at HH:MM on DD MMM YY".
          On repeat use: amber "Approved by X at HH:MM on DD MMM YY, and already accessed the event"
          (per user spec). */}
      {approvedAt && (
        <div
          className={`rounded-lg px-4 py-3 border ${
            alreadyUsed
              ? "bg-[#FFAC30]/15 border-[#FFAC30]/40"
              : "bg-[#007E72]/10 border-[#007E72]/30"
          }`}
        >
          <div className="flex items-start gap-2">
            <CheckCircle2
              className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                alreadyUsed ? "text-[#8a5a00]" : "text-[#007E72]"
              }`}
            />
            <div
              className={`text-sm ${
                alreadyUsed ? "text-[#8a5a00]" : "text-[#007E72]"
              }`}
            >
              <strong>
                Approved by {approverName} at {approvalFormatted}
                {alreadyUsed && ", and already accessed the event"}.
              </strong>
              {!alreadyUsed && (
                <div className="mt-0.5 text-xs opacity-80">
                  First door check-in recorded — attendee may enter.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legacy already-used warning banner — kept for backwards-compat
          on codes that were door-checked before the approval flow was
          added (no approvedAt). */}
      {alreadyUsed && doorCheckedAt && !approvedAt && (
        <div className="rounded-lg bg-[#FFAC30]/15 border border-[#FFAC30]/40 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-[#8a5a00] mt-0.5 flex-shrink-0" />
            <div className="text-sm text-[#8a5a00]">
              <strong>This code was already used at the door.</strong> The attendee
              may have already entered. If you wish to re-admit them, do so
              manually — the system will not re-validate this code.
              <div className="mt-1 text-xs text-[#8a5a00]/80">
                Original check-in:{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Jerusalem",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  day: "2-digit",
                  month: "short",
                }).format(doorCheckedAt)}{" "}
                TLV
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* Photo / avatar */}
        <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-black/5 border-2 border-[#007E72]/30">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={rsvp.name || "attendee"} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-black/80">
              {(rsvp.name || rsvp.email || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name + email */}
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold text-black">{rsvp.name || "(no name)"}</div>
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
              {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(eventStart)}
              {" – "}
              {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(eventEnd)}
              {" TLV"}
            </span>
          </div>
          {event.venue && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-black/80 flex-shrink-0" />
              <span>
                {event.venue}
                {event.address && <span className="text-black/50"> · {event.address}</span>}
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
        {checkedInAt && (
          <span>
            Checked in:{" "}
            <strong className="text-[#007E72]">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Jerusalem",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                day: "2-digit",
                month: "short",
              }).format(checkedInAt)}{" "}
              TLV
            </strong>
          </span>
        )}
      </div>

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

function MissPanel({ result, onReset }: { result: LookupResult; onReset: () => void }) {
  return (
    <div className="rounded-xl border-2 border-[#FF005A]/40 bg-gradient-to-br from-[#FF005A]/5 to-white p-6 space-y-4">
      <div className="flex items-center gap-2 text-[#FF005A]">
        <XCircle className="h-6 w-6" />
        <span className="font-bold uppercase tracking-wider">Not found</span>
      </div>
      <p className="text-sm text-black/70 leading-relaxed">
        {result.message || `No attendee found with code "${result.normalized || "?"}".`}
      </p>
      <div className="rounded-lg bg-white border border-black/10 p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-black/80 mb-2">
          Possible reasons
        </div>
        <ul className="space-y-1 text-sm text-black/70">
          <li>• The attendee mistyped their code (codes are 8 chars, no I/L/O/U).</li>
          <li>• The attendee hasn&apos;t checked in yet — ask them to open the event page and tap &quot;I&apos;m here — Check in&quot;.</li>
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

/**
 * NotApprovedPanel — shown when the code exists but the co-host hasn't
 * approved it for door entry yet. Distinct amber/pink styling so door
 * staff immediately know this isn't a "miss" — the attendee is real,
 * they just need approval.
 */
function NotApprovedPanel({ result, onReset }: { result: LookupResult; onReset: () => void }) {
  const rsvp = result.rsvp!;
  const event = rsvp.event;
  const eventStart = new Date(event.startsAt);
  return (
    <div className="rounded-xl border-2 border-[#FF005A]/50 bg-gradient-to-br from-[#FF005A]/10 to-[#FFAC30]/5 p-6 space-y-4">
      <div className="flex items-center gap-2 text-[#FF005A]">
        <AlertCircle className="h-6 w-6" />
        <span className="font-bold uppercase tracking-wider">Not approved</span>
      </div>
      <p className="text-sm text-black/70 leading-relaxed">
        This code belongs to <strong>{rsvp.name || rsvp.email}</strong> for{" "}
        <strong>{event.title}</strong> ({new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Jerusalem",
          month: "long",
          day: "numeric",
        }).format(eventStart)}), but a co-host has not yet approved them for door entry.
      </p>
      <div className="rounded-lg bg-white border border-[#FF005A]/30 p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-[#FF005A] mb-2">
          What to do
        </div>
        <ul className="space-y-1 text-sm text-black/70">
          <li>• Ask the attendee to message the event co-host.</li>
          <li>• The co-host can approve them on the event&apos;s admin page (Manage Event → RSVPs tab → Approve).</li>
          <li>• Once approved, the attendee can return to the door and you can re-scan their code.</li>
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
