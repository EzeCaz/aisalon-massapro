/**
 * scripts/set-cazhype-coma-brand.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off script: set brandSlug="coma" on the eze@cazhype.com user row.
 *
 * WHY:
 *   The user asked that eze@cazhype.com be the first Coma-branded member.
 *   All other members default to AIS (null brandSlug → AIS via
 *   FALLBACK_DEFAULT_BRAND in src/lib/brand/brand-config.ts).
 *
 *   After this script runs:
 *     - eze@cazhype.com sees Coma branding across the app (navy/amber
 *       palette, Coma wordmark, Coma logo)
 *     - The admin page scopes their data to "Coma content only" —
 *       events list is empty (no Coma events exist yet), members list
 *       shows 0 (or eventually only Coma members), etc.
 *     - The chapter onboarding form, if sent to this user, renders with
 *       Coma branding and saves brand="coma" in the submission JSON.
 *
 * USAGE:
 *   node scripts/set-cazhype-coma-brand.cjs
 *
 * SAFETY:
 *   - Idempotent: safe to re-run (just sets brandSlug="coma" again).
 *   - Only updates the one user matching email = "eze@cazhype.com".
 *   - If the user doesn't exist, exits with a warning (no error).
 *   - If the User.brandSlug column doesn't exist, exits with a clear
 *     error message telling the operator to run the migration first.
 */

const { PrismaClient } = require('@prisma/client');

const TARGET_EMAIL = 'eze@cazhype.com';
const TARGET_BRAND_SLUG = 'coma';

async function main() {
  const prisma = new PrismaClient();

  console.log(`[set-coma-brand] Looking up user ${TARGET_EMAIL}...`);

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: TARGET_EMAIL },
      select: { id: true, email: true, name: true, brandSlug: true },
    });
  } catch (err) {
    console.error(`[set-coma-brand] ERROR looking up user:`, err?.message || err);
    console.error(`[set-coma-brand] The User.brandSlug column may not exist yet.`);
    console.error(`[set-coma-brand] Run migration 20260811120000_add_user_brand_slug first:`);
    console.error(`[set-coma-brand]   npx prisma migrate deploy`);
    process.exit(1);
  }

  if (!user) {
    console.warn(`[set-coma-brand] User not found: ${TARGET_EMAIL}`);
    console.warn(`[set-coma-brand] Ask the user to sign in once first (the row is created on first sign-in), then re-run this script.`);
    process.exit(0);
  }

  if (user.brandSlug === TARGET_BRAND_SLUG) {
    console.log(`[set-coma-brand] User ${TARGET_EMAIL} already has brandSlug="${TARGET_BRAND_SLUG}". No change needed.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`[set-coma-brand] Current brandSlug: ${user.brandSlug ?? 'null'}`);
  console.log(`[set-coma-brand] Setting brandSlug="${TARGET_BRAND_SLUG}"...`);

  await prisma.user.update({
    where: { id: user.id },
    data: { brandSlug: TARGET_BRAND_SLUG },
  });

  console.log(`[set-coma-brand] ✓ Done. User ${TARGET_EMAIL} is now a Coma-branded member.`);
  console.log(`[set-coma-brand]   - Next sign-in: JWT will have brandSlug="coma"`);
  console.log(`[set-coma-brand]   - /admin will render with Coma branding (navy/amber)`);
  console.log(`[set-coma-brand]   - /admin will scope events/members to Coma content only (currently empty)`);
  console.log(`[set-coma-brand]   - /chapter-onboarding/[token] invites sent to this user will render with Coma branding`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[set-coma-brand] FATAL:', err && (err.message || err));
  process.exit(1);
});
