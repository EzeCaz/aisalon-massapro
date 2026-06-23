import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * GET /api/admin/members
 * Returns all users with their tags + linked speakers (across all events).
 * Admin-only. Includes the imported-from-spreadsheet fields (mobile,
 * interestedIn, profileCategories, appliedFor, invitedToSpeak,
 * importSource, importedAt) — these are admin-only.
 *
 * Permission: any user with the "members.view" permission. This includes
 * SUPER_ADMIN and ADMIN. CO_HOST and MEMBER get 403.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await db.user.findMany({
    orderBy: [{ importSource: "desc" }, { createdAt: "desc" }],
    include: {
      tags: true,
      _count: { select: { images: true } },
      // Speakers linked to this user (across all events) — used to show
      // "Linked to: <event title>" in the admin table.
      speakers: {
        select: {
          id: true,
          name: true,
          topic: true,
          event: { select: { id: true, title: true, slug: true } },
        },
      },
    },
  });
  return NextResponse.json({ members });
}
