import { ChapterEditContent } from "../chapter-edit-content";

export const metadata = { title: "Edit chapter — AI Salon" };

/**
 * /admin/chapters/[id] — edit a chapter.
 *
 * Accepts EITHER the chapter's unique slug (preferred, e.g.
 * `/admin/chapters/mtl`) OR the raw database cuid (legacy fallback,
 * kept so existing bookmarks/links don't break). The lookup is
 * slug-first: if the param matches a chapter by slug, that chapter is
 * loaded; otherwise we try by id. If neither matches, 404.
 *
 * The admin-friendly URL is also exposed at /admin/c/[chapterSlug]
 * (identical editor, same auth + scope rules).
 */
export default async function EditChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChapterEditContent lookup={{ bySlugOrId: id }} />;
}
