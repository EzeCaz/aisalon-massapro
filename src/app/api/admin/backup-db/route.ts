/**
 * POST /api/admin/backup-db
 *
 * Exports the entire database as a JSON dump and uploads it to Vercel
 * Blob Storage (persistent offsite backup). Returns the Blob URL +
 * a download URL the user can click.
 *
 * Format:
 *   {
 *     version: 1,
 *     createdAt: ISO,
 *     tables: {
 *       [tableName]: {
 *         columns: string[],
 *         rows: any[][],
 *         count: number,
 *       }
 *     }
 *   }
 *
 * The dump is a plain JSON object — no Prisma types, no Date objects
 * (all dates are serialized as ISO strings). It can be restored via
 * a companion script (TODO) or inspected manually.
 *
 * Auth: ADMIN or SUPER_ADMIN only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put } from "@vercel/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 min — large DBs may take a while

// All Prisma model names (in dependency order — parents before children
// where it matters for restore). Order doesn't strictly matter for a
// JSON dump but is convenient for review.
const TABLES = [
  "user",
  "userEmail",
  "memberTag",
  "siteSetting",
  "event",
  "eventMockupDefault",
  "eventImage",
  "eventAgendaItem",
  "eventCoHost",
  "eventPrepQuestion",
  "eventPrepSuggestion",
  "speaker",
  "speakerMessage",
  "presentationFile",
  "eventRsvp",
  "referralVisit",
  "referralAttribution",
  "emailTemplate",
  "emailStageTemplate",
  "emailCampaign",
  "emailRecipient",
  "emailEvent",
  "emailAudience",
  "emailFlow",
  "emailFlowStep",
  "emailQueue",
  "trackingLog",
  "conversationMessage",
  "quizSession",
  "quizQuestion",
  "quizResponse",
  "quizParticipant",
  "chatRoom",
  "chatRoomMember",
  "chatMessage",
] as const;

type TableName = (typeof TABLES)[number];

export async function POST(req: NextRequest) {
  // ── Auth ──
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (me?.role !== "ADMIN" && me?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const createdAt = new Date();
    const dump: any = {
      version: 1,
      createdAt: createdAt.toISOString(),
      schema: "prisma",
      tables: {},
    };

    let totalRows = 0;

    for (const table of TABLES) {
      try {
        // Use $queryRaw to dump everything as raw rows (no Prisma type
        // conversion). Cast each row to a plain object so Date fields
        // get JSON.stringify()'d to ISO strings.
        const rows: any[] = await (db as any)[table].findMany({
          // No select — dump every column.
        });
        const serialized = rows.map((row) => serializeRow(row));
        dump.tables[table] = {
          count: serialized.length,
          rows: serialized,
        };
        totalRows += serialized.length;
      } catch (err: any) {
        // If a table doesn't exist (e.g. migration hasn't been applied
        // for a new model), record the error and continue.
        dump.tables[table] = {
          count: 0,
          rows: [],
          error: String(err?.message ?? err),
        };
      }
    }

    dump.totalRows = totalRows;
    dump.tableCount = TABLES.length;

    const jsonStr = JSON.stringify(dump, null, 2);
    const bytes = Buffer.byteLength(jsonStr, "utf8");

    // Build a filename like: aisalon-backup-2026-07-12T03-15-42Z.json
    const safeTs = createdAt.toISOString().replace(/[:.]/g, "-");
    const filename = `aisalon-backup-${safeTs}.json`;
    const blobPath = `backups/${filename}`;

    let blobUrl: string | null = null;
    let blobError: string | null = null;

    // Upload to Vercel Blob (if configured).
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(blobPath, jsonStr, {
          access: "public",
          contentType: "application/json; charset=utf-8",
          addRandomSuffix: false,
        });
        blobUrl = blob.url;
      } catch (err: any) {
        blobError = String(err?.message ?? err);
      }
    } else {
      blobError = "BLOB_READ_WRITE_TOKEN not configured — saved to response only";
    }

    // Also return the JSON inline so the user can download it directly
    // (the response itself IS the backup file).
    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Backup-Blob-Url": blobUrl ?? "",
        "X-Backup-Blob-Error": blobError ?? "",
        "X-Backup-Bytes": String(bytes),
        "X-Backup-Rows": String(totalRows),
        "X-Backup-Filename": filename,
      },
    });
  } catch (err: any) {
    console.error("[backup-db] failed:", err);
    return NextResponse.json(
      { error: "backup_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

// ── Helpers ──

function serializeRow(row: any): any {
  if (row === null || row === undefined) return row;
  if (row instanceof Date) return row.toISOString();
  if (Array.isArray(row)) return row.map(serializeRow);
  if (typeof row === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = serializeRow(v);
    }
    return out;
  }
  // Prisma returns Decimal/BigInt as objects in some cases — stringify them.
  if (typeof row === "bigint") return row.toString();
  if (row && typeof row.toJSON === "function") {
    try {
      return row.toJSON();
    } catch {
      return String(row);
    }
  }
  return row;
}
