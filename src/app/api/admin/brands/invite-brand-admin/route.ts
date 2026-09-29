/**
 * POST /api/admin/brands/invite-brand-admin
 *
 * Path 2 of the brand-admin approval flow (Option 4, 2026-09-29):
 * Super Admin invites an existing user to become a BRAND_ADMIN for a
 * specific brand, by email + brandSlug.
 *
 * This is the direct-invite path — no application form, no email
 * round-trip. The Super Admin types a user's email + picks a brand,
 * and the endpoint immediately promotes the user to BRAND_ADMIN
 * scoped to that brand. The user's next login lands them on /admin
 * with brand-scoped access.
 *
 * Body:
 *   {
 *     email:      string  (required, lowercase)
 *     brandSlug:  string  (required, valid Brand.slug)
 *   }
 *
 * Returns:
 *   200 { ok: true, user: { id, email, name }, brand: { slug, displayName } }
 *   400 { error: "Invalid email/brandSlug" }
 *   403 { error: "Forbidden — Super Admin only" }
 *   404 { error: "User not found — ask them to sign up first at /login?brand=<slug>" }
 *   404 { error: "Brand not found" }
 *
 * Security: Super Admin only. Verified via getCurrentUser + isSuperAdmin.
 *
 * NOTE: This endpoint does NOT send an email to the invitee — the user
 * already has an account (we just promoted them). The Super Admin
 * can email them out-of-band, or round 3 can add an optional email
 * notification here.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin, ROLES } from "@/lib/permissions";
import { sendBrandAdminPromotionEmail } from "@/lib/brand-onboarding-email/templates";

type Body = {
  email: string;
  brandSlug: string;
};

const EMAIL_RE = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
  }

  // ── Parse + validate body ──────────────────────────────────────────
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  const brandSlug = (body.brandSlug || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!brandSlug || !SLUG_RE.test(brandSlug)) {
    return NextResponse.json({ error: "Invalid brandSlug (must be 1-32 lowercase letters/digits/hyphens)" }, { status: 400 });
  }

  // ── Look up the brand ───────────────────────────────────────────────
  const brand = await db.brand.findUnique({
    where: { slug: brandSlug },
    select: { id: true, slug: true, displayName: true },
  });
  if (!brand) {
    return NextResponse.json(
      { error: `Brand "${brandSlug}" not found` },
      { status: 404 },
    );
  }

  // ── Look up the user ────────────────────────────────────────────────
  const target = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, brandSlug: true },
  });
  if (!target) {
    return NextResponse.json(
      {
        error: `User "${email}" not found. Ask them to sign up first at /login?brand=${brandSlug}, then re-invite.`,
      },
      { status: 404 },
    );
  }

  // Don't downgrade a SUPER_ADMIN — they're above brand admins.
  if (target.role === ROLES.SUPER_ADMIN) {
    return NextResponse.json(
      { error: `${email} is already a Super Admin — cannot scope them down to BRAND_ADMIN.` },
      { status: 409 },
    );
  }

  // ── Promote ─────────────────────────────────────────────────────────
  await db.user.update({
    where: { id: target.id },
    data: {
      role: ROLES.BRAND_ADMIN,
      brandSlug: brand.slug,
      brandId: brand.id,
      onboardedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log(
    `[invite-brand-admin] ${user!.email} promoted ${target.email} → BRAND_ADMIN for ${brand.slug}`,
  );

  // ── Send promotion notification email ────────────────────────────────
  // Best-effort — never fails the promotion itself. SMTP-aware: no-ops
  // to console.log when SMTP isn't configured (sandbox).
  let emailSent = false;
  let emailError: string | undefined;
  try {
    const result = await sendBrandAdminPromotionEmail({
      to: target.email,
      leadName: target.name,
      brandSlug: brand.slug,
      brandDisplayName: brand.displayName,
      promotedBy: user!.email,
    });
    emailSent = result.ok;
    emailError = result.error;
    if (!result.ok) {
      console.warn(`[invite-brand-admin] Email send failed: ${result.error}`);
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.warn(`[invite-brand-admin] Email send threw: ${emailError}`);
  }

  return NextResponse.json({
    ok: true,
    user: { id: target.id, email: target.email, name: target.name },
    brand: { slug: brand.slug, displayName: brand.displayName },
    previousRole: target.role,
    emailSent,
    emailError,
  });
}
