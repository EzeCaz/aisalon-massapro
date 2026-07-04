/**
 * Calendar helpers — generate .ics files + calendar service URLs.
 *
 * Supports 4 services:
 *   - iCal (.ics download) — works with Apple Calendar, Outlook desktop, anything that imports .ics
 *   - Google Calendar  — URL-based "add event" link
 *   - Outlook (web)    — URL-based "add event" link
 *   - Yahoo Calendar   — URL-based "add event" link
 *
 * All functions are PURE — they take an event object and return a string.
 * Safe to call from both server and client components.
 */

export type CalendarEvent = {
  title: string;
  description?: string | null;
  startsAt: string; // ISO 8601 string
  endsAt: string;   // ISO 8601 string
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  /** Absolute URL of the event page (used as the UID source + URL field). */
  url?: string | null;
};

/* ------------------------------------------------------------------ */
/*  Date formatting helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Format an ISO date as YYYYMMDDTHHMMSSZ (UTC) — the format iCal expects
 * for DATE-TIME values. Example: 2026-07-15T18:30:00.000Z → "20260715T183000Z"
 */
function formatIcalDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Format an ISO date as YYYYMMDDTHHMMSS (local, no Z) — used by Google
 * Calendar URL params when we want the event in the user's local time.
 * Google interprets times without Z as "floating" (local to viewer).
 *
 * Actually, to avoid ambiguity across timezones, we use the UTC form
 * with the &dates= param and let Google handle the conversion.
 */
function formatGoogleDate(iso: string): string {
  // Google expects YYYYMMDDTHHMMSSZ / YYYYMMDDTHHMMSSZ (UTC, with Z)
  return formatIcalDate(iso);
}

/**
 * Format an ISO date for Outlook: YYYY-MM-DDTHH:mm:ss
 * (no timezone suffix — Outlook infers UTC from the URL context).
 */
function formatOutlookDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() + "-" +
    pad(d.getUTCMonth() + 1) + "-" +
    pad(d.getUTCDate()) + "T" +
    pad(d.getUTCHours()) + ":" +
    pad(d.getUTCMinutes()) + ":" +
    pad(d.getUTCSeconds())
  );
}

/**
 * Format an ISO date for Yahoo: YYYYMMDDTHHMMSSZ (same as iCal).
 */
function formatYahooDate(iso: string): string {
  return formatIcalDate(iso);
}

/* ------------------------------------------------------------------ */
/*  Text escaping helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Escape text for iCal (RFC 5545):
 *   - backslash → \\
 *   - semicolon → \;
 *   - comma     → \,
 *   - newline   → \n
 */
function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * URL-encode text for query params (for Google/Outlook/Yahoo URLs).
 */
function encode(text: string): string {
  return encodeURIComponent(text);
}

/**
 * Build a single-line location string from venue/address/city/country.
 */
function buildLocation(e: CalendarEvent): string {
  const parts = [e.venue, e.address, e.city, e.country]
    .filter((p): p is string => Boolean(p && p.trim()));
  return parts.join(", ");
}

/* ------------------------------------------------------------------ */
/*  .ics generator (iCal / Apple Calendar / Outlook desktop)          */
/* ------------------------------------------------------------------ */

/**
 * Generate a complete .ics file content string for the event.
 *
 * The returned string can be:
 *   - Used as a data: URI href (client-side download)
 *   - Written to a file attachment (server-side email)
 *   - Returned from an API route with Content-Type: text/calendar
 *
 * Follows RFC 5545. Includes:
 *   - VEVENT with UID, DTSTAMP, DTSTART, DTEND, SUMMARY, DESCRIPTION,
 *     LOCATION, URL
 *   - UID is derived from the event URL + start time (stable + unique)
 *   - Line folding at 75 octets (per RFC) — handled by the wrap function
 */
