import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { MEMBER_TAG_CATALOG } from "@/lib/tags";

/**
 * PUT /api/admin/members/[id]/tags
 * Body: { tags: string[] }  — full replacement list of tag labels.
 * Admin-only.
 *
 * Validates each label against MEMBER_TAG_CATALOG.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { tags } = (await req.json()) as { tags: string[] };
  if (!Array.isArray(tags)) {
    return NextResponse.json({ error: "tags[] required" }, { status: 400 });
  }

  // Validate labels against the catalog
  const validLabels = new Set(MEMBER_TAG_CATALOG.map((t) => t.label));
  for (const label of tags) {
    if (!validLabels.has(label)) {
      return NextResponse.json({ error: `Invalid tag: ${label}` }, { status: 400 });
    }
  }

  // Replace all tags for this user
  await db.memberTag.deleteMany({ where: { userId: id } });
  if (tags.length > 0) {
    await db.$transaction(
      tags.map((label) => {
        const color = MEMBER_TAG_CATALOG.find((t) => t.label === label)?.color || "#52525B";
        return db.memberTag.create({
          data: { userId: id, label, color },
        });
      })
    );
  }

  const updated = await db.user.findUnique({
    where: { id },
    include: { tags: true },
  });
  return NextResponse.json({ member: updated });
}
