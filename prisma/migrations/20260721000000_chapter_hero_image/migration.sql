-- AlterTable: add heroImageUrl to Chapter
-- Optional hero image shown on the right side of the chapter landing page
-- (/c/[slug]). Either an external URL or a Vercel Blob URL from the
-- chapter hero image uploader. Null = render the gradient-only hero.
ALTER TABLE "Chapter" ADD COLUMN "heroImageUrl" TEXT;
