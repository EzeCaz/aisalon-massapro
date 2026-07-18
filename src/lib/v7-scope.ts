// ============================================================================
// src/lib/v7-scope.ts
// ============================================================================
// V7 scope resolution helpers — Global → Country → Chapter hierarchy.
//
// This file is the V7 counterpart to the V6 `getCoHostedEventIds()`
// pattern in permissions.ts. It provides:
//
//   - getUserScope(userId)         → { kind: "global" | "country" | "chapter" | "none", ... }
//   - scopeWhere(user)             → Prisma `where` fragment for User / Member queries
//   - canActOnChapter(user, id)    → boolean
//   - canActOnCountry(user, id)    → boolean
//   - getScopedEventIds(user)      → null (no filter) | [] (no access) | [ids]
//   - getManagedChapterIds(user)   → null (all) | [ids]
//
// USAGE IN ADMIN PAGES:
//
//   import { getUserScope, scopeWhere } from "@/lib/v7-scope";
//
//   const me = await getCurrentUser();
//   const scope = await getUserScope(me.id);
//   const members = await db.user.findMany({
//     where: { archivedAt: null, ...scopeWhere(scope) },
//     include: { chapter: true, country: true, ... },
//   });
//
// STATUS: Draft. Not yet wired into admin pages. See core/v7/plan.md.
// ============================================================================

import { db } from "@/lib/db";
import { ROLES } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserScope =
  | { kind: "global" }                              // Super Admin
  | { kind: "country"; countryId: string }          // Admin
  | { kind: "chapter"; countryId: string; chapterId: string }  // Chapter Organizer
  | { kind: "none" };                               // Member (no admin duties)

export type ScopedUser = {
  id: string;
  role: string;
  countryId?: string | null;
  chapterId?: string | null;
};

// ---------------------------------------------------------------------------
// Scope resolver
// ---------------------------------------------------------------------------

/**
 * Returns the user's effective scope. Used by every admin query that
 * needs to filter by country/chapter.
 *
 *   Super Admin          → { kind: "global" }
 *   Admin                → { kind: "country", countryId }
 *   Chapter Organizer    → { kind: "chapter", countryId, chapterId }
 *   Member               → { kind: "none" }
 *
 * If an Admin or Chapter Organizer is missing the required countryId /
 * chapterId (data integrity issue), they fall back to { kind: "none" }
 * to fail safe — they see nothing until the data is fixed.
 */
export async function getUserScope(userId: string): Promise<UserScope> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, countryId: true, chapterId: true },
  });
  if (!user) return { kind: "none" };

  switch (user.role) {
    case ROLES.SUPER_ADMIN:
      return { kind: "global" };

    case ROLES.ADMIN:
      if (!user.countryId) {
        console.warn(
          `[v7-scope] Admin ${userId} has no countryId — failing safe to "none". ` +
          `Run scripts/v7-seed-israel-tel-aviv.ts to backfill.`
        );
        return { kind: "none" };
      }
      return { kind: "country", countryId: user.countryId };

    case "CHAPTER_ORGANIZER":
      if (!user.countryId || !user.chapterId) {
        console.warn(
          `[v7-scope] Chapter Organizer ${userId} missing scope — failing safe to "none".`
        );
        return { kind: "none" };
      }
      return {
        kind: "chapter",
        countryId: user.countryId,
        chapterId: user.chapterId,
      };

    case ROLES.MEMBER:
    default:
      return { kind: "none" };
  }
}

// ---------------------------------------------------------------------------
// Prisma where fragment
// ---------------------------------------------------------------------------

/**
 * Returns a Prisma `where` fragment that scopes User/Member queries to
 * the user's chapter/country.
 *
 *   global  → {} (no filter)
 *   country → { countryId: <id> }
 *   chapter → { countryId: <id>, chapterId: <id> }
 *   none    → { id: "never" } (returns no rows)
 *
 * Spread into a where object: `where: { archivedAt: null, ...scopeWhere(scope) }`
 */
