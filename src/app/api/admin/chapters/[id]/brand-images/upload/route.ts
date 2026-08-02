import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin, canSeeAdminNav, ROLES } from "@/lib/permissions";
import { db } from "@/lib/db";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/admin/chapters/[id]/brand-images/upload
 *
 * Upload a brand image FOR A SPECIFIC CHAPTER. The image is stored at
 * `chapter-brand/<chapterId>/<filename>` in Vercel Blob (production) or
 * /public/uploads/chapter-brand/<chapterId>/<filename> (local sandbox).
 *
 * Returns the new image's public URL, which the caller can then pass to
 * POST /api/admin/chapters/[id]/brand-images/select as the `source` field
 * to set it as the chapter's favicon / login hero / login banner.
 *
 * Multipart form data:
 *   - file: single image (JPG/PNG/WebP/GIF/AVIF, max 8 MB)
 *
 * Auth: SUPER_ADMIN, ADMIN (own country), or CHAPTER_ORGANIZER (own
 * chapter). Same scope rules as POST /api/admin/chapters/[id]/hero-image.
 *
 * Rationale: chapter admins used to depend on the Super Admin to upload
 * brand images for them. This route lets them upload their own images
 * directly, scoped to their own chapter's Blob prefix so they don't
 * pollute the global brand-assets/ library.
 */

/** True when Vercel Blob is configured (token present). */
function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Local filesystem path for /public/uploads/chapter-brand/<chapterId>/ */
function localChapterDir(chapterId: string): string {
  return path.join(process.cwd(), "public", "uploads", "chapter-brand", chapterId);
}

/** Public URL prefix for local chapter brand images. */
function localChapterUrl(chapterId: string, filename: string): string {
  return `/uploads/chapter-brand/${chapterId}/${encodeURIComponent(filename)}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;

  // ── Auth ────────────────────────────────────────────────────────
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!canSeeAdminNav(user!.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Verify chapter exists + scope check ─────────────────────────
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, countryId: true },
  });
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    if (user!.role === ROLES.ADMIN && chapter.countryId !== user!.countryId) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
    if (
      (user!.role === ROLES.CHAPTER_ORGANIZER || user!.role === ROLES.CO_HOST) &&
      chapter.id !== user!.chapterId
    ) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
  }

  // ── Parse multipart form ────────────────────────────────────────
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

  // 8 MB max — brand images are typically <1 MB; this is a generous ceiling.
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = safeFileExtension(file.name, file.type, "bin");
  const filename = uniqueBlobFilename(ext);

  // ---- Production path: Vercel Blob at chapter-brand/<chapterId>/<filename> ----
  if (hasBlob()) {
    const pathname = safeBlobPathname("chapter-brand", chapterId, filename);
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
          kind: "uploaded" as const,
        },
      });
    } catch (err) {
      console.error("[chapter-brand-images/upload] Vercel Blob put failed:", err);
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
        kind: "uploaded" as const,
      },
    });
  } catch (err) {
    console.error("[chapter-brand-images/upload] local write failed:", err);
    return NextResponse.json(
      { error: `Failed to save image: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
