import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import {
  setSetting,
  K_LINKEDIN_URL,
} from "@/lib/site-settings";
import { isBrandSlug } from "@/lib/brand/brand-config";

/**
 * POST /api/admin/linkedin
 *
 * Set the LinkedIn "Join us" link shown in the site header.
 * SUPER_ADMIN-only. Body: { url: string, brandSlug?: string }
 *
 * When `brandSlug` is provided (and is a known brand), the write goes
 * to `K_LINKEDIN_URL@<brand>` instead of the global row — so each brand
 * can have its own LinkedIn link.
 *
 * The URL must be an https:// link (typically linkedin.com/showcase/...,
 * linkedin.com/groups/..., or linkedin.com/company/...). We accept any
 * https URL so the admin can also point this at a LinkedIn profile,
 * company page, or event page.
 *
 * Returns: { ok: true, url, brandSlug }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { url?: string; brandSlug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  // Must be an https:// URL — no http, no javascript:, no relative paths.
  // This is shown publicly to every visitor, so we lock it down.
  if (!/^https:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "URL must start with https://" },
      { status: 400 }
    );
  }

  const rawBrandSlug = (body.brandSlug ?? "").trim().toLowerCase() || null;
  const brandSlug = rawBrandSlug && isBrandSlug(rawBrandSlug) ? rawBrandSlug : null;

  await setSetting(K_LINKEDIN_URL, url, user!.id, brandSlug ?? undefined);

  return NextResponse.json({ ok: true, url, brandSlug });
}
