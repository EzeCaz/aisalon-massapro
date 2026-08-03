/**
 * POST /api/email-templates/[id]/duplicate — create a copy of the template
 * with name = "<original> (copy)" and stage = null. The original is left
 * untouched.
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true, userId: me.id };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // TSK-0074: was db.emailStageTemplate (legacy). Now reads EmailTemplate2.
  const existing = await db.emailTemplate2.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Generate a unique name: try "Name (copy)", then "Name (copy 2)", etc.
  // TSK-0074: EmailTemplate2.name is NOT @unique (unlike the legacy
  // EmailStageTemplate.name which was). We use findFirst instead of
  // findUnique to check for clashes — the uniqueness check is for UX
  // (avoid duplicate-looking names in the admin UI), not enforced at
  // the DB level.
  let attempt = 0;
  let newName = `${existing.name} (copy)`;
  while (true) {
    const clash = await db.emailTemplate2.findFirst({ where: { name: newName } });
    if (!clash) break;
    attempt++;
    newName = `${existing.name} (copy ${attempt + 1})`;
    if (attempt > 50) {
      return NextResponse.json({ error: "could not find a unique name after 50 tries" }, { status: 500 });
    }
  }

  try {
    // TSK-0074: was db.emailStageTemplate (legacy). Now creates in EmailTemplate2.
    // Field renamed htmlBody → bodyHtml.
    //
    // TSK-0074 Phase 4: duplicate now copies ALL feature fields (was only
    // copying subject + bodyHtml + stopIfNotOpenedHours). This brings logo
    // override, mobile overrides, no-code variant, and alt-subject re-send
    // settings into the copy so the duplicated template behaves identically
    // to the original. The admin can then tweak the copy without rebuilding
    // all the feature config from scratch.
    const copy = await db.emailTemplate2.create({
      data: {
        name: newName,
        subject: existing.subject,
        bodyHtml: existing.bodyHtml,
        stopIfNotOpenedHours: existing.stopIfNotOpenedHours,
        // Feature 1: no-code variant (stages 3 & 4)
        noCodeSubject: existing.noCodeSubject,
        noCodeHtmlBody: existing.noCodeHtmlBody,
        // Feature 2: per-template logo override
        logoUrl: existing.logoUrl,
        // Feature 3: alt-subject re-send
        altSubject: existing.altSubject,
        altNotOpenedHours: existing.altNotOpenedHours,
        // TSK-0074 Phase 4: mobile-only CSS/HTML overrides
        mobileOverridesHtml: existing.mobileOverridesHtml,
        stage: null, // custom template — no stage
        isActive: true,
        isDefault: false,
        updatedBy: auth.userId,
      },
    });
    return NextResponse.json({ ok: true, template: copy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
