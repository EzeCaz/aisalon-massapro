import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import {
  setSetting,
  K_WHATSAPP_GROUP_URL,
} from "@/lib/site-settings";

/**
 * POST /api/admin/whatsapp
 *
 * Set the WhatsApp "Join our group" link shown in the site header.
 * SUPER_ADMIN-only. Body: { url: string }
 *
 * The URL must be an https:// link (typically chat.whatsapp.com/...).
 * We accept any https URL so the admin can also point this at a Telegram
 * group, a Slack invite, a Luma page, etc. — the header label is "Join
 * our group" so it stays generic.
 *
 * Returns: { ok: true, url }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { url?: string };
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

  await setSetting(K_WHATSAPP_GROUP_URL, url, user!.id);

  return NextResponse.json({ ok: true, url });
}
