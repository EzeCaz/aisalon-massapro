/**
 * Flexible parser for event-registrant spreadsheets.
 *
 * The admin uploads an xlsx/csv file that came from an external RSVP
 * form (Google Forms, Eventbrite, Luma, etc.). These files rarely share
 * an exact column layout — some say "Full Name", some say "Name", some
 * "First name" + "Last name", some "Email Address", some "email", etc.
 *
 * This module normalizes any reasonable variant into a single shape:
 *
 *   {
 *     timestamp: Date | null,
 *     email: string,
 *     name: string | null,
 *     mobile: string | null,
 *     company: string | null,
 *     linkedinUrl: string | null,
 *     bio: string | null,
 *     // any extra columns are kept on `raw` for the admin to see
 *     raw: Record<string, string>,
 *   }
 */

import * as xlsx from "xlsx";

export type ParsedRegistrant = {
  timestamp: Date | null;
  email: string;
  name: string | null;
  mobile: string | null;
  company: string | null;
  linkedinUrl: string | null;
  bio: string | null;
  raw: Record<string, string>;
};

export type ParseResult = {
  rows: ParsedRegistrant[];
  totalRows: number;
  headerColumns: string[];
  warnings: string[];
};

/** Normalize a header string for matching: lowercase, strip non-alphanumeric. */
function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Coerce a cell value to a trimmed string (or null if empty). */
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Match a header cell against a list of normalized patterns. */
function matchHeader(headers: string[], patterns: string[]): string | null {
  const matches = matchAllHeaders(headers, patterns);
  return matches[0] ?? null;
}

/**
 * Return ALL header columns that match any of the patterns.
 * Useful when a spreadsheet has multiple columns for the same field
 * (e.g. Luma exports "phone_number" AND "Mobile number"). For each row,
 * the parser will pick the first non-null value across all matching
 * columns — so a missing value in the primary column doesn't blank out
 * the field when a secondary column has data.
 */
function matchAllHeaders(headers: string[], patterns: string[]): string[] {
  const normed = headers.map((h) => ({ raw: h, n: norm(h) }));
  const result: string[] = [];
  const seen = new Set<string>();
  // Pass 1 — exact matches, in pattern order
  for (const p of patterns) {
    const np = norm(p);
    const exact = normed.find((h) => h.n === np);
    if (exact && !seen.has(exact.raw)) {
      result.push(exact.raw);
      seen.add(exact.raw);
    }
  }
  // Pass 2 — contains matches, in pattern order
  for (const p of patterns) {
    const np = norm(p);
    const contains = normed.find((h) => h.n.includes(np) && !seen.has(h.raw));
    if (contains) {
      result.push(contains.raw);
      seen.add(contains.raw);
    }
  }
  return result;
}

/**
 * Parse an xlsx/csv file buffer into normalized registrant rows.
 *
 * Column detection is flexible:
 *   - email: matches "email", "email address", "e-mail"
 *   - name: matches "name", "full name", "fullnamename" (fallback: combines
 *     "first name" + "last name")
 *   - timestamp: matches "timestamp", "submitted at", "created at", "registered at"
 *   - mobile: matches "mobile", "phone", "phone number", "tel"
 *   - company: matches "company", "company name", "organization"
 *   - linkedin: matches "linkedin", "linkedin profile", "linkedin url"
 *   - bio: matches "bio", "about you", "tell us more", "tell us about yourself"
 *
 * Any other columns are preserved on `raw` so the admin can see them in the UI.
 */
