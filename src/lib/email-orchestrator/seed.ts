/**
 * Idempotent seed for the email orchestrator.
 *
 * Creates (if missing):
 *   - 5 EmailStageTemplate rows (one per stage) with default subjects + HTML
 *   - 6 mock Users (3 active RSVPs + 3 already-checked-in for stop-awareness demo)
 *   - 1 Event (in the near future so stage 1 fires immediately)
 *   - 6 EventRsvp rows (3 GOING + 3 GOING with doorCheckedAt set)
 *
 * Run via `POST /api/email-orchestrator/seed`. Safe to call multiple times —
 * existing rows are reused, not duplicated.
 */

import { db } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "./templates";
import { STAGES } from "./stages";

export type SeedResult = {
  templates: { created: number; existing: number };
  users: { created: number; existing: number };
  event: { id: string; title: string; slug: string };
  rsvps: { created: number; existing: number; checkedIn: number; active: number };
};

const SEED_EVENT_SLUG = "email-orchestrator-demo";

const SEED_USERS = [
  { email: "rachel.demo+active@aisalon.test", name: "Rachel Cohen" },
  { email: "daniel.demo+active@aisalon.test", name: "Daniel Levy" },
  { email: "maya.demo+active@aisalon.test", name: "Maya Shapiro" },
  { email: "yossi.demo+checked@aisalon.test", name: "Yossi Friedman" },
  { email: "noa.demo+checked@aisalon.test", name: "Noa Mizrahi" },
  { email: "avi.demo+checked@aisalon.test", name: "Avi Goldberg" },
];

export async function runSeed(): Promise<SeedResult> {
  const result: SeedResult = {
    templates: { created: 0, existing: 0 },
    users: { created: 0, existing: 0 },
    event: { id: "", title: "", slug: SEED_EVENT_SLUG },
    rsvps: { created: 0, existing: 0, checkedIn: 0, active: 0 },
  };

  // ── Templates ──────────────────────────────────────────────────────────
  for (const stageCfg of STAGES) {
    const existing = await db.emailStageTemplate.findUnique({
      where: { stage: stageCfg.stage },
    });
    if (existing) {
      result.templates.existing++;
      continue;
    }
    const def = DEFAULT_TEMPLATES[stageCfg.stage];
    await db.emailStageTemplate.create({
      data: {
        stage: stageCfg.stage,
        name: def.name,
        subject: def.subject,
        htmlBody: def.html,
        stopIfNotOpenedHours: stageCfg.stopIfNotOpenedHours,
        isActive: true,
      },
    });
    result.templates.created++;
  }

  // ── Users ──────────────────────────────────────────────────────────────
  const userIds: { id: string; email: string; name: string | null }[] = [];
  for (const u of SEED_USERS) {
    let row = await db.user.findUnique({ where: { email: u.email } });
    if (row) {
      result.users.existing++;
    } else {
      row = await db.user.create({
        data: {
          email: u.email,
          name: u.name,
          role: "MEMBER",
          onboardedAt: new Date(),
        },
      });
      result.users.created++;
    }
    userIds.push({ id: row.id, email: row.email, name: row.name });
  }

  // ── Event ──────────────────────────────────────────────────────────────
  // Schedule the event 9 days from now → stage 1 (offset -240h = -10d) is
  // already in the past → worker will fire stage 1 immediately on the
  // first run after seed.
  const startsAt = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

  let event = await db.event.findUnique({
    where: { slug: SEED_EVENT_SLUG },
  });
  if (!event) {
    event = await db.event.create({
      data: {
        slug: SEED_EVENT_SLUG,
        title: "AI Salon Tel Aviv — Email Orchestrator Demo",
        subtitle: "A live preview of the 5-stage email sequence",
        chapter: "Tel Aviv",
        venue: "MassaPro Studio",
        address: "Rothschild Blvd 1, Tel Aviv",
        city: "Tel Aviv",
        country: "ISR",
        mapUrl: "https://maps.google.com/?q=Rothschild+Tel+Aviv",
        startsAt,
        endsAt,
        description:
          "This is a mock event used to demonstrate the email orchestrator. It will trigger the 5-stage sequence: awareness → reminder → final-prep → day-of → recap.",
        takeaways:
          "See how the orchestrator schedules, sends, and tracks emails at each stage.",
        intendedFor: "Admins previewing the email system.",
      },
    });
  } else {
    // Refresh dates so the demo is always live.
    event = await db.event.update({
      where: { id: event.id },
      data: { startsAt, endsAt },
    });
  }
  result.event.id = event.id;
  result.event.title = event.title;

  // ── RSVPs ──────────────────────────────────────────────────────────────
  // First 3 users = active (no check-in). Last 3 = already checked in
  // (stop-awareness demo — worker should skip their stages).
  const checkInCodeChars = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  for (let i = 0; i < userIds.length; i++) {
    const u = userIds[i];
    const isCheckedIn = i >= 3;
    const email = `${u.email}`; // RSVP email may differ from user email;
    // for the demo we use the same.

    const existing = await db.eventRsvp.findUnique({
      where: { eventId_email: { eventId: event.id, email: u.email } },
    });
    if (existing) {
      result.rsvps.existing++;
      if (existing.doorCheckedAt) result.rsvps.checkedIn++;
      else result.rsvps.active++;
      continue;
    }

    const checkInCode = isCheckedIn
      ? Array.from({ length: 8 })
          .map(() => checkInCodeChars[Math.floor(Math.random() * checkInCodeChars.length)])
          .join("")
          .replace(/^(.{4})(.{4})$/, "$1-$2")
      : null;

    await db.eventRsvp.create({
      data: {
        eventId: event.id,
        userId: u.id,
        email: u.email,
        name: u.name || undefined,
        status: "GOING",
        source: "IMPORT",
        checkInCode,
        checkedInAt: isCheckedIn ? new Date() : null,
        doorCheckedAt: isCheckedIn ? new Date() : null,
        doorCheckedBy: isCheckedIn ? "seed" : null,
      },
    });
    result.rsvps.created++;
    if (isCheckedIn) result.rsvps.checkedIn++;
    else result.rsvps.active++;
  }

  return result;
}

