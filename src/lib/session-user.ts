import type { Session } from "next-auth";
import { db } from "@/lib/db";

/**
 * session-user.ts
 * ---------------
 * Helpers for resolving the current user from a next-auth Session.
 *
 * WHY THIS EXISTS:
 * The JWT callback in auth.ts sets `token.id` once at login. If the
 * DB lookup failed transiently during login (or the user row didn't
 * exist yet), `token.id` falls back to `user.id || token.sub` —
 * which is a Google OAuth `sub` (e.g. "111234567890123456789"), NOT
 * a Prisma UUID. Once that bad value lands in the JWT cookie, every
 * downstream `db.user.findUnique({ where: { id: session.user.id } })`
 * returns null, and APIs return "User not found" — even though the
 * user is clearly logged in and visible on the page.
 *
 * The fix: never blindly trust `session.user.id`. Always verify it
 * resolves to a real DB row, and fall back to an email lookup if it
 * doesn't. The email is always present in the session and is the
 * canonical identity (set/normalized in the signIn callback).
 *
 * These helpers also cache the resolved user on `session.user.id`
 * (mutated in place) so subsequent calls in the same request don't
 * re-hit the DB.
 */

const verifiedIds = new WeakSet<object>();

/**
 * Returns the current user's DB id, falling back to email lookup
 * if the JWT id is missing or invalid. Returns null if the user
 * truly doesn't exist in the DB.
 *
 * Use this when you only need the id (no other fields).
 */
export async function getMeId(session: Session | null): Promise<string | null> {
  if (!session?.user?.email) return null;

  // Fast path: we've already verified this session object's id.
  const jwtId = (session.user as { id?: string }).id;
  if (jwtId && verifiedIds.has(session.user)) {
    return jwtId;
  }

  // Verify the JWT id resolves to a real DB row.
  if (jwtId) {
    const ok = await db.user.findUnique({
      where: { id: jwtId },
      select: { id: true },
    });
    if (ok) {
      verifiedIds.add(session.user);
      return jwtId;
    }
    // JWT id is stale/invalid — fall through to email lookup.
  }

  // Fallback: resolve by email.
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!me) return null;

  // Mutate the session so other callers in this request see the
  // corrected id (and skip the re-verification).
  (session.user as { id?: string }).id = me.id;
  verifiedIds.add(session.user);
  return me.id;
}

/**
 * Returns the current user's full row (with the given Prisma `select`
 * fields), falling back to email lookup if the JWT id is missing or
 * invalid. Returns null if the user truly doesn't exist in the DB.
 *
 * Use this when you need more than just the id (e.g. name, email,
 * photoUrl for an email notification).
 *
 * Type-wise: the return type is the Prisma-generated user type for
 * the given select. Callers should pass `select` as a plain object
 * literal so TS infers the right Prisma type.
 */
export async function getMe<S extends Record<string, true>>(
  session: Session | null,
  select: S,
): Promise<unknown> {
  if (!session?.user?.email) return null;

  const jwtId = (session.user as { id?: string }).id;

  // Try the JWT id first (fast path — one indexed lookup).
  if (jwtId) {
    const me = await db.user.findUnique({ where: { id: jwtId }, select });
    if (me) {
      verifiedIds.add(session.user);
      return me;
    }
  }

  // Fallback: resolve by email.
  const me = await db.user.findUnique({ where: { email: session.user.email }, select });
  if (!me) return null;

  (session.user as { id?: string }).id = (me as { id: string }).id;
  verifiedIds.add(session.user);
  return me;
}
