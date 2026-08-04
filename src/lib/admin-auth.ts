import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getEffectiveRole } from "@/lib/permissions";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Resolve the current admin user from the session. Returns null if not
 * authenticated or not an admin. Use this at the top of every admin API
 * route to gate access.
 *
 * TSK-0074: This now accepts BOTH "ADMIN" and "SUPER_ADMIN" roles (previously
 * it only accepted "ADMIN", which silently locked out SUPER_ADMIN users —
 * they could see /admin/email because the page uses `can(effectiveRole, ...)`
 * which honors SUPER_ADMIN, but every API call returned 401 because this
 * helper checked `user.role !== "ADMIN"` strictly).
 *
 * This helper also honors the "View as" override for SUPER_ADMIN users:
 * if a SUPER_ADMIN is viewing as a non-admin role (e.g. CHAPTER_ADMIN),
 * they are denied admin API access — mirroring the page's effective-role
 * check. This keeps page-level and API-level auth consistent.
 *
 * Usage:
 *   const admin = await requireAdmin();
 *   if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return null;

  // Honor "View as" override for SUPER_ADMIN users — same logic as
  // /admin/email/page.tsx. effectiveRole falls back to the real role when
  // there's no override or the user isn't SUPER_ADMIN.
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(user.role, user.email, viewAsRole);

  // Use the same permission check as the admin pages: `members.view` requires
  // ADMIN rank. SUPER_ADMIN implicitly passes via can()'s super-admin override.
  if (!can(effectiveRole, "members.view")) return null;
  return user;
}

export type AdminUser = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>;
