import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/admin/chapters/[id]/hero-image
 *
 * Upload a hero image for a chapter. Used by the chapter editor to set
 * the image shown on the right side of the chapter landing page
 * (/c/[slug]). The URL returned here is then PATCHed into the chapter's
 * `heroImageUrl` field by the editor.
 *
 * Multipart form data:
 *   - file: single image (JPG/PNG/WebP/GIF/AVIF, max 8 MB)
 *
 * Auth: any admin role (SUPER_ADMIN / ADMIN / CHAPTER_ORGANIZER).
 * Scope check: the caller must be able to edit the chapter they're
 * uploading for (same scope rules as PATCH /api/admin/chapters/[id]).
 *
 * Storage:
 *   - Production: Vercel Blob at `chapter-hero/<chapterId>/<filename>`
 *   - Sandbox: /public/uploads/chapter-hero/<chapterId>/<filename>
 *     (served statically)
 */

/** True when Vercel Blob is configured (token present). */
function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Local filesystem path for /public/uploads/chapter-hero/<chapterId>/ */
function localChapterDir(chapterId: string): string {
  return path.join(process.cwd(), "public", "uploads", "chapter-hero", chapterId);
}

/** Public URL prefix for local chapter hero images. */
function localChapterUrl(chapterId: string, filename: string): string {
  return `/uploads/chapter-hero/${chapterId}/${encodeURIComponent(filename)}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify chapter exists
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, countryId: true },
  });
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Scope check: Super Admin can edit any chapter. Country Admin can
  // only edit chapters in their country. Chapter Organizer / CO_HOST
  // can only edit their own chapter.
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    if (me.role === ROLES.ADMIN && chapter.countryId !== me.countryId) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
    if (
      (me.role === ROLES.CHAPTER_ORGANIZER || me.role === ROLES.CO_HOST) &&
      chapter.id !== me.chapterId
    ) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
  }

  // Parse multipart form
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Use JPG, PNG, WebP, GIF, or AVIF.` },
      { status: 400 }
    );
  }

  // 8 MB max — hero images are typically <1 MB; this is a generous ceiling.
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = safeFileExtension(file.name, file.type, "bin");
  const filename = uniqueBlobFilename(ext);

  // ---- Production path: Vercel Blob ----
  if (hasBlob()) {
    const pathname = safeBlobPathname("chapter-hero", chapterId, filename);
    try {
      const blob = await put(pathname, buf, {
        access: "public",
        contentType: file.type || "application/octet-stream",
        addRandomSuffix: false,
      });
      return NextResponse.json({
        ok: true,
        image: {
          name: filename,
          url: blob.url,
          size: file.size,
          mimeType: file.type,
        },
      });
    } catch (err) {
      console.error("[chapter-hero-image] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload image: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // ---- Sandbox fallback: local filesystem ----
  try {
    const dir = localChapterDir(chapterId);
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, buf);
    const publicUrl = localChapterUrl(chapterId, filename);
    return NextResponse.json({
      ok: true,
      image: {
        name: filename,
        url: publicUrl,
        size: file.size,
        mimeType: file.type,
      },
    });
  } catch (err) {
    console.error("[chapter-hero-image] local write failed:", err);
    return NextResponse.json(
      { error: `Failed to save image: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
