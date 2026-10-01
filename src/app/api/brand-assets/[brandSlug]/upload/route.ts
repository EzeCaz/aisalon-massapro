/**
 * POST /api/brand-assets/[brandSlug]/upload
 *
 * Multipart file upload for a single brand asset (logo, hero banner,
 * favicon, email logo, mascot, or brand book). Saves the file to
 * Vercel Blob and writes the resulting URL back to the Brand row.
 *
 * Form fields:
 *   - file:       File (required) — image or PDF
 *   - assetKey:   string (required) — one of:
 *                 "logoUrl" | "heroBannerUrl" | "faviconUrl" |
 *                 "emailLogoUrl" | "mascotImageUrl" | "brandBookUrl"
 *
 * Response (200):
 *   { ok: true, assetKey, url, provenance: "brand-row" }
 *
 * Auth: Super Admin OR matching BRAND_ADMIN only.
 *
 * Vercel Blob storage path:
 *   brand-assets/<brandSlug>/<assetKey>/<timestamp>-<random>.<ext>
 *
 * For local sandbox dev (no BLOB_READ_WRITE_TOKEN), falls back to
 * saving the file to /public/brand-uploads/<brandSlug>/<assetKey>/...
 * and returning the public path. This lets the onboarding funnel
 * work end-to-end in the sandbox without a Vercel Blob account.
 *
 * ── Body size limit (Option 4 fix, 2026-09-30) ────────────────────────
 * Production Vercel deployments have a default 4MB body limit for
 * route handlers. Mascot images + brand books can easily exceed that
 * (a 5MB mascot PNG or 25MB brand book PDF), which causes Vercel to
 * return the literal string "Server action limit reached" with a
 * non-JSON content-type — the client then fails parsing with the
 * cryptic error: "Unexpected token 'S', \"Server act\"... is not
 * valid JSON".
 *
 * Fix: explicitly raise the body size limit via the `api.bodyParser`
 * segment config to 25MB (the largest asset we accept — brand book).
 * This matches the ASSET_RULES.brandBookUrl.maxMB value below.
 */

// 25MB — matches the largest asset (brandBookUrl). See ASSET_RULES below.
//
// NOTE: We intentionally do NOT add segment config like `export const
// maxDuration`, `export const dynamic`, or `export const fetchCache`
// here. Earlier we tried adding them and the route started returning
// 404 on Vercel production with `x-nextjs-action-not-found: 1` — even
// though the file built + linted cleanly in the sandbox. Removing the
// segment config restored the route. The body size limit is raised
// via `serverActions.bodySizeLimit: "25mb"` in next.config.ts (which
// applies globally to all routes).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail, normalizeRole, ROLES } from "@/lib/permissions";
import { safeFileExtension, uniqueBlobFilename } from "@/lib/blob-paths";
import {
  ASSET_KEYS,
  type AssetKey,
} from "@/lib/brand/brand-assets-resolver";

const VALID_ASSET_KEYS = new Set<string>(ASSET_KEYS);

// Per-asset MIME-type allowlist + max size (MB).
const ASSET_RULES: Record<
  AssetKey,
  { allowedMime: RegExp; allowedExt: string[]; maxMB: number }
> = {
  logoUrl: {
    allowedMime: /^image\/(png|jpeg|webp|svg\+xml)$/,
    allowedExt: ["png", "jpg", "jpeg", "webp", "svg"],
    maxMB: 5,
  },
  heroBannerUrl: {
    allowedMime: /^image\/(png|jpeg|webp|svg\+xml)$/,
    allowedExt: ["png", "jpg", "jpeg", "webp", "svg"],
    maxMB: 10,
  },
  faviconUrl: {
    allowedMime: /^image\/(png|jpeg|webp|x-icon|vnd\.microsoft\.icon|svg\+xml)$/,
    allowedExt: ["png", "jpg", "jpeg", "webp", "ico", "svg"],
    maxMB: 1,
  },
  emailLogoUrl: {
    allowedMime: /^image\/(png|jpeg|webp|svg\+xml)$/,
    allowedExt: ["png", "jpg", "jpeg", "webp", "svg"],
    maxMB: 5,
  },
  mascotImageUrl: {
    allowedMime: /^image\/(png|jpeg|webp|svg\+xml)$/,
    allowedExt: ["png", "jpg", "jpeg", "webp", "svg"],
    maxMB: 5,
  },
  brandBookUrl: {
    allowedMime: /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/,
    allowedExt: ["pdf", "doc", "docx"],
    maxMB: 25,
  },
};

