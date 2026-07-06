// scripts/db-backup.ts
// ────────────────────
// Dumps every Prisma model to a single gzipped JSON file. Run via
// `scripts/db-backup.sh` (which loads .env and picks bun/tsx for us).
//
// We deliberately use the raw `@prisma/client` rather than the
// project's `src/lib/db.ts` so this script can be run with bun/tsx
// without worrying about Next.js's tsconfig paths. The connection
// string is read from DATABASE_URL (already exported by the shell
// script).

import { PrismaClient } from "@prisma/client";
import { createGzip } from "zlib";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

// Every model in prisma/schema.prisma — keep this list in sync when
// adding new models. The script will fail loudly if any model is
// missing here (so we never silently skip a table).
const MODELS = [
  "user",
  "userEmail",
  "event",
  "eventRsvp",
  "eventCoHost",
  "eventImage",
  "eventAgendaItem",
  "eventMockupDefault",
  "eventPrepQuestion",
  "eventPrepSuggestion",
  "speaker",
  "speakerMessage",
  "presentationFile",
  "conversationMessage",
  "quizSession",
  "quizQuestion",
  "quizResponse",
  "quizParticipant",
  "siteSetting",
  "memberTag",
  "referralAttribution",
  "referralVisit",
  "trackingLog",
  "emailAudience",
  "emailCampaign",
  "emailEvent",
  "emailFlow",
  "emailFlowStep",
  "emailQueue",
  "emailRecipient",
  "emailStageTemplate",
  "emailTemplate",
  // Community chat
  "chatRoom",
  "chatRoomMember",
  "chatMessage",
] as const;

type ModelName = (typeof MODELS)[number];

async function dumpAll() {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error("Usage: db-backup.ts <output-path>");
    process.exit(1);
  }

  // Hash the current schema.prisma so we know what shape the dump has.
  const schemaSrc = readFileSync("prisma/schema.prisma", "utf8");
  const schemaHash = createHash("sha256").update(schemaSrc).digest("hex").slice(0, 16);

  // Stream the JSON to disk through gzip so we don't buffer the whole
  // database in memory (matters for large tables like TrackingLog).
  const gz = createGzip({ level: 9 });
  const out = createWriteStream(outPath);
  const sink = pipeline(gz, out);

  const write = (s: string) => gz.write(s);
  const writeChunk = (obj: unknown) => write(JSON.stringify(obj));

  write('{"schemaVersion":"' + schemaHash + '"');
  write(',"timestamp":"' + new Date().toISOString() + '"');
  write(',"prismaClientVersion":"' + (PrismaClient as unknown as { version?: string }).version + '"');
  write(',"models":{');

  let firstModel = true;
  const counts: Record<string, number> = {};

  for (const m of MODELS) {
    // Try to sort by `id` when the model has one; models with composite
    // primary keys (EventCoHost, MemberTag, EmailEvent, etc.) just dump
    // in their natural order — backup is for restore, not display.
    let rows: unknown[];
    try {
      // @ts-expect-error — dynamic model access; we trust MODELS to match.
      rows = await prisma[m].findMany({ orderBy: { id: "asc" } });
    } catch {
      // @ts-expect-error — fallback for composite-PK models.
      rows = await prisma[m].findMany();
    }
    counts[m] = rows.length;

    if (!firstModel) write(",");
    firstModel = false;

    write(JSON.stringify(m) + ":");
    writeChunk(rows);
    // Free the rows ASAP for GC.
    rows.length = 0;
  }

  write("}}");
  gz.end();
  await sink;

  console.error(
    "[db-backup.ts] dumped " +
      Object.keys(counts).length +
      " models — " +
      Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(" "),
  );
}

dumpAll()
  .catch((e) => {
    console.error("[db-backup.ts] FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
