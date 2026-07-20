import { ChapterEditContent } from "../../chapters/chapter-edit-content";
import type { Metadata } from "next";
import { db } from "@/lib/db";

/**
 * /admin/c/[chapterSlug] — slug-based admin chapter editor URL.
 *
 * Stable, bookmarkable admin URL keyed by the chapter's slug (e.g.
 * `/admin/c/tel-aviv`). Renders the same editor as /admin/chapters/[id]
 * — both delegate to the shared ChapterEditContent server component
 * (same auth + permission + scope rules).
 *
 * The slug → ID resolution happens INSIDE ChapterEditContent, AFTER
 * the auth check, so unauthenticated visitors get redirected to
 * /login without any DB lookup. (Same behavior as the ID-based route.)
 *
 * If the slug doesn't match any chapter → 404 (after auth).
 *
 * NOTE: the only DB call made by THIS file is the generateMetadata
 * lookup, which is best-effort and returns a default title if the
 * chapter doesn't exist or the DB is unreachable.
 */
type Params = { params: Promise<{ chapterSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { chapterSlug } = await params;
  let title = "Edit chapter — AI Salon";
  let description = "Admin chapter editor — AI Salon";
  try {
    const chapter = await db.chapter.findUnique({
      where: { slug: chapterSlug },
      select: { name: true, city: true },
    });
    if (chapter) {
      title = `Edit ${chapter.name} chapter — AI Salon`;
      description = `Admin editor for the ${chapter.name}${
        chapter.city ? ` (${chapter.city})` : ""
      } chapter.`;
    }
  } catch {
    // ignore — fall back to default title
  }
  return { title, description };
}

export default async function EditChapterBySlugPage({ params }: Params) {
  const { chapterSlug } = await params;
  return <ChapterEditContent lookup={{ bySlug: chapterSlug }} />;
}
