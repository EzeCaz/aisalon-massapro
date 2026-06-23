import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { MEMBER_TAG_CATALOG } from "@/lib/tags";

/**
 * POST /api/admin/members/bulk-tags
 * Body: {
 *   userIds: string[],
 *   addTags?: string[],      // tags to ADD (merged with existing)
 *   removeTags?: string[]    // tags to REMOVE from each user
 * }
 *
 * Either addTags or removeTags (or both) must be non-empty.
 * Tags are validated against MEMBER_TAG_CATALOG.
 *
 * Returns { ok: true, updated: N } where N is the number of users touched.
 *
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    userIds?: string[];
    addTags?: string[];
    removeTags?: string[];
  };

  const userIds = Array.isArray(body.userIds) ? body.userIds : [];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "userIds[] required" }, { status: 400 });
  }

  const addTags = Array.isArray(body.addTags) ? body.addTags : [];
  const removeTags = Array.isArray(body.removeTags) ? body.removeTags : [];

  if (addTags.length === 0 && removeTags.length === 0) {
    return NextResponse.json(
      { error: "addTags[] or removeTags[] must be non-empty" },
      { status: 400 }
    );
  }

  // Validate labels
  const validLabels = new Set(MEMBER_TAG_CATALOG.map((t) => t.label));
  for (const label of [...addTags, ...removeTags]) {
    if (!validLabels.has(label)) {
      return NextResponse.json(
        { error: `Invalid tag: ${label}` },
        { status: 400 }
      );
    }
  }

  // Fetch all target users with their existing tags
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, tags: true },
  });

  if (users.length !== userIds.length) {
    // Some IDs don't exist — fail loudly so the admin notices
    const foundIds = new Set(users.map((u) => u.id));
    const missing = userIds.filter((id) => !foundIds.has(id));
    return NextResponse.json(
      { error: `Some users not found: ${missing.join(", ")}` },
      { status: 404 }
    );
  }

  // For each user, compute the final tag set: (existing - removeTags) + addTags
  // Then delete all existing tags for that user and recreate the final set.
  // Doing this in a transaction per user to keep it atomic.
  let touched = 0;
  await db.$transaction(
    users.map((u) => {
      const existing = new Set(u.tags.map((t) => t.label));
      // Remove
      for (const r of removeTags) existing.delete(r);
      // Add
      for (const a of addTags) existing.add(a);
      const finalLabels = Array.from(existing);

      return db.$transaction([
        db.memberTag.deleteMany({ where: { userId: u.id } }),
        ...(finalLabels.length === 0
          ? []
          : db.memberTag.createMany({
              data: finalLabels.map((label) => ({
                userId: u.id,
                label,
                color:
                  MEMBER_TAG_CATALOG.find((t) => t.label === label)?.color ||
                  "#52525B",
              })),
            })),
      ]);
    })
  );

  touched = users.length;
  return NextResponse.json({ ok: true, updated: touched });
}
