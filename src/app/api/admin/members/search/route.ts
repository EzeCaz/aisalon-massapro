import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdmin } from "@/lib/permissions";

/**
 * GET /api/admin/members/search?q=<query>&limit=<n>&excludeEventId=<id>
 *
 * Search platform members by name OR email OR company OR secondary email.
 * Used by the autocomplete co-host picker in the EventEditor — instead
 * of typing a bare email, the admin types a name/email fragment and gets
 * back matching users.
 *
 * - `q`: minimum 1 character. Empty/missing returns 400.
 * - `limit`: default 10, max 50.
 * - `excludeEventId`: when provided, omits users who are ALREADY co-hosts
 *   of that event (so the picker doesn't show duplicates).
 *
 * Admin/Super-Admin only — member info is sensitive.
 *
 * Response shape:
 *   {
 *     users: [
 *       { id, email, name, photoUrl, image, company, role, onboardedAt }
 *     ]
 *   }
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(me.role, "members.view") && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limitParam = url.searchParams.get("limit");
  const excludeEventId = url.searchParams.get("excludeEventId");

  if (!q) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }
  const limit = Math.min(Math.max(parseInt(limitParam || "10", 10) || 10, 1), 50);

  // Build the WHERE clause — match name OR email OR company OR secondary email.
  // Use case-insensitive contains for Postgres.
  const where = {
    OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
      { company: { contains: q, mode: "insensitive" as const } },
      { secondaryEmails: { some: { email: { contains: q, mode: "insensitive" as const } } } },
    ],
  };

  // If excludeEventId is provided, exclude users who are already co-hosts of that event
  let excludeUserIds: string[] = [];
  if (excludeEventId) {
    const existing = await db.eventCoHost.findMany({
      where: { eventId: excludeEventId },
      select: { userId: true },
    });
    excludeUserIds = existing.map((c) => c.userId);
  }

  const users = await db.user.findMany({
    where: excludeUserIds.length
      ? { ...where, id: { notIn: excludeUserIds } }
      : where,
    select: {
      id: true,
      email: true,
      name: true,
      photoUrl: true,
      image: true,
      company: true,
      role: true,
      onboardedAt: true,
    },
    take: limit,
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return NextResponse.json({ users });
}
