import { ChapterEditContent } from "../chapter-edit-content";

export const metadata = { title: "Edit chapter — AI Salon" };

/**
 * /admin/chapters/[id] — edit a chapter by its database ID.
 *
 * This is the legacy/internal route. The admin-friendly URL is
 * /admin/c/[chapterSlug] — both render the same editor.
 */
export default async function EditChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChapterEditContent lookup={{ byId: id }} />;
}