export function scopeWhere(scope: UserScope): Record<string, unknown> {
  switch (scope.kind) {
    case "global":
      return {};
    case "country":
      return { countryId: scope.countryId };
    case "chapter":
      return { countryId: scope.countryId, chapterId: scope.chapterId };
    case "none":
    default:
      // Return no rows — fail safe.
      return { id: "__v7_scope_none__" };
  }
}

// ---------------------------------------------------------------------------
// Access checks
// ---------------------------------------------------------------------------

/**
 * Returns true if the user can act on (read/write/create) the given chapter.
 *
 *   Super Admin          → always true
 *   Admin                → true if chapter belongs to their country
 *   Chapter Organizer    → true if it's their chapter
 *   Member               → false
 */
export async function canActOnChapter(
  user: ScopedUser,
  chapterId: string
): Promise<boolean> {
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role === ROLES.MEMBER) return false;

  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { countryId: true },
  });
  if (!chapter) return false;

  if (user.role === ROLES.ADMIN) {
    return chapter.countryId === user.countryId;
  }
  if (user.role === "CHAPTER_ORGANIZER") {
    return (
      chapter.id === user.chapterId && chapter.countryId === user.countryId
    );
  }
  return false;
}

/**
 * Returns true if the user can act on the given country.
 *
 *   Super Admin          → always true
 *   Admin                → true if it's their country
 *   Chapter Organizer    → true if it's their country (can view country-level data)
 *   Member               → false
 */
export async function canActOnCountry(
  user: ScopedUser,
  countryId: string
): Promise<boolean> {
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role === ROLES.MEMBER) return false;
  return user.countryId === countryId;
}

// ---------------------------------------------------------------------------
// Event / Chapter ID resolvers (mirrors V6 getCoHostedEventIds pattern)
// ---------------------------------------------------------------------------

/**
 * Returns event IDs the user can see.
 *
 *   null  → no filter (Super Admin — see all events)
 *   []    → no access (Member with no scope, or Admin with no country)
 *   [ids] → scoped list (Admin: all events in their country's chapters;
 *                        Chapter Organizer: events in their chapter)
 *
 * Mirrors the V6 `getCoHostedEventIds(userId, role)` pattern.
 */
export async function getScopedEventIds(
  user: ScopedUser
): Promise<string[] | null> {
  if (user.role === ROLES.SUPER_ADMIN) return null;
  if (user.role === ROLES.MEMBER) return [];

  // Admin: all events in all chapters under their country
  if (user.role === ROLES.ADMIN) {
    if (!user.countryId) return [];
    const chapters = await db.chapter.findMany({
      where: { countryId: user.countryId },
      select: { id: true },
    });
    if (chapters.length === 0) return [];
    const events = await db.event.findMany({
      where: { chapterId: { in: chapters.map((c) => c.id) } },
      select: { id: true },
    });
    return events.map((e) => e.id);
  }

  // Chapter Organizer: events in their chapter
  if (user.role === "CHAPTER_ORGANIZER") {
    if (!user.chapterId) return [];
    const events = await db.event.findMany({
      where: { chapterId: user.chapterId },
      select: { id: true },
    });
    return events.map((e) => e.id);
  }

  return [];
}

/**
 * Returns chapter IDs the user can manage.
 *
 *   null  → all chapters (Super Admin)
 *   []    → no chapters (Member)
 *   [ids] → scoped list (Admin: all chapters in their country;
 *                        Chapter Organizer: just their own chapter)
 */
export async function getManagedChapterIds(
  user: ScopedUser
): Promise<string[] | null> {
  if (user.role === ROLES.SUPER_ADMIN) return null;
  if (user.role === ROLES.MEMBER) return [];

  if (user.role === ROLES.ADMIN) {
    if (!user.countryId) return [];
    const chapters = await db.chapter.findMany({
      where: { countryId: user.countryId },
      select: { id: true },
    });
    return chapters.map((c) => c.id);
  }

  if (user.role === "CHAPTER_ORGANIZER") {
    if (!user.chapterId) return [];
    return [user.chapterId];
  }

  return [];
}
