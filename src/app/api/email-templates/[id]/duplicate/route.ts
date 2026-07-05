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
  const existing = await db.emailStageTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Generate a unique name: try "Name (copy)", then "Name (copy 2)", etc.
  let attempt = 0;
  let newName = `${existing.name} (copy)`;
  while (true) {
    const clash = await db.emailStageTemplate.findUnique({ where: { name: newName } });
    if (!clash) break;
    attempt++;
    newName = `${existing.name} (copy ${attempt + 1})`;
    if (attempt > 50) {
      return NextResponse.json({ error: "could not find a unique name after 50 tries" }, { status: 500 });
    }
  }

  try {
    const copy = await db.emailStageTemplate.create({
      data: {
        name: newName,
        subject: existing.subject,
        htmlBody: existing.htmlBody,
        stopIfNotOpenedHours: existing.stopIfNotOpenedHours,
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
