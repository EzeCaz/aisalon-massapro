import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

/**
 * POST /api/admin/registrants/bulk-import
 *
 * Bulk-import event registrants (RSVPs) from a CSV or XLS/XLSX file.
 *
 * Accepts multipart/form-data with:
 *   - `file`    : the spreadsheet file (required)
 *   - `eventId` : the event ID to attach every RSVP to (required)
 *
 * Supported columns (case-insensitive headers):
 *   email (required), name, status, source
 *
 * `status` values: GOING (default), MAYBE, NOT_GOING.
 * `source` values: IMPORT (default), MANUAL, EVENT_PAGE.
 *
 * Behavior:
 *   - For each row, an EventRsvp record is upserted on (eventId, email).
 *   - If the email matches a platform user, the RSVP is linked via userId.
 *   - Duplicate emails in the same sheet are silently de-duped by the
 *     upsert (last row wins).
 *   - Invalid emails are skipped and listed in the response.
 *
 * Response:
 *   200 { inserted: number, updated: number, skipped: number, errors: Array<{ row: number, reason: string }>, totalRows: number, filename: string }
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
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with `file` and `eventId` fields." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  const eventId = (form.get("eventId") as string | null)?.trim();

  if (!eventId) {
    return NextResponse.json(
      { error: "Missing `eventId` form field." },
      { status: 400 }
    );
  }
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

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json(
      { error: `Event ${eventId} not found.` },
      { status: 404 }
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
  const validStatuses = new Set(["GOING", "MAYBE", "NOT_GOING"]);
  const errors: Array<{ row: number; reason: string }> = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
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
    let status = pick(row, "status").toUpperCase();
    if (status && !validStatuses.has(status)) {
      errors.push({
        row: rowNum,
        reason: `Invalid status "${status}" (use GOING, MAYBE, or NOT_GOING). Defaulting to GOING.`,
      });
      status = "";
    }
    let source = pick(row, "source").toUpperCase();
    if (source && !["IMPORT", "MANUAL", "EVENT_PAGE"].includes(source)) {
      source = "IMPORT";
    }

    try {
      const linkedUser = await db.user.findUnique({
        where: { email },
        select: { id: true },
      });

      const before = await db.eventRsvp.findUnique({
        where: { eventId_email: { eventId, email } },
        select: { id: true, createdAt: true },
      });

      await db.eventRsvp.upsert({
        where: { eventId_email: { eventId, email } },
        create: {
          eventId,
          email,
          name,
          status: status || "GOING",
          source: source || "IMPORT",
          userId: linkedUser?.id || null,
        },
        update: {
          // Don't overwrite an existing RSVP — just refresh name + status.
          ...(name ? { name } : {}),
          ...(status ? { status } : {}),
        },
      });

      if (before) {
        updated++;
      } else {
        inserted++;
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
    errors: errors.slice(0, 50),
    totalRows: rows.length,
    filename,
    eventTitle: event.title,
  });
}
