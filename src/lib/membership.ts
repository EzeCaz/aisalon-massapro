/**
 * Community membership helpers (multi-community model).
 *
 * PER USER SPEC 2026-09-19:
 *   - All Coma users can SEE any event regardless of the community.
 *   - To JOIN an event, they must first JOIN the event's community:
 *     every join/register button shown to a non-member of that specific
 *     community starts a "join the community + fill the community form"
 *     flow — and only after joining can they see all community members
 *     and join events.
 *   - Members of other communities (e.g. AI Salon) cannot see other
 *     communities' events at all; they discover nearby communities on
 *     /communities and can request to join from there.
 *
 * MEMBERSHIP MODEL:
 *   - PRIMARY membership is IMPLICIT: User.chapterId === chapterId counts
 *     as an ACTIVE membership even with no ChapterMember row. This keeps
 *     every existing user unlocked from their own community's events on
 *     deploy (no data backfill needed).
 *   - ADDITIONAL memberships are explicit ChapterMember rows
 *     (prisma model ChapterMember, @@unique([chapterId, userId])).
 *   - Joins are AUTO-APPROVED (status "ACTIVE" immediately). The "PENDING"
 *     status exists in the schema so a future approval flow can be added
 *     without another migration.
 */
import { db } from "@/lib/db";

/** Membership statuses stored on ChapterMember.status. */
export const CHAPTER_MEMBER_STATUSES = ["PENDING", "ACTIVE", "DECLINED", "LEFT"] as const;
export type ChapterMemberStatus = (typeof CHAPTER_MEMBER_STATUSES)[number];

/** Where a membership row was created from. */
export type ChapterMemberSource = "EVENT_GATE" | "DIRECTORY" | "ADMIN";

/** Shape returned by the membership check helpers. */
export type MembershipCheck = {
  /** True when the user can act as a member of the chapter right now. */
  isMember: boolean;
  /** True when there's an explicit ChapterMember row for (chapter, user). */
  hasRow: boolean;
  /** Status of the explicit row (null when no row). */
  rowStatus: ChapterMemberStatus | null;
  /** True when this is the user's PRIMARY chapter (User.chapterId). */
  isPrimary: boolean;
};

/**
 * Check the user's membership in a specific chapter.
 *
 * `primaryChapterId` may be null (users without a home chapter).
 * Never throws on DB errors — fails CLOSED (isMember: false) so a flaky
 * DB can never accidentally grant membership, but hasRow is null so the
 * caller can distinguish "checked and not a member" from "couldn't check".
 */
export async function checkChapterMembership(
  userId: string,
  chapterId: string,
  primaryChapterId: string | null | undefined
): Promise<MembershipCheck> {
  const isPrimary = !!primaryChapterId && primaryChapterId === chapterId;
  try {
    const row = await db.chapterMember.findUnique({
      where: { chapterId_userId: { chapterId, userId } },
      select: { status: true },
    });
    const rowStatus = (row?.status as ChapterMemberStatus | undefined) ?? null;
    return {
      isMember: isPrimary || rowStatus === "ACTIVE",
      hasRow: !!row,
      rowStatus,
      isPrimary,
    };
  } catch (err) {
    console.error("[membership] checkChapterMembership failed:", err);
    return { isMember: isPrimary, hasRow: false, rowStatus: null, isPrimary };
  }
}

/**
 * Same as checkChapterMembership but loads the user first.
 * Returns null when the user doesn't exist.
 */
export async function checkChapterMembershipForEmail(
  email: string,
  chapterId: string
): Promise<(MembershipCheck & { user: { id: string; chapterId: string | null } }) | null> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, chapterId: true },
  });
  if (!user) return null;
  const check = await checkChapterMembership(user.id, chapterId, user.chapterId);
  return { ...check, user: { id: user.id, chapterId: user.chapterId } };
}

/**
 * Create (or reactivate) an ACTIVE membership row for (chapterId, userId).
 * Idempotent — safe to call repeatedly. Records the join form submission
 * in formJson and stamps the source on first creation.
 *
 * The caller MUST have authenticated the user and validated the form
 * payload before calling this.
 */
export async function joinChapter(opts: {
  chapterId: string;
  userId: string;
  source: ChapterMemberSource;
  formJson?: Record<string, unknown>;
}): Promise<{ status: ChapterMemberStatus; created: boolean }> {
  const { chapterId, userId, source, formJson } = opts;
  const existing = await db.chapterMember.findUnique({
    where: { chapterId_userId: { chapterId, userId } },
    select: { id: true, status: true },
  });

  if (existing && existing.status === "ACTIVE") {
    return { status: "ACTIVE", created: false };
  }

  if (existing) {
    // Reactivate a LEFT/PENDING/DECLINED row.
    await db.chapterMember.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        approvedAt: new Date(),
        // Update the form submission on rejoin (the latest answers win).
        ...(formJson ? { formJson: formJson as object } : {}),
      },
    });
    return { status: "ACTIVE", created: false };
  }

  await db.chapterMember.create({
    data: {
      chapterId,
      userId,
      status: "ACTIVE",
      source,
      approvedAt: new Date(),
      ...(formJson ? { formJson: formJson as object } : {}),
    },
  });
  return { status: "ACTIVE", created: true };
}

/**
 * List the chapters the user can see the member directory for:
 * the PRIMARY chapter (User.chapterId, always first) plus every chapter
 * with an ACTIVE ChapterMember row. Used by /community to decide which
 * communities' members the user may browse.
 */
export async function listJoinedChapterIds(
  userId: string,
  primaryChapterId: string | null | undefined
): Promise<string[]> {
  const ids = new Set<string>();
  if (primaryChapterId) ids.add(primaryChapterId);
  try {
    const rows = await db.chapterMember.findMany({
      where: { userId, status: "ACTIVE" },
      select: { chapterId: true },
    });
    for (const r of rows) ids.add(r.chapterId);
  } catch (err) {
    console.error("[membership] listJoinedChapterIds failed:", err);
  }
  return Array.from(ids);
}