/**
 * Tear down the seed (for development reset). Deletes EmailQueue,
 * TrackingLog, RSVPs, Event, Users, and Templates created by runSeed.
 * Identifies seed rows by email/slug patterns.
 */
export async function clearSeed(): Promise<{
  deleted: { queue: number; logs: number; rsvps: number; event: number; users: number; templates: number };
}> {
  // Delete in dependency order (children first).
  const seedUsers = await db.user.findMany({
    where: { email: { contains: "@aisalon.test" } },
    select: { id: true },
  });
  const userIds = seedUsers.map((u) => u.id);
  const event = await db.event.findUnique({
    where: { slug: SEED_EVENT_SLUG },
    select: { id: true },
  });

  let queue = 0,
    logs = 0,
    rsvps = 0,
    events = 0,
    users = 0,
    templates = 0;

  if (event) {
    const eventRsvps = await db.eventRsvp.findMany({
      where: { eventId: event.id },
      select: { id: true },
    });
    const rsvpIds = eventRsvps.map((r) => r.id);
    if (rsvpIds.length) {
      queue = await db.emailQueue.deleteMany({
        where: { rsvpId: { in: rsvpIds } },
      }).then((r) => r.count);
      logs = await db.trackingLog.deleteMany({
        where: { queue: { rsvpId: { in: rsvpIds } } },
      }).then((r) => r.count);
      rsvps = await db.eventRsvp.deleteMany({
        where: { id: { in: rsvpIds } },
      }).then((r) => r.count);
    }
    events = await db.event.deleteMany({
      where: { id: event.id },
    }).then((r) => r.count);
  }

  if (userIds.length) {
    users = await db.user.deleteMany({
      where: { id: { in: userIds } },
    }).then((r) => r.count);
  }

  templates = await db.emailStageTemplate.deleteMany({}).then((r) => r.count);

  return { deleted: { queue, logs, rsvps, event: events, users, templates } };
}
