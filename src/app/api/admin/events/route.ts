import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES, getUserScope } from "@/lib/permissions";

/**
 * POST /api/admin/events
 * Body: full event payload (title, slug, startsAt, endsAt, etc.)
 * Admin-only.
 *
 * V7 (2026-07-21): accepts `chapterId` (the real FK to Chapter) and
 * validates that the caller's UserScope covers that chapter:
 *   - SUPER_ADMIN       → any chapter
 *   - ADMIN             → any chapter in their country
 *   - CHAPTER_ORGANIZER → only their own chapter
 *
 * The legacy free-form `chapter: String` field is still written as a
 * denormalized cache of Chapter.name for backward compatibility with
 * code that hasn't been migrated to read `chapterRef`.
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

  const body = await req.json();
  const {
    title,
    subtitle,
    chapter,
    chapterId,
    venue,
    address,
    city,
    country,
    mapUrl,
    wazeUrl,
    startsAt,
    endsAt,
    description,
    takeaways,
    intendedFor,
    rsvpUrl,
  } = body;

  if (!title || !startsAt || !endsAt) {
    return NextResponse.json({ error: "title, startsAt, endsAt required" }, { status: 400 });
  }

  // ---- V7: scope-check the requested chapterId ----
  // If the caller passed a chapterId, verify their UserScope covers it.
  // CHAPTER_ORGANIZER / CO_HOST can only create events in their own
  // chapter; ADMIN can create in any chapter of their country;
  // SUPER_ADMIN can create in any chapter.
  let resolvedChapterId: string | null = null;
  let resolvedChapterName: string = chapter || "Tel Aviv";

  if (chapterId && typeof chapterId === "string") {
    const scope = await getUserScope(me.id);
    // For country scope, canActOnChapter returns true at the role level,
    // but we need to additionally verify the chapter belongs to their
    // country. We do that with a DB lookup that also fetches name +
    // countryId in one shot.
    const chapterRow = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, name: true, countryId: true, isActive: true },
    });
    if (!chapterRow) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    if (!chapterRow.isActive) {
      return NextResponse.json({ error: "Chapter is not active" }, { status: 400 });
    }
    // Strict scope check:
    //   - global scope → ok
    //   - country scope → chapterRow.countryId must match scope.countryId
    //   - chapter scope → chapterRow.id must match scope.chapterId
    if (scope.kind === "country" && chapterRow.countryId !== scope.countryId) {
      return NextResponse.json(
        { error: "You can only create events in chapters within your country" },
        { status: 403 }
      );
    }
    if (scope.kind === "chapter" && chapterRow.id !== scope.chapterId) {
      return NextResponse.json(
        { error: "You can only create events in your own chapter" },
        { status: 403 }
      );
    }
    if (scope.kind === "none") {
      return NextResponse.json({ error: "No admin scope" }, { status: 403 });
    }
    resolvedChapterId = chapterRow.id;
    resolvedChapterName = chapterRow.name;
  } else {
    // No chapterId provided. Only SUPER_ADMIN can create an event with
    // no chapter (legacy/edge case). Everyone else must specify one.
    if (!isSuperAdminEmail(me.email) && me.role !== ROLES.ADMIN) {
      return NextResponse.json(
        { error: "Chapter is required" },
        { status: 400 }
      );
    }
  }

  // Auto-generate slug if not provided
  const slug =
    body.slug ||
    `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${new Date(startsAt).toISOString().slice(0, 10)}`;

  const event = await db.event.create({
    data: {
      slug,
      title,
      subtitle: subtitle || null,
      // V7: legacy free-form cache + real FK (when resolved)
      chapter: resolvedChapterName,
      chapterId: resolvedChapterId,
      venue: venue || null,
      address: address || null,
      city: city || null,
      country: country || null,
      mapUrl: mapUrl || null,
      wazeUrl: wazeUrl || null,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      description: description || null,
      takeaways: takeaways || null,
      intendedFor: intendedFor || null,
      rsvpUrl: rsvpUrl || null,
    },
  });

  return NextResponse.json({ event });
}
