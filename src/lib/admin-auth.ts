import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Resolve the current admin user from the session. Returns null if not
 * authenticated or not an admin. Use this at the top of every admin API
 * route to gate access.
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
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export type AdminUser = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>;
