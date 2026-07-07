/**
 * GET    /api/email-templates — list all stage + custom email templates.
 * POST   /api/email-templates — create a new custom template.
 *
 * Stage templates (Awareness, Reminder, Final Prep, Day-Of, Recap) are
 * seeded automatically — admins can edit them but not delete them. Custom
 * templates (stage = null) can be created, edited, duplicated, and deleted.
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

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const templates = await db.emailStageTemplate.findMany({
    orderBy: [{ stage: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { flowSteps: true } },
    },
  });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      stage: t.stage,
      name: t.name,
      subject: t.subject,
      htmlBody: t.htmlBody,
      stopIfNotOpenedHours: t.stopIfNotOpenedHours,
      // Feature 1: no-code variant
      noCodeSubject: t.noCodeSubject,
      noCodeHtmlBody: t.noCodeHtmlBody,
      // Feature 2: logo override
      logoUrl: t.logoUrl,
      // Feature 3: alt-subject re-send
      altSubject: t.altSubject,
      altNotOpenedHours: t.altNotOpenedHours,
      isActive: t.isActive,
      isDefault: t.isDefault,
      flowStepsCount: t._count.flowSteps,
      updatedAt: t.updatedAt,
      updatedBy: t.updatedBy,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    subject?: string;
    htmlBody?: string;
    stopIfNotOpenedHours?: number | null;
    stage?: number | null;
    // Feature 1: no-code variant
    noCodeSubject?: string | null;
    noCodeHtmlBody?: string | null;
    // Feature 2: logo override
    logoUrl?: string | null;
    // Feature 3: alt-subject re-send
    altSubject?: string | null;
    altNotOpenedHours?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!body.subject?.trim()) return NextResponse.json({ error: "subject required" }, { status: 400 });
  if (!body.htmlBody?.trim()) return NextResponse.json({ error: "htmlBody required" }, { status: 400 });

  // Only seeded defaults can have a stage value; custom templates must have stage = null.
  const stage = body.stage === null || body.stage === undefined ? null : null;

  try {
    const template = await db.emailStageTemplate.create({
      data: {
        name,
        subject: body.subject,
        htmlBody: body.htmlBody,
        stopIfNotOpenedHours: body.stopIfNotOpenedHours ?? null,
        noCodeSubject: body.noCodeSubject?.trim() || null,
        noCodeHtmlBody: body.noCodeHtmlBody?.trim() || null,
        logoUrl: body.logoUrl?.trim() || null,
        altSubject: body.altSubject?.trim() || null,
        altNotOpenedHours: body.altNotOpenedHours ?? null,
        stage,
        isActive: true,
        isDefault: false,
        updatedBy: auth.userId,
      },
    });
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "A template with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
