import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, ROLES } from "@/lib/permissions";
import {
  setSetting,
  K_EMAIL_SEND_PAUSED,
  isEmailSendPaused,
} from "@/lib/site-settings";

/**
 * POST /api/admin/site-settings/email-pause
 *
 * Toggle the global email-sending pause flag. When paused, every sendEmail()
 * call returns immediately without contacting Gmail (or the mock logger) —
 * the queue still records the attempt so the admin can preview the rendered
 * HTML in the Email Queue panel.
 *
 * Body (JSON):
 *   { paused: boolean }   // true = block sends, false = resume
 *
 * Permission: ADMIN or SUPER_ADMIN only.
 *
 * Returns:
 *   { ok: true, paused: boolean }
 */

export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!can(user!.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { paused?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.paused !== "boolean") {
    return NextResponse.json(
      { error: "Missing or invalid 'paused' field (expected boolean)" },
      { status: 400 },
    );
  }

  await setSetting(K_EMAIL_SEND_PAUSED, String(body.paused), user!.id);
  return NextResponse.json({ ok: true, paused: body.paused });
}

/**
 * GET /api/admin/site-settings/email-pause
 *
 * Returns the current pause state. Used by the Email admin tab to render
 * the toggle button with the correct initial state.
 */
export async function GET() {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!can(user!.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, paused: await isEmailSendPaused() });
}

export { ROLES };
