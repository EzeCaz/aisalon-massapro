import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/members/companies
 *
 * Returns the distinct, non-empty list of company names currently set
 * on any User. Used by the company picker in the admin "Edit member"
 * dialog so the admin can either pick an existing company OR type a
 * new one.
 *
 * Response: { companies: string[] }
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Distinct non-null, non-empty company names, alphabetically sorted.
  // We pull just the company column and dedupe in JS — Prisma's
  // distinct + skipTake approach on SQLite is more awkward than just
  // fetching the column. The users table is small (community scale).
  const rows = await db.user.findMany({
    where: { company: { not: null } },
    select: { company: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    const c = (r.company || "").trim();
    if (c) set.add(c);
  }
  const companies = Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return NextResponse.json({ companies });
}
