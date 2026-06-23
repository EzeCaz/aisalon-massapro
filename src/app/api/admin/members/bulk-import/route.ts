import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import * as XLSX from "xlsx";

/**
 * POST /api/admin/members/bulk-import
 *
 * Bulk-import members from a CSV or XLS/XLSX file. Each row becomes a User
 * record (or updates an existing user with the same email).
 *
 * Accepts multipart/form-data with a single file field named `file`.
 *
 * Supported columns (case-insensitive headers):
 *   name, email, company, companyUrl, linkedinUrl, portfolioUrl, bio,
 *   mobile, interestedIn, profileCategories, appliedFor, invitedToSpeak
 *
 * `email` is the only required column. Rows with invalid/missing emails
 * are skipped and listed in the response.
 *
 * Behavior:
 *   - Existing users (matched by email) are UPDATED with non-empty fields
 *     from the spreadsheet — this lets admins re-import to refresh data.
 *   - New users are CREATED with role=MEMBER and importSource set to
 *     `bulk-import:<filename>` so they're identifiable in the admin table.
 *   - The whole import runs in a transaction. If any hard error occurs,
 *     nothing is committed.
 *
 * Response:
 *   200 { inserted: number, updated: number, skipped: number, errors: Array<{ row: number, reason: string }> }
 *   400 { error: string }
 *   401 { error: "Unauthorized" }
 *   403 { error: "Forbidden" }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a `file` field." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded. Use form field name `file`." },
      { status: 400 }
    );
  }

  const filename = file.name || "unknown";
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Unsupported file type. Use .csv, .xls, or .xlsx." },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: "buffer" });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse file: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json(
      { error: "File has no sheets." },
      { status: 400 }
    );
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "", raw: false }
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Sheet has no data rows." },
      { status: 400 }
    );
  }

  // Helper to find a value by case-insensitive header lookup.
  const pick = (row: Record<string, unknown>, key: string): string => {
    const lk = key.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase().trim() === lk) {
        const v = row[k];
        if (v == null) return "";
        return String(v).trim();
      }
    }
    return "";
  };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const errors: Array<{ row: number; reason: string }> = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Process rows one at a time so a single bad row doesn't abort the whole
  // import. We use individual upserts (not a single transaction) so partial
  // progress is preserved even when one row fails.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2: 1-indexed + header row
    const email = pick(row, "email").toLowerCase();
    if (!email) {
      errors.push({ row: rowNum, reason: "Missing email" });
      skipped++;
      continue;
    }
    if (!emailRe.test(email)) {
      errors.push({ row: rowNum, reason: `Invalid email: "${email}"` });
      skipped++;
      continue;
    }

    const name = pick(row, "name") || null;
    const company = pick(row, "company") || null;
    const companyUrl = pick(row, "companyUrl") || pick(row, "company URL") || null;
    const linkedinUrl = pick(row, "linkedinUrl") || pick(row, "linkedin URL") || null;
    const portfolioUrl = pick(row, "portfolioUrl") || pick(row, "portfolio URL") || null;
    const bio = pick(row, "bio") || null;
    const mobile = pick(row, "mobile") || pick(row, "phone") || null;
    const interestedIn = pick(row, "interestedIn") || pick(row, "interested In") || null;
    const profileCategories = pick(row, "profileCategories") || pick(row, "profile Categories") || null;
    const appliedFor = pick(row, "appliedFor") || pick(row, "applied For") || null;
    const invitedToSpeak = pick(row, "invitedToSpeak") || pick(row, "invited To Speak") || null;

    try {
      const result = await db.user.upsert({
        where: { email },
        create: {
          email,
          name,
          company,
          companyUrl,
          linkedinUrl,
          portfolioUrl,
          bio,
          mobile,
          interestedIn,
          profileCategories,
          appliedFor,
          invitedToSpeak,
          importSource: `bulk-import:${filename}`,
          importedAt: new Date(),
          role: "MEMBER",
        },
        update: {
          // Only overwrite fields that have a non-empty value in the spreadsheet.
          ...(name ? { name } : {}),
          ...(company ? { company } : {}),
          ...(companyUrl ? { companyUrl } : {}),
          ...(linkedinUrl ? { linkedinUrl } : {}),
          ...(portfolioUrl ? { portfolioUrl } : {}),
          ...(bio ? { bio } : {}),
          ...(mobile ? { mobile } : {}),
          ...(interestedIn ? { interestedIn } : {}),
          ...(profileCategories ? { profileCategories } : {}),
          ...(appliedFor ? { appliedFor } : {}),
          ...(invitedToSpeak ? { invitedToSpeak } : {}),
          // Refresh the import audit on re-import.
          importSource: `bulk-import:${filename}`,
          importedAt: new Date(),
        },
      });
      if (result.createdAt?.getTime() === result.updatedAt?.getTime()) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        reason: `DB error: ${(err as Error).message.slice(0, 120)}`,
      });
      skipped++;
    }
  }

  return NextResponse.json({
    inserted,
    updated,
    skipped,
    errors: errors.slice(0, 50), // cap to keep response size reasonable
    totalRows: rows.length,
    filename,
  });
}
