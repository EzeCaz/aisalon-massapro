/**
 * Shared datetime helpers for the AI Salon Tel Aviv app.
 *
 * All admin datetime inputs (event startsAt/endsAt, agenda item startsAt/
 * endsAt) are entered by the admin in **Asia/Jerusalem wall-clock time**,
 * regardless of where the admin's browser happens to be running (the admin
 * could be in Tel Aviv, but also on a VPN, on a cloud VM in UTC, etc.).
 *
 * The previous implementation used `new Date(localString).toISOString()`,
 * which interprets the local string in the **browser's** timezone. When the
 * admin's browser was NOT in Asia/Jerusalem (e.g. running on a UTC cloud
 * host, or a server set to UTC), the wall-clock time was treated as UTC,
 * then later formatted back to Asia/Jerusalem — producing a 2-or-3-hour
 * skew on every rendered mockup / event page.
 *
 * These helpers fix that by **always treating the input as Asia/Jerusalem
 * wall-clock time**, regardless of the host's local timezone. They use
 * `Intl.DateTimeFormat` with `timeZone: "Asia/Jerusalem"` to compute the
 * correct offset (including DST — Israel uses UTC+2 in winter, UTC+3 in
 * summer).
 */

const TZ_TLV = "Asia/Jerusalem" as const;

/**
 * Convert an ISO 8601 UTC date string (e.g. "2026-07-15T09:00:00.000Z")
 * to the "YYYY-MM-DDTHH:MM" format expected by `<input type="datetime-local">`,
 * formatted in **Asia/Jerusalem wall-clock time**.
 *
 * Returns "" for null/undefined/invalid input.
 *
 * Special case: if the input string has NO timezone designator (no "Z" suffix
 * and no "+/-" offset), it is treated as Asia/Jerusalem wall-clock time
 * already — this matches what the LLM event-extraction prompt returns
 * ("Assume local Tel Aviv time"). The string is then normalized to the
 * datetime-local format and returned as-is.
 *
 * Examples:
 *   isoToLocalDatetimeInput("2026-07-15T09:00:00.000Z")  // "2026-07-15T12:00"
 *   (09:00 UTC = 12:00 IDT in summer)
 *
 *   isoToLocalDatetimeInput("2026-07-15T18:00:00")       // "2026-07-15T18:00"
 *   (no timezone — treated as Israel wall-clock time, returned as-is)
 */
export function isoToLocalDatetimeInput(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  try {
    // If it's already a Date object, just format it.
    if (iso instanceof Date) {
      return formatFromUtc(iso);
    }
    const str = String(iso).trim();
    if (!str) return "";
    // Detect timezone designator: trailing "Z" OR a "+/-" offset after the
    // time portion. If neither is present, the string is a wall-clock time
    // (likely from the LLM extract API) — assume Asia/Jerusalem.
    const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(str);
    if (!hasTimezone) {
      // Normalize to "YYYY-MM-DDTHH:MM" — strip seconds/millis if present.
      // Input might be "2026-07-15T18:00:00" or "2026-07-15T18:00".
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if (!m) return "";
      return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
    }
    return formatFromUtc(new Date(str));
  } catch {
    return "";
  }
}

function formatFromUtc(d: Date): string {
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_TLV,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Convert a `<input type="datetime-local">` value (e.g. "2026-07-15T12:00")
 * — which is **Asia/Jerusalem wall-clock time** — to a UTC ISO 8601 string
 * (e.g. "2026-07-15T09:00:00.000Z" for 12:00 IDT in summer).
 *
 * Returns "" for empty/invalid input.
 *
 * Approach: parse the input as if it were UTC (gives a stable Date object),
 * ask Intl for Asia/Jerusalem's offset on that date (handles DST), then
 * subtract the offset to get the real UTC instant.
 */
export function localDatetimeInputToIso(local: string): string {
  if (!local) return "";
  // Treat the input as UTC first to get a stable Date object that we can
  // ask Intl about. (If we just did `new Date(local)`, the browser would
  // interpret it in the host's local timezone — which is the bug we're
  // fixing.)
  const date = new Date(local + ":00Z");
  if (isNaN(date.getTime())) {
    // Fallback: shouldn't normally happen because the input is always
    // "YYYY-MM-DDTHH:MM" from a datetime-local input, but be defensive.
    return "";
  }

  // Get Asia/Jerusalem's offset (in minutes) for this date.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_TLV,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  // tzName looks like "GMT+3" or "GMT+2" or "GMT-5:30"
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = match[3] ? parseInt(match[3], 10) : 0;
    offsetMinutes = sign * (hours * 60 + minutes);
  }

  // The admin picked a wall-clock time in Israel. To convert to UTC,
  // subtract the offset (e.g. 15:00 IDT = 12:00 UTC, since IDT is +3).
  const utc = new Date(date.getTime() - offsetMinutes * 60000);
  return utc.toISOString();
}