export function generateIcs(e: CalendarEvent): string {
  const dtstamp = formatIcalDate(new Date().toISOString());
  const dtstart = formatIcalDate(e.startsAt);
  const dtend = formatIcalDate(e.endsAt);
  const location = buildLocation(e);
  const description = e.description || "";
  const uid = e.url
    ? `${e.url.replace(/[^a-zA-Z0-9]/g, "")}-${dtstart}@aisalon`
    : `event-${dtstart}-${dtend}@aisalon`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Salon Tel Aviv//MassaPro//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcalText(e.title)}`,
  ];
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcalText(description)}`);
  }
  if (location) {
    lines.push(`LOCATION:${escapeIcalText(location)}`);
  }
  if (e.url) {
    lines.push(`URL:${e.url}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  // RFC 5545 line folding: split lines longer than 75 octets, continuing
  // with a leading space on the next line.
  const folded: string[] = [];
  for (const line of lines) {
    if (line.length <= 75) {
      folded.push(line);
    } else {
      let remaining = line;
      folded.push(remaining.slice(0, 75));
      remaining = remaining.slice(75);
      while (remaining.length > 0) {
        folded.push(" " + remaining.slice(0, 74));
        remaining = remaining.slice(74);
      }
    }
  }

  return folded.join("\r\n");
}

/**
 * Generate a data: URI for the .ics file, suitable for use as an <a href>.
 * The browser will download it as a .ics file when clicked.
 *
 * Uses base64 encoding to avoid issues with special characters in the URL.
 */
export function generateIcsDataUri(e: CalendarEvent): string {
  const ics = generateIcs(e);
  // Use UTF-8 + base64 to safely encode the .ics content in a data URI
  const base64 = typeof Buffer !== "undefined"
    ? Buffer.from(ics, "utf-8").toString("base64")
    : btoa(unescape(encodeURIComponent(ics)));
  return `data:text/calendar;charset=utf-8;base64,${base64}`;
}

/* ------------------------------------------------------------------ */
/*  Google Calendar URL                                                */
/* ------------------------------------------------------------------ */

/**
 * Build a Google Calendar "add event" URL.
 *
 * Format: https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=.../...&details=...&location=...
 *
 * Clicking this URL opens Google Calendar with the event pre-filled.
 * The user can then save it to any of their Google calendars.
 */
export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${formatGoogleDate(e.startsAt)}/${formatGoogleDate(e.endsAt)}`,
  });
  const location = buildLocation(e);
  if (e.description) params.set("details", e.description);
  if (location) params.set("location", location);
  if (e.url) {
    // Append the event URL to the description so it's accessible from
    // Google Calendar (Google doesn't have a dedicated URL param).
    const existing = params.get("details") || "";
    params.set("details", existing ? `${existing}\n\n${e.url}` : e.url);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/*  Outlook (web) URL                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build an Outlook (web) "add event" URL.
 *
 * Format: https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&startdt=...&enddt=...&subject=...&body=...&location=...
 *
 * Clicking this URL opens Outlook on the web with the event pre-filled.
 */
export function outlookCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    startdt: formatOutlookDate(e.startsAt),
    enddt: formatOutlookDate(e.endsAt),
    subject: e.title,
  });
  const location = buildLocation(e);
  if (e.description) params.set("body", e.description);
  if (location) params.set("location", location);
  if (e.url) {
    const existing = params.get("body") || "";
    params.set("body", existing ? `${existing}\n\n${e.url}` : e.url);
  }
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/*  Yahoo Calendar URL                                                 */
/* ------------------------------------------------------------------ */

/**
 * Build a Yahoo Calendar "add event" URL.
 *
 * Format: https://calendar.yahoo.com/?v=60&view=d&type=20&title=...&st=...&et=...&desc=...&in_loc=...
 */
export function yahooCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    v: "60",
    view: "d",
    type: "20",
    title: e.title,
    st: formatYahooDate(e.startsAt),
    et: formatYahooDate(e.endsAt),
  });
  const location = buildLocation(e);
  if (e.description) params.set("desc", e.description);
  if (location) params.set("in_loc", location);
  if (e.url) {
    const existing = params.get("desc") || "";
    params.set("desc", existing ? `${existing}\n\n${e.url}` : e.url);
  }
  return `https://calendar.yahoo.com/?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/*  Convenience: build all 4 URLs at once                              */
/* ------------------------------------------------------------------ */

export type CalendarLinks = {
  ics: string;        // data: URI for download
  google: string;     // https://calendar.google.com/...
  outlook: string;    // https://outlook.live.com/...
  yahoo: string;      // https://calendar.yahoo.com/...
};

export function buildCalendarLinks(e: CalendarEvent): CalendarLinks {
  return {
    ics: generateIcsDataUri(e),
    google: googleCalendarUrl(e),
    outlook: outlookCalendarUrl(e),
    yahoo: yahooCalendarUrl(e),
  };
}
