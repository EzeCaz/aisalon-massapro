import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import {
  setSetting,
  ALL_KEYS,
  K_GA4_MEASUREMENT_ID,
  K_META_PIXEL_ID,
} from "@/lib/site-settings";

/**
 * POST /api/admin/site-settings
 *
 * Generic write endpoint for SiteSetting rows. SUPER_ADMIN-only.
 *
 * Body: { key: string, value: string }
 *
 * The `key` must be in the ALL_KEYS allowlist (site-settings.ts). Any
 * other key is rejected with 400. This is the security boundary —
 * even if a non-super-admin somehow reaches this endpoint, they can
 * only write to the predefined allowlist.
 *
 * Returns: { ok: true, key, value }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
  }

  let body: { key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = (body.key ?? "").trim();
  const value = (body.value ?? "").trim();

  if (!ALL_KEYS.has(key)) {
    return NextResponse.json(
      { error: `Unknown key "${key}". Allowed: ${[...ALL_KEYS].join(", ")}` },
      { status: 400 }
    );
  }

  // Per-key value validation
  if (key === K_GA4_MEASUREMENT_ID) {
    // Empty = disabled. Otherwise must match G-XXXXXXXXXX
    if (value && !/^G-[A-Z0-9]{6,}$/.test(value.toUpperCase())) {
      return NextResponse.json(
        { error: "GA4 Measurement ID must look like G-XXXXXXXXXX" },
        { status: 400 }
      );
    }
  } else if (key === K_META_PIXEL_ID) {
    if (value && !/^\d{10,20}$/.test(value)) {
      return NextResponse.json(
        { error: "Meta Pixel ID must be 10-20 digits" },
        { status: 400 }
      );
    }
  }

  await setSetting(key, value, user!.id);
  return NextResponse.json({ ok: true, key, value });
}
