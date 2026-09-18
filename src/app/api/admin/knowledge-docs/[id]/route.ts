import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";

/**
 * Knowledge-doc item API — PATCH / DELETE.
 * SUPER_ADMIN only (both are content edits on the per-brand KB).
 *
 *   PATCH  /api/admin/knowledge-docs/[id] — update any editable field.
 *   DELETE /api/admin/knowledge-docs/[id] — remove the doc outright.
 */

type Params = { params: Promise<{ id: string }> };

const VALID_KINDS = new Set(["folder", "doc", "slides"]);

export async function PATCH(req: NextRequest, { params }: Params) {
  const me = await requirePermission("members.view");
  if (me instanceof NextResponse) return me;
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only Super Admins can edit the knowledge base." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const existing = await db.knowledgeDoc.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max = 500): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s ? s.slice(0, max) : undefined;
  };

  const data: Record<string, unknown> = { updatedBy: me.email };
  if (body.section !== undefined) {
    const section = str(body.section, 200);
    if (!section) return NextResponse.json({ error: "section cannot be empty." }, { status: 400 });
    data.section = section;
  }
  if (body.sectionIntro !== undefined) data.sectionIntro = str(body.sectionIntro, 2000) ?? null;
  if (body.sectionOrder !== undefined && typeof body.sectionOrder === "number") {
    data.sectionOrder = Math.max(0, Math.min(999, Math.floor(body.sectionOrder)));
  }
  if (body.title !== undefined) {
    const title = str(body.title, 300);
    if (!title) return NextResponse.json({ error: "title cannot be empty." }, { status: 400 });
    data.title = title;
  }
  if (body.description !== undefined) data.description = str(body.description, 4000) ?? null;
  if (body.url !== undefined) {
    const url = str(body.url, 2000);
    if (!url) return NextResponse.json({ error: "url cannot be empty." }, { status: 400 });
    data.url = url;
  }
  if (body.kind !== undefined) {
    const kind = str(body.kind, 20)?.toLowerCase() ?? "doc";
    if (!VALID_KINDS.has(kind)) {
      return NextResponse.json({ error: "kind must be folder, doc, or slides." }, { status: 400 });
    }
    data.kind = kind;
  }
  if (body.sortOrder !== undefined && typeof body.sortOrder === "number") {
    data.sortOrder = Math.max(0, Math.min(999, Math.floor(body.sortOrder)));
  }
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  const doc = await db.knowledgeDoc.update({ where: { id }, data });
  return NextResponse.json({ doc });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const me = await requirePermission("members.view");
  if (me instanceof NextResponse) return me;
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only Super Admins can edit the knowledge base." },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    await db.knowledgeDoc.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
