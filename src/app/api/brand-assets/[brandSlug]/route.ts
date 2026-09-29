/**
 * GET /api/brand-assets/[brandSlug]
 *   Returns the resolved BrandAssets for the given brand slug.
 *   Public-ish: any signed-in user can read brand assets (they're used
 *   on public-facing pages), but only Super Admin can write.
 *
 * PATCH /api/brand-assets/[brandSlug]
 *   Updates brand metadata (palette, copy, mascot name/backstory).
 *   Super Admin only.
 *
 * DELETE /api/brand-assets/[brandSlug]
 *   Clears one asset column (sets it to NULL — falls back to Coma default).
 *   Body: { assetKey: "logoUrl" | "heroBannerUrl" | ... }
 *   Super Admin only.
 *
 * POST is handled by /api/brand-assets/[brandSlug]/upload/route.ts
 * (multipart upload to Vercel Blob → write URL back to Brand row).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/permissions";
import {
  resolveBrandAssets,
  ASSET_KEYS,
  type AssetKey,
} from "@/lib/brand/brand-assets-resolver";
import {
  sendBrandOnboardingGoLiveEmail,
} from "@/lib/brand-onboarding-email/templates";

const VALID_ASSET_KEYS = new Set<string>(ASSET_KEYS);

async function requireSuperAdmin(): Promise<
  | { ok: true; email: string; userId: string }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true },
  });
  if (!me) {
    return {
      ok: false,
      response: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }
  if (!isSuperAdmin({ email: me.email, role: me.role }) && !isSuperAdminEmail(me.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 }),
    };
  }
  return { ok: true, email: me.email, userId: me.id };
}

function sanitizeSlug(slug: string): string | null {
  // Allow [a-z0-9-], 1–32 chars. Mirrors the Brand.slug regex.
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(slug)) return null;
  return slug;
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ brandSlug: string }> },
) {
  const { brandSlug: rawSlug } = await ctx.params;
  const slug = sanitizeSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: "Invalid brand slug" }, { status: 400 });
  }

  try {
    const assets = await resolveBrandAssets(slug);
    return NextResponse.json(assets);
  } catch (err) {
    console.error("[brand-assets] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to resolve brand assets" },
      { status: 500 },
    );
  }
}

// ── PATCH (update metadata) ───────────────────────────────────────────────

interface PatchBody {
  displayName?: string;
  tagline?: string;
  primaryColor?: string;
  accentColor?: string;
  secondaryColor?: string;
  gradient?: string;
  mascotName?: string | null;
  mascotBackstory?: string | null;
  loginEyebrowTemplate?: string;
  loginHeadlineTemplate?: string;
  loginSubtitle?: string;
  loginFormHeading?: string;
  loginFormSubheadingTemplate?: string;
  footerCredit?: string;
  status?: "DRAFT" | "ACTIVE";
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ brandSlug: string }> },
) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const { brandSlug: rawSlug } = await ctx.params;
  const slug = sanitizeSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: "Invalid brand slug" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build the update payload — only allow known fields, validate hex colors.
  const data: Record<string, unknown> = {};
  if (typeof body.displayName === "string" && body.displayName.trim()) {
    data.displayName = body.displayName.trim().slice(0, 80);
  }
  if (typeof body.tagline === "string") {
    data.tagline = body.tagline.trim().slice(0, 200);
  }
  if (isHex(body.primaryColor)) data.primaryColor = body.primaryColor;
  if (isHex(body.accentColor)) data.accentColor = body.accentColor;
  if (isHex(body.secondaryColor)) data.secondaryColor = body.secondaryColor;
  if (typeof body.gradient === "string" && body.gradient.length <= 500) {
    data.gradient = body.gradient;
  }
  if (body.mascotName === null || (typeof body.mascotName === "string" && body.mascotName.length <= 80)) {
    data.mascotName = body.mascotName;
  }
  if (body.mascotBackstory === null || (typeof body.mascotBackstory === "string" && body.mascotBackstory.length <= 1000)) {
    data.mascotBackstory = body.mascotBackstory;
  }
  for (const field of [
    "loginEyebrowTemplate",
    "loginHeadlineTemplate",
    "loginSubtitle",
    "loginFormHeading",
    "loginFormSubheadingTemplate",
    "footerCredit",
  ] as const) {
    const v = body[field];
    if (typeof v === "string" && v.length <= 500) data[field] = v;
  }
  if (body.status === "DRAFT" || body.status === "ACTIVE") {
    data.status = body.status;
    if (body.status === "ACTIVE") data.onboardedAt = new Date();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    // Ensure the brand row exists. If not, we can't patch — caller must
    // create it first via the existing /admin/brands flow.
    const existing = await db.brand.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json(
        { error: `Brand "${slug}" not found in DB. Create it first via /admin/brands.` },
        { status: 404 },
      );
    }

    // Detect the DRAFT → ACTIVE transition so we can fire the GO_LIVE email.
    const wasDraft = existing.status === "DRAFT";
    const goingActive = body.status === "ACTIVE" && wasDraft;

    const updated = await db.brand.update({
      where: { slug },
      data,
      select: {
        id: true,
        slug: true,
        displayName: true,
        status: true,
        emailContactEmail: true,
      },
    });

    console.log(
      `[brand-assets] PATCH brand=${slug} by=${auth.email} fields=${Object.keys(data).join(",")}`,
    );

    // Fire onboarding emails (best-effort — don't fail the PATCH if email fails).
    try {
      if (goingActive) {
        // GO_LIVE: status just flipped to ACTIVE.
        const leadEmail = updated.emailContactEmail || existing.emailContactEmail;
        if (leadEmail) {
          await sendBrandOnboardingGoLiveEmail({
            to: leadEmail,
            leadName: null, // we don't have the lead's name on the Brand row
            brandSlug: slug,
            brandDisplayName: updated.displayName,
          });
          console.log(`[brand-assets] GO_LIVE email sent to ${leadEmail}`);
        }
      }
    } catch (emailErr) {
      console.warn(
        `[brand-assets] Email send failed (PATCH still succeeded):`,
        emailErr instanceof Error ? emailErr.message : emailErr,
      );
    }

    return NextResponse.json({ ok: true, brand: updated });
  } catch (err) {
    console.error("[brand-assets] PATCH failed:", err);
    return NextResponse.json(
      { error: "Failed to update brand metadata" },
      { status: 500 },
    );
  }
}

// ── DELETE (clear one asset → revert to fallback) ─────────────────────────

interface DeleteBody {
  assetKey: AssetKey;
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ brandSlug: string }> },
) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const { brandSlug: rawSlug } = await ctx.params;
  const slug = sanitizeSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: "Invalid brand slug" }, { status: 400 });
  }

  let body: DeleteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_ASSET_KEYS.has(body.assetKey)) {
    return NextResponse.json(
      { error: `Invalid assetKey "${body.assetKey}". Must be one of: ${ASSET_KEYS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const existing = await db.brand.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json(
        { error: `Brand "${slug}" not found in DB.` },
        { status: 404 },
      );
    }

    // Set the column to null — resolveBrandAssets will then fall back to
    // the Coma default for that asset (per user spec: "if blank, show
    // coma theme images not uploaded yet").
    await db.brand.update({
      where: { slug },
      data: { [body.assetKey]: null },
    });

    console.log(
      `[brand-assets] DELETE asset=${body.assetKey} brand=${slug} by=${auth.email}`,
    );

    return NextResponse.json({ ok: true, cleared: body.assetKey });
  } catch (err) {
    console.error("[brand-assets] DELETE failed:", err);
    return NextResponse.json(
      { error: "Failed to clear asset" },
      { status: 500 },
    );
  }
}