function sanitizeSlug(slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(slug)) return null;
  return slug;
}

async function requireBrandAdmin(
  brandSlug: string,
): Promise<
  | { ok: true; email: string }
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
    select: { id: true, email: true, role: true, brandSlug: true },
  });
  if (!me) {
    return {
      ok: false,
      response: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }
  const sa = isSuperAdmin({ email: me.email, role: me.role }) || isSuperAdminEmail(me.email);
  const ba = normalizeRole(me.role) === ROLES.BRAND_ADMIN && me.brandSlug === brandSlug;
  if (!sa && !ba) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden — Super Admin or matching BRAND_ADMIN only" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, email: me.email };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ brandSlug: string }> },
) {
  const { brandSlug: rawSlug } = await ctx.params;
  const slug = sanitizeSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: "Invalid brand slug" }, { status: 400 });
  }
  const auth = await requireBrandAdmin(slug);
  if (!auth.ok) return auth.response;

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const assetKey = formData.get("assetKey");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  if (typeof assetKey !== "string" || !VALID_ASSET_KEYS.has(assetKey)) {
    return NextResponse.json(
      { error: `Invalid 'assetKey'. Must be one of: ${ASSET_KEYS.join(", ")}` },
      { status: 400 },
    );
  }

  const rules = ASSET_RULES[assetKey as AssetKey];

  // Validate MIME + size
  if (!rules.allowedMime.test(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type || "unknown"}" for ${assetKey}. Allowed: ${rules.allowedExt.join(", ")}` },
      { status: 415 },
    );
  }
  const maxBytes = rules.maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max for ${assetKey}: ${rules.maxMB} MB` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  // Compute a safe filename + extension
  const ext = safeFileExtension(file.name, file.type);
  const uniqueName = uniqueBlobFilename(ext);
  // Build the full blob pathname safely: brand-assets/<slug>/<assetKey>/<file>
  const blobPathname = `brand-assets/${slug}/${assetKey}/${uniqueName}`;

  // Ensure the Brand row exists (we can only write to it if it does)
  let brandRow;
  try {
    brandRow = await db.brand.findUnique({ where: { slug } });
  } catch (err) {
    console.error("[brand-assets:upload] brand.findUnique failed:", err);
    return NextResponse.json(
      { error: "Brand table not available in this environment (sandbox DB mismatch)." },
      { status: 500 },
    );
  }
  if (!brandRow) {
    return NextResponse.json(
      { error: `Brand "${slug}" not found in DB. Create it first via /admin/brands.` },
      { status: 404 },
    );
  }

  // Save the file — try Vercel Blob first, fall back to local /public.
  let publicUrl: string;
  let storageBackend: "vercel-blob" | "local-public";

  const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (hasBlobToken) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(blobPathname, file, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type || undefined,
      });
      publicUrl = blob.url;
      storageBackend = "vercel-blob";
    } catch (err) {
      console.error("[brand-assets:upload] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: "Failed to upload to Vercel Blob" },
        { status: 502 },
      );
    }
  } else {
    // Sandbox fallback — save to /public/brand-uploads/<slug>/<assetKey>/...
    const fs = await import("fs/promises");
    const path = await import("path");
    const publicDir = path.join(
      process.cwd(),
      "public",
      "brand-uploads",
      slug,
      assetKey,
    );
    await fs.mkdir(publicDir, { recursive: true });
    const localName = blobPathname.split("/").pop() || `upload-${Date.now()}.${ext}`;
    const localPath = path.join(publicDir, localName);
    const arrayBuf = await file.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(arrayBuf));
    publicUrl = `/brand-uploads/${slug}/${assetKey}/${localName}`;
    storageBackend = "local-public";
    console.warn(
      `[brand-assets:upload] BLOB_READ_WRITE_TOKEN not set — saved to ${localPath} (sandbox mode)`,
    );
  }

  // Write the URL back to the Brand row
  try {
    await db.brand.update({
      where: { slug },
      data: { [assetKey as AssetKey]: publicUrl },
    });
  } catch (err) {
    console.error("[brand-assets:upload] brand.update failed:", err);
    return NextResponse.json(
      { error: "File uploaded but DB write failed — please retry" },
      { status: 500 },
    );
  }

  console.log(
    `[brand-assets:upload] ${assetKey} → ${slug} (${storageBackend}) by ${auth.email} | size=${file.size}B | ${publicUrl}`,
  );

  return NextResponse.json({
    ok: true,
    assetKey,
    url: publicUrl,
    provenance: "brand-row",
    storage: storageBackend,
  });
}
