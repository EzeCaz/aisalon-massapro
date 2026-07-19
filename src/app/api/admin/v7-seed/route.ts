import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";

// ============================================================================
// POST /api/admin/v7-seed
// ============================================================================
// Production-safe V7 hierarchy seed + backfill — same logic as the local
// scripts/v7-seed-israel-tel-aviv.ts, but exposed as an HTTP endpoint so
// Super Admins can trigger it from the deployed Vercel app without needing
// shell access or a gitignored local script.
//
// WHAT IT DOES
//   1. Upserts Country "Israel" (code=IL, slug=israel, flagEmoji=🇮🇱)
//   2. Upserts Chapter "Tel Aviv" (slug=tel-aviv, timezone=Asia/Jerusalem,
//      countryId=Israel.id, city="Tel Aviv-Yafo")
//   3. Backfills every existing row that has NULL countryId / chapterId
//      to Israel / Tel Aviv. Covers: User (except SUPER_ADMIN), Event
//      (except cross-chapter), EventRsvp, Speaker, EmailQueue,
//      EmailRecipient, EmailCampaign, EmailTemplate, EmailStageTemplate,
//      EmailFlow, EmailAudience, ReferralVisit, ReferralAttribution.
//   4. Returns a verification report (counts per country/chapter +
//      remaining-NULL sanity check).
//
// IDEMPOTENT — safe to call multiple times. Re-calls produce 0 updates.
//
// SCOPE: Super Admin only.
// ============================================================================

export async function POST() {
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;

  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    return NextResponse.json(
      { error: "Only Super Admin can run the V7 seed." },
      { status: 403 }
    );
  }

  const startedAt = Date.now();
  const updates: Record<string, number> = {};

  // 1. Upsert Country
  const country = await db.country.upsert({
    where: { slug: "israel" },
    update: { code: "IL", name: "Israel", flagEmoji: "🇮🇱" },
    create: {
      name: "Israel",
      code: "IL",
      slug: "israel",
      flagEmoji: "🇮🇱",
      isActive: true,
    },
  });

  // 2. Upsert Chapter
  const chapter = await db.chapter.upsert({
    where: { slug: "tel-aviv" },
    update: {
      countryId: country.id,
      city: "Tel Aviv-Yafo",
      timezone: "Asia/Jerusalem",
    },
    create: {
      name: "Tel Aviv",
      slug: "tel-aviv",
      countryId: country.id,
      city: "Tel Aviv-Yafo",
      timezone: "Asia/Jerusalem",
      isActive: true,
    },
  });

  // 3. Backfill NULLs
  // SUPER_ADMIN users keep NULL scope (global).
  const userBackfill = await db.user.updateMany({
    where: {
      AND: [
        { OR: [{ countryId: null }, { chapterId: null }] },
        { role: { not: "SUPER_ADMIN" } },
      ],
    },
    data: { countryId: country.id, chapterId: chapter.id },
  });
  updates.users = userBackfill.count;

  const eventBackfill = await db.event.updateMany({
    where: { chapterId: null, isCrossChapter: false },
    data: { chapterId: chapter.id },
  });
  updates.events = eventBackfill.count;

  const rsvpBackfill = await db.eventRsvp.updateMany({
    where: { chapterId: null },
    data: { chapterId: chapter.id },
  });
  updates.eventRsvps = rsvpBackfill.count;

  const speakerBackfill = await db.speaker.updateMany({
    where: { chapterId: null },
    data: { chapterId: chapter.id },
  });
  updates.speakers = speakerBackfill.count;

  const emailTables = [
    "emailQueue",
    "emailRecipient",
    "emailCampaign",
    "emailTemplate",
    "emailStageTemplate",
    "emailFlow",
    "emailAudience",
  ] as const;

  for (const table of emailTables) {
    // @ts-expect-error — dynamic table name
    const result = await db[table].updateMany({
      where: { chapterId: null },
      data: { chapterId: chapter.id },
    });
    updates[table] = result.count;
  }

  const refVisitBackfill = await db.referralVisit.updateMany({
    where: { chapterId: null },
    data: { chapterId: chapter.id },
  });
  updates.referralVisits = refVisitBackfill.count;

  const refAttrBackfill = await db.referralAttribution.updateMany({
    where: { chapterId: null },
    data: { chapterId: chapter.id },
  });
  updates.referralAttributions = refAttrBackfill.count;

  // 4. Verification report
  const countries = await db.country.findMany({
    include: {
      _count: { select: { users: true, chapters: true } },
      chapters: {
        include: {
          _count: {
            select: {
              users: true,
              events: true,
              rsvps: true,
              speakers: true,
              emailQueueItems: true,
            },
          },
        },
      },
    },
  });

  const nullUsers = await db.user.count({
    where: { AND: [{ countryId: null }, { role: { not: "SUPER_ADMIN" } }] },
  });
  const nullRsvps = await db.eventRsvp.count({ where: { chapterId: null } });
  const nullSpeakers = await db.speaker.count({ where: { chapterId: null } });
  const nullEvents = await db.event.count({
    where: { chapterId: null, isCrossChapter: false },
  });

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: true,
    elapsedMs,
    country: { id: country.id, name: country.name, code: country.code },
    chapter: {
      id: chapter.id,
      name: chapter.name,
      slug: chapter.slug,
      city: chapter.city,
    },
    updates,
    verification: {
      countries: countries.map((c) => ({
        name: c.name,
        code: c.code,
        userCount: c._count.users,
        chapterCount: c._count.chapters,
        chapters: c.chapters.map((ch) => ({
          name: ch.name,
          userCount: ch._count.users,
          eventCount: ch._count.events,
          rsvpCount: ch._count.rsvps,
          speakerCount: ch._count.speakers,
          emailQueueCount: ch._count.emailQueueItems,
        })),
      })),
      nullsRemaining: {
        users: nullUsers,
        events: nullEvents,
        eventRsvps: nullRsvps,
        speakers: nullSpeakers,
      },
    },
  });
}
