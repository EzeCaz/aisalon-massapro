/**
 * PATCH  /api/email-audiences/[id] — update audience (name, description,
 *   emails for STATIC, or filters for DYNAMIC).
 * DELETE /api/email-audiences/[id] — delete audience (the built-in Test
 *   audience cannot be deleted, only edited).
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseSpec, type AudienceFilterSpec } from "@/lib/email-orchestrator/audience-filter";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true };
}

function safeParseEmails(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    description?: string | null;
    kind?: "STATIC" | "DYNAMIC";
    emails?: string[];
    filters?: AudienceFilterSpec;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const existing = await db.emailAudience.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    updateData.name = name;
    updateData.slug = slugify(name);
  }

  if (body.description !== undefined) {
    updateData.description = body.description || null;
  }

  // Allow switching kind. When switching to STATIC, must provide emails.
  // When switching to DYNAMIC, must provide filters with at least one group.
  const newKind = body.kind === "DYNAMIC" ? "DYNAMIC" : body.kind === "STATIC" ? "STATIC" : existing.kind;
  updateData.kind = newKind;

  if (newKind === "STATIC") {
    if (body.emails !== undefined) {
      const emails = body.emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && e.includes("@"));
      if (emails.length === 0) {
        return NextResponse.json({ error: "at least one email required for STATIC audience" }, { status: 400 });
      }
      updateData.emailsJson = JSON.stringify(emails);
      updateData.filtersJson = null;
    } else if (existing.kind !== "STATIC") {
      // Switching to STATIC without providing emails — error
      return NextResponse.json({ error: "emails required when switching to STATIC" }, { status: 400 });
    }
  } else {
    // DYNAMIC
    if (body.filters !== undefined) {
      if (!body.filters.groups || body.filters.groups.length === 0) {
        return NextResponse.json({ error: "at least one filter group required for DYNAMIC audience" }, { status: 400 });
      }
      updateData.filtersJson = JSON.stringify(body.filters);
      updateData.emailsJson = "[]";
    } else if (existing.kind !== "DYNAMIC") {
      // Switching to DYNAMIC without providing filters — error
      return NextResponse.json({ error: "filters required when switching to DYNAMIC" }, { status: 400 });
    }
  }

  try {
    const updated = await db.emailAudience.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({
      ok: true,
      audience: {
        ...updated,
        emails: updated.kind === "STATIC" ? safeParseEmails(updated.emailsJson) : [],
        filters: updated.kind === "DYNAMIC" && updated.filtersJson ? parseSpec(updated.filtersJson) : null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "An audience with this name already exists" }, { status: 409 });
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
  const existing = await db.emailAudience.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Protect the built-in Test audience.
  if (existing.isTest) {
    return NextResponse.json(
      { error: "The built-in Test audience cannot be deleted (you can edit its emails instead)" },
      { status: 400 },
    );
  }

  // Null out any flow steps referencing this audience, then delete.
  await db.emailFlowStep.updateMany({
    where: { audienceId: id },
    data: { audienceId: null },
  });
  await db.emailAudience.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
