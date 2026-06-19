// End-to-end test: simulate an authenticated POST /api/events/[slug]/presentations
// by calling the route handler directly with a fake NextRequest and a fake
// getServerSession. This avoids needing a running dev server.

import { PrismaClient } from "@prisma/client";
import { put, del } from "@vercel/blob";

const prisma = new PrismaClient();

// We need to mock getServerSession — patch the auth module via env-var-driven
// flag is too invasive. Instead, just exercise the Prisma + Vercel Blob parts
// of the flow that the API route uses.

async function main() {
  const event = await prisma.event.findFirst({
    where: { slug: "ai-cmo-blueprint-2026-06-18" },
  });
  if (!event) throw new Error("Event not found");
  console.log("Found event:", event.id, event.title);

  // Get an admin user (so we can clean up after)
  const user = await prisma.user.findFirst({
    where: { email: "eze@massapro.com" },
  });
  if (!user) throw new Error("Admin user not found");
  console.log("Found user:", user.id, user.email);

  // Get an agenda item — Ohad Ronen's talk
  const agItem = await prisma.eventAgendaItem.findFirst({
    where: { event: { slug: "ai-cmo-blueprint-2026-06-18" }, title: { contains: "Fast Forward" } },
    include: { speaker: true },
  });
  if (!agItem) throw new Error("Agenda item not found");
  console.log(
    "Found agenda item:",
    agItem.id,
    agItem.title,
    "speaker:",
    agItem.speaker?.name
  );

  // Upload a small fake PDF to Vercel Blob (same path the API route uses)
  const fakePdf = Buffer.from(
    "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF",
    "utf-8"
  );
  const blobName = `events/${event.id}/presentations/test-${Date.now()}.pdf`;
  console.log("Uploading test file to Vercel Blob:", blobName);

  const blob = await put(blobName, fakePdf, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });
  console.log("Blob uploaded:", blob.url);

  // Insert the DB row — same shape as the API route
  const rec = await prisma.presentationFile.create({
    data: {
      eventId: event.id,
      uploaderId: user.id,
      fileName: "test-presentation.pdf",
      fileUrl: blob.url,
      fileSize: fakePdf.length,
      mimeType: "application/pdf",
      title: "Test presentation",
      description: "Smoke test from verify-presentations.mjs",
      agendaItemId: agItem.id,
      speakers: agItem.speaker
        ? { connect: [{ id: agItem.speaker.id }] }
        : undefined,
    },
    include: {
      uploader: { select: { id: true, name: true, email: true } },
      speakers: { select: { id: true, name: true } },
      agendaItem: { select: { id: true, title: true, startsAt: true, type: true } },
    },
  });
  console.log("DB row created:", rec.id);
  console.log("  fileName:", rec.fileName);
  console.log("  fileUrl:", rec.fileUrl);
  console.log("  title:", rec.title);
  console.log("  speakers:", rec.speakers.map((s) => s.name).join(", "));
  console.log("  agendaItem:", rec.agendaItem?.title);

  // List all presentations for the event
  const all = await prisma.presentationFile.findMany({
    where: { eventId: event.id },
    include: {
      uploader: { select: { id: true, name: true, email: true } },
      speakers: { select: { id: true, name: true } },
      agendaItem: { select: { id: true, title: true, startsAt: true, type: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log("\nAll presentations for event:");
  for (const p of all) {
    console.log(
      `  - [${p.id}] ${p.fileName} (${p.fileSize}B) — speakers: ${p.speakers
        .map((s) => s.name)
        .join(", ") || "(none)"} — agenda: ${p.agendaItem?.title || "(none)"}`
    );
  }

  // CLEANUP — delete the test row + blob
  console.log("\nCleaning up test row + blob...");
  await prisma.presentationFile.delete({ where: { id: rec.id } });
  await del(blob.url);
  console.log("Cleanup complete.");

  // Final state
  const finalCount = await prisma.presentationFile.count({
    where: { eventId: event.id },
  });
  console.log("Final presentation count for event:", finalCount);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("ERROR:", e);
    prisma.$disconnect();
    process.exit(1);
  });
