/**
 * GET /api/admin/email/provider-status
 *
 * Returns the active email provider + configuration health so the admin
 * UI can show a status banner (e.g. "Active provider: mock — configure
 * SMTP_* env vars to send real emails").
 *
 * Auth: any authenticated admin (members.view permission).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getProvider, isSmtpConfigured, isGmailConfigured } from "@/lib/email-orchestrator/sender";
import { isEmailSendPaused } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const provider = getProvider();
  const smtpConfigured = isSmtpConfigured();
  const gmailConfigured = isGmailConfigured();
  const paused = await isEmailSendPaused();
  const hardKill = process.env.EMAIL_SEND_ENABLED === "false";

  return NextResponse.json({
    provider,
    smtpConfigured,
    gmailConfigured,
    paused,
    hardKill,
    // True if real emails will actually go out on the next worker run.
    willActuallySend: !paused && !hardKill && provider !== "mock",
    // Helpful hints for the admin UI.
    configHints: buildHints({ provider, smtpConfigured, gmailConfigured, paused, hardKill }),
  });
}

function buildHints(opts: {
  provider: "gmail" | "smtp" | "mock";
  smtpConfigured: boolean;
  gmailConfigured: boolean;
  paused: boolean;
  hardKill: boolean;
}): string[] {
  const hints: string[] = [];
  if (opts.hardKill) {
    hints.push("EMAIL_SEND_ENABLED=false is set in env — no emails will send. Remove or set to 'true'.");
  }
  if (opts.paused) {
    hints.push("Email sending is paused in admin settings. Click 'Resume sending' below to unblock.");
  }
  if (opts.provider === "mock") {
    if (!opts.smtpConfigured && !opts.gmailConfigured) {
      hints.push("No email provider is configured. Set SMTP_* env vars (recommended) or EMAIL_PROVIDER=gmail + Google OAuth2 creds.");
    } else if (opts.smtpConfigured && !opts.gmailConfigured) {
      hints.push("SMTP_* env vars are set but the orchestrator still resolves to 'mock'. Check for typos in env var names.");
    }
  }
  return hints;
}
