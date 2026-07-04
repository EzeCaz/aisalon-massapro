/**
 * Timezone-aware date/time formatting helpers for the mockup editors.
 *
 * WHY THIS FILE EXISTS:
 *   The mockup event-mappers receive ISO date strings (e.g.
 *   "2026-06-18T15:00:00.000Z") from the API and need to format them as
 *   "18:00" (HH:MM) and "June 18th 2026" for display on the mockup
 *   canvas. The previous implementation used `getUTCHours()` etc.,
 *   which formats in UTC — but the admin entered the time in Tel Aviv
 *   wall-clock time (Asia/Jerusalem, UTC+3 in summer / UTC+2 in winter).
 *   This caused a 2-or-3-hour skew on every rendered mockup.
 *
 *   The fix is to pin `timeZone: "Asia/Jerusalem"` via `Intl.DateTimeFormat`,
 *   which respects DST automatically and produces the wall-clock time
 *   the admin meant. This matches the existing codebase convention used
 *   in `public-event-page.tsx`, `admin-events-list.tsx`,
 *   `rsvp-check-in-card.tsx`, `door-check-in-client.tsx`, and the
 *   `admin-members-table.tsx` hydration fix.
 *
 *   Using `Intl.DateTimeFormat` (rather than `date-fns-tz` or similar)
 *   keeps us zero-dependency and works identically in Node and the
 *   browser.
 */

const TZ_TLV = "Asia/Jerusalem" as const;

/** Shared formatter for "18:00" (24-hour, HH:MM, Asia/Jerusalem). */
const TIME_FMT_TLV = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ_TLV,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

/** Shared formatter for the numeric day-of-month (1–31). */
const DAY_FMT_TLV = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ_TLV,
  day: "numeric",
});

/** Shared formatter for the numeric month (1–12). */
const MONTH_FMT_TLV = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ_TLV,
  month: "numeric",
});

/** Shared formatter for the numeric 4-digit year. */
const YEAR_FMT_TLV = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ_TLV,
  year: "numeric",
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * Format an ISO date string as "18:00" (HH:MM, 24h, Asia/Jerusalem).
 *
 * Returns "" for falsy input.
 */
export function formatTimeTLV(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  return TIME_FMT_TLV.format(new Date(iso));
}

/**
 * Format an ISO date string as "June 18th 2026" (Asia/Jerusalem).
 *
 * The ordinal suffix (st/nd/rd/th) is computed from the day-of-month.
 * Returns "" for falsy input.
 */
export function formatDateTLV(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const day = Number(DAY_FMT_TLV.format(new Date(iso)));
  const monthIdx = Number(MONTH_FMT_TLV.format(new Date(iso))) - 1;
  const year = Number(YEAR_FMT_TLV.format(new Date(iso)));
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${MONTH_NAMES[monthIdx]} ${day}${suffix} ${year}`;
}
