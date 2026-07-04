import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, ROLES } from "@/lib/permissions";
import {
  setSetting,
  K_WHATSAPP_GROUP_URL,
  K_WHATSAPP_GROUP_TEXT,
} from "@/lib/site-settings";

/**
 * POST /api/admin/site-settings/whatsapp
 *
 * Update the WhatsApp group invite URL and/or the CTA text shown in the
 * site's top navigation. Stored in the SiteSetting table so changes take
 * effect immediately on the next page load — no redeploy needed.
 *
 * Body (JSON), either or both fields:
 *   { url?:  string,  // e.g. "https://chat.whatsapp.com/abcdef"
 *     text?: string } // e.g. "Join our group"
 *
 * Permission: ADMIN or SUPER_ADMIN only. CO_HOST + MEMBER get 403.
 *
 * Returns:
 *   { ok: true, url: string, text: string }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!can(user!.role, "members.view")) {
    // members.view is the permission shared by ADMIN + SUPER_ADMIN.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { url?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Promise<string>[] = [];
  const response: { url?: string; text?: string } = {};

  if (typeof body.url === "string") {
    const trimmed = body.url.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "url cannot be empty — pass a valid WhatsApp invite URL." },
        { status: 400 }
      );
    }
    // Basic shape check — must start with http(s):// and look like a URL.
    if (!/^https?:\/\//i.test(trimmed)) {
      return NextResponse.json(
        { error: "url must start with http:// or https://" },
        { status: 400 }
      );
    }
    updates.push(setSetting(K_WHATSAPP_GROUP_URL, trimmed, user!.id));
    response.url = trimmed;
  }

  if (typeof body.text === "string") {
    const trimmed = body.text.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "text cannot be empty — pass a non-blank CTA label." },
        { status: 400 }
      );
    }
    if (trimmed.length > 60) {
      return NextResponse.json(
        { error: "text is too long (max 60 chars)." },
        { status: 400 }
      );
    }
    updates.push(setSetting(K_WHATSAPP_GROUP_TEXT, trimmed, user!.id));
    response.text = trimmed;
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: "Nothing to update — pass at least one of: url, text" },
      { status: 400 }
    );
  }

  await Promise.all(updates);
  return NextResponse.json({ ok: true, ...response });
}

// Re-export for type-only consumers (matches the brand-images select route pattern)
export { ROLES };
