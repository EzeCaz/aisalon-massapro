/**
 * PATCH  /api/email-templates/[id] — update template (subject, htmlBody, name, etc.)
 * DELETE /api/email-templates/[id] — delete template (only non-default templates).
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: {
    name?: string;
    subject?: string;
    htmlBody?: string;
    stopIfNotOpenedHours?: number | null;
    isActive?: boolean;
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

  const existing = await db.emailStageTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updateData: Record<string, unknown> = { updatedBy: auth.userId };
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    updateData.name = name;
  }
  if (body.subject !== undefined) {
    if (!body.subject.trim()) return NextResponse.json({ error: "subject cannot be empty" }, { status: 400 });
    updateData.subject = body.subject;
  }
  if (body.htmlBody !== undefined) {
    if (!body.htmlBody.trim()) return NextResponse.json({ error: "htmlBody cannot be empty" }, { status: 400 });
    updateData.htmlBody = body.htmlBody;
  }
  if (body.stopIfNotOpenedHours !== undefined) {
    updateData.stopIfNotOpenedHours = body.stopIfNotOpenedHours;
  }
  if (body.isActive !== undefined) {
    updateData.isActive = body.isActive;
  }
  // Feature 1: no-code variant (null is allowed to disable)
  if (body.noCodeSubject !== undefined) {
    updateData.noCodeSubject = body.noCodeSubject?.trim() || null;
  }
  if (body.noCodeHtmlBody !== undefined) {
    updateData.noCodeHtmlBody = body.noCodeHtmlBody?.trim() || null;
  }
  // Feature 2: logo override
  if (body.logoUrl !== undefined) {
    updateData.logoUrl = body.logoUrl?.trim() || null;
  }
  // Feature 3: alt-subject re-send
  if (body.altSubject !== undefined) {
    updateData.altSubject = body.altSubject?.trim() || null;
  }
  if (body.altNotOpenedHours !== undefined) {
    updateData.altNotOpenedHours = body.altNotOpenedHours;
  }

  try {
    const updated = await db.emailStageTemplate.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ ok: true, template: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "A template with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.emailStageTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Cannot delete the seeded defaults — only deactivate them.
  if (existing.isDefault) {
    return NextResponse.json(
      { error: "The 5 seeded stage templates cannot be deleted. You can deactivate them instead." },
      { status: 400 },
    );
  }

  // Null out any flow steps referencing this template, then delete.
  await db.emailFlowStep.updateMany({
    where: { templateId: id },
    data: { templateId: null },
  });
  await db.emailStageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
