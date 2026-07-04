import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPasswordEmail, emailConfigured } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/admin/members/bulk-delete
 * Body: { userIds: string[] }
 *
 * Permanently delete multiple members at once. Same safety rails as
 * the single DELETE /api/admin/members/[id] endpoint:
 *  - Admin-only
 *  - Skips the currently-signed-in admin (can't self-delete)
 *  - Skips the ADMIN_EMAIL bootstrap admin
 *
 * Returns {
 *   ok,
 *   deleted: Array<{ id, email, name }>,
 *   skipped: Array<{ id, email, reason }>  // self / bootstrap admin / not found
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userIds } = (await req.json().catch(() => ({}))) as {
    userIds?: unknown;
  };
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json(
      { error: "userIds (non-empty array) is required." },
      { status: 400 }
    );
  }
  if (userIds.length > 500) {
    return NextResponse.json(
      { error: "Can't delete more than 500 members in a single call." },
      { status: 400 }
    );
  }

  const adminEmail = (
    process.env.ADMIN_EMAIL || "eze@massapro.com"
  ).toLowerCase();

  const targets = await db.user.findMany({
    where: { id: { in: userIds as string[] } },
    select: { id: true, email: true, name: true },
  });
  const foundById = new Map(targets.map((t) => [t.id, t]));

  const deleted: { id: string; email: string; name: string | null }[] = [];
  const skipped: { id: string; email?: string; reason: string }[] = [];

  // Validate every requested ID before deleting anything.
  const safeToDelete: string[] = [];
  for (const id of userIds as string[]) {
    const t = foundById.get(id);
    if (!t) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    if (t.id === me.id) {
      skipped.push({ id: t.id, email: t.email, reason: "self (can't delete your own account)" });
      continue;
    }
    if (t.email.toLowerCase() === adminEmail) {
      skipped.push({ id: t.id, email: t.email, reason: "bootstrap admin (ADMIN_EMAIL)" });
      continue;
    }
    safeToDelete.push(t.id);
  }

  if (safeToDelete.length > 0) {
    const toReport = safeToDelete.map((id) => foundById.get(id)!);
    await db.user.deleteMany({ where: { id: { in: safeToDelete } } });
    deleted.push(...toReport.map((t) => ({ id: t.id, email: t.email, name: t.name })));
  }

  return NextResponse.json({ ok: true, deleted, skipped });
}