export function parseRegistrantFile(buffer: Buffer, fileName: string): ParseResult {
  const wb = xlsx.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], totalRows: 0, headerColumns: [], warnings: ["File has no sheets."] };
  }
  const sheet = wb.Sheets[sheetName];
  // header: 1 → array-of-arrays; defval → keep empty cells as "" so columns line up;
  // blankrows: false → skip fully-blank rows.
  const aoa = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (aoa.length < 2) {
    return { rows: [], totalRows: 0, headerColumns: [], warnings: ["File has no data rows."] };
  }

  const headerRow = (aoa[0] as unknown[]).map((h) => str(h) ?? "");
  const dataRows = aoa.slice(1);
  const warnings: string[] = [];

  const emailCol = matchHeader(headerRow, ["email address", "email", "e-mail", "emailaddress"]);
  if (!emailCol) {
    warnings.push("No email column detected. Rows without email will be skipped.");
  }

  const nameCol = matchHeader(headerRow, ["full name", "fullname", "name", "your name"]);
  const firstNameCol = matchHeader(headerRow, ["first name", "firstname", "given name"]);
  const lastNameCol = matchHeader(headerRow, ["last name", "lastname", "family name", "surname"]);

  const tsCol = matchHeader(headerRow, [
    "timestamp",
    "submitted at",
    "submittedat",
    "created at",
    "createdat",
    "registered at",
    "registeredat",
    "registration date",
    "date",
  ]);

  const mobileCols = matchAllHeaders(headerRow, [
    "mobile",
    "phone",
    "phone number",
    "phonenumber",
    "tel",
    "telephone",
    "mobile number",
    "mobilenumber",
    "whatsapp",
  ]);

  const companyCols = matchAllHeaders(headerRow, [
    "company name",
    "company",
    "organization",
    "organisation",
    "employer",
    "workplace",
  ]);

  const linkedinCols = matchAllHeaders(headerRow, [
    "linkedin profile",
    "linkedin",
    "linkedin url",
    "linkedinurl",
    "linkedin profile url",
  ]);

  const bioCols = matchAllHeaders(headerRow, [
    "tell us more about yourself",
    "tell us about yourself",
    "tell us more",
    "bio",
    "about you",
    "about yourself",
    "introduction",
    "introduce yourself",
  ]);

  // Build a header → index map for fast lookup
  const headerIdx: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    headerIdx[h] = i;
  });

  const rows: ParsedRegistrant[] = [];

  for (const r of dataRows) {
    const arr = r as unknown[];
    if (!arr || arr.length === 0) continue;

    // Build the raw object (all columns as strings)
    const raw: Record<string, string> = {};
    headerRow.forEach((h, i) => {
      const v = str(arr[i]);
      if (v) raw[h] = v;
    });

    // Email
    const emailRaw = emailCol ? str(arr[headerIdx[emailCol]]) : null;
    const email = emailRaw ? emailRaw.toLowerCase().trim() : null;
    if (!email) {
      // skip rows without email — we can't match them to a User
      continue;
    }

    // Name — prefer a single "name" column; fall back to first+last
    let name: string | null = null;
    if (nameCol) {
      name = str(arr[headerIdx[nameCol]]);
    } else if (firstNameCol || lastNameCol) {
      const fn = firstNameCol ? str(arr[headerIdx[firstNameCol]]) : null;
      const ln = lastNameCol ? str(arr[headerIdx[lastNameCol]]) : null;
      name = [fn, ln].filter(Boolean).join(" ") || null;
    }

    // Timestamp
    let timestamp: Date | null = null;
    if (tsCol) {
      const v = arr[headerIdx[tsCol]];
      if (v instanceof Date && !isNaN(v.getTime())) {
        timestamp = v;
      } else if (typeof v === "number") {
        // Excel serial date number
        const d = xlsx.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : null;
        if (d && !isNaN(d.getTime())) timestamp = d;
      } else if (typeof v === "string") {
        const d = new Date(v);
        if (!isNaN(d.getTime())) timestamp = d;
      }
    }

    // For fields where multiple matching columns may exist (Luma exports
    // often have BOTH "phone_number" AND "Mobile number"), pick the first
    // non-null value across all matching columns. This way, a missing
    // value in the primary column doesn't blank out the field when a
    // secondary column has the data.
    const firstNonNull = (cols: string[]): string | null => {
      for (const c of cols) {
        const v = str(arr[headerIdx[c]]);
        if (v) return v;
      }
      return null;
    };

    const mobile = firstNonNull(mobileCols);
    const company = firstNonNull(companyCols);
    const linkedinUrl = firstNonNull(linkedinCols);
    const bio = firstNonNull(bioCols);

    rows.push({
      timestamp,
      email,
      name,
      mobile,
      company,
      linkedinUrl,
      bio,
      raw,
    });
  }

  return {
    rows,
    totalRows: rows.length,
    headerColumns: headerRow,
    warnings,
  };
}
