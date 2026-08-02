import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import {
  setChapterBrandImage,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
} from "@/lib/chapter-brand-images";
import {
  setSetting,
  K_FAVICON,
  K_LOGIN_HERO as K_GLOBAL_LOGIN_HERO,
  K_LOGIN_BANNER as K_GLOBAL_LOGIN_BANNER,
  DEFAULTS,
} from "@/lib/site-settings";

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

  // 2b. PER USER SPEC 2026-08-02: Seed Tel Aviv's chapter-scoped brand
  // image overrides. The Tel Aviv chapter has its own login hero and
  // login banner distinct from the global defaults. These are stored in
  // the ChapterSetting table and take precedence over SiteSetting when
  // a visitor is on /c/tel-aviv or /login?chapterSlug=tel-aviv.
  // Idempotent: re-calling just re-writes the same values.
  const TLV_LOGIN_HERO =
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393632010-jeorqc.png";
  const TLV_LOGIN_BANNER =
    "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782393696779-dr4rkl.jpg";

  await setChapterBrandImage(chapter.id, K_LOGIN_HERO, TLV_LOGIN_HERO, user.id);
  await setChapterBrandImage(chapter.id, K_LOGIN_BANNER, TLV_LOGIN_BANNER, user.id);
  // Note: favicon is NOT overridden at the chapter level — Tel Aviv uses
  // the global favicon default (1782393850874-uwkddr.webp). Per user spec:
  // "For global and all chapters and countries: This is the main favicon".

  // 2c. PER USER SPEC 2026-08-02 (corrected): Upsert the 3 GLOBAL
  // SiteSetting rows for favicon, loginHero, and loginBanner so the
  // production DB stores the canonical AI Salon brand assets — not
  // the placeholder /images/falafel-meerkat.jpg that was the previous
  // loginBanner default. Idempotent: re-calling just re-writes the same
  // values.
  //
  // This is critical because:
  //   - If the SiteSetting table has NO row for a key, getPublicSettings()
  //     falls back to DEFAULTS (which are now correct after this commit).
  //   - But if the table has a STALE row from an earlier admin click
  //     (e.g. loginBanner = /images/falafel-meerkat.jpg), that stale row
  //     takes precedence over DEFAULTS. This upsert overwrites the stale
  //     row with the canonical brand-asset URL.
  //   - After this seed runs, the deployed app will use the correct
  //     global favicon / loginHero / loginBanner regardless of what was
  //     previously stored in the DB.
  const GLOBAL_FAVICON = DEFAULTS[K_FAVICON];
  const GLOBAL_LOGIN_HERO = DEFAULTS[K_GLOBAL_LOGIN_HERO];
  const GLOBAL_LOGIN_BANNER = DEFAULTS[K_GLOBAL_LOGIN_BANNER];

  await setSetting(K_FAVICON, GLOBAL_FAVICON, user.id);
  await setSetting(K_GLOBAL_LOGIN_HERO, GLOBAL_LOGIN_HERO, user.id);
  await setSetting(K_GLOBAL_LOGIN_BANNER, GLOBAL_LOGIN_BANNER, user.id);

  // 3. Backfill NULLs
  // SUPER_ADMIN users keep NULL scope (global).
  // TSK-0056: Use AND (not OR) so we ONLY backfill users whose scope is
  // COMPLETELY unset (both countryId AND chapterId NULL). The previous
  // OR condition would silently overwrite a partial scope — e.g. a
  // Montreal admin (chapterId=montreal, countryId=NULL) would have BOTH
  // fields overwritten to Israel/Tel Aviv, destroying their Montreal
  // assignment. Now partial-scope users are left alone for the Super
  // Admin to fix manually via /admin/members/[id].
  const userBackfill = await db.user.updateMany({
    where: {
      AND: [
        { countryId: null },
        { chapterId: null },
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
      // PER USER SPEC 2026-08-02: report the seeded chapter-scoped brand
      // image overrides so the caller can verify they were written.
      brandImageOverrides: {
        loginHero: TLV_LOGIN_HERO,
        loginBanner: TLV_LOGIN_BANNER,
      },
    },
    // PER USER SPEC 2026-08-02 (corrected): report the seeded GLOBAL brand
    // image settings so the caller can verify the canonical AI Salon brand
    // assets are now stored in the SiteSetting table.
    globalBrandSettings: {
      favicon: GLOBAL_FAVICON,
      loginHero: GLOBAL_LOGIN_HERO,
      loginBanner: GLOBAL_LOGIN_BANNER,
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
