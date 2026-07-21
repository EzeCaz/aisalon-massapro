import { NextRequest, NextResponse } from "next/server";
import { promises as fs, createReadStream } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  setChapterBrandImage,
  clearChapterBrandImage,
  isChapterBrandImageKey,
} from "@/lib/chapter-brand-images";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/admin/chapters/[id]/brand-images/select
 *
 * Mark one image as the favicon, login-page hero, or login-page banner
 * FOR A SPECIFIC CHAPTER. The override is stored in ChapterSetting and
 * takes precedence over the global SiteSetting value when the visitor
 * is in this chapter's context (e.g. /c/[slug] or /login?chapterSlug=slug).
 *
 * Body (JSON):
 *   {
 *     key:    "favicon" | "loginHero" | "loginBanner",
 *     source: "<https-url-or-bare-filename>",
 *     clear?: boolean   // if true, removes the chapter override (falls
 *                       // back to global). `source` is ignored.
 *   }
 *
 * `source` is either:
 *   (a) an absolute https://... URL — must already be a Vercel Blob URL
 *       (host check prevents SSRF).
 *   (b) a bare filename in the project's `.images/` folder — we copy the
 *       bytes to Vercel Blob at `chapter-brand/<chapterId>/<filename>`
 *       and store the new public URL.
 *
 * Auth: SUPER_ADMIN, ADMIN (own country), or CHAPTER_ORGANIZER (own
 * chapter). Same scope rules as PATCH /api/admin/chapters/[id].
 *
 * Returns: { ok: true, key, value }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;

  // ── Auth ────────────────────────────────────────────────────────
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!can(user!.role, "members.view")) {
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

  // ── Parse body ──────────────────────────────────────────────────
  let body: { key?: string; source?: string; clear?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = body.key;
  if (!key || !isChapterBrandImageKey(key)) {
    return NextResponse.json(
      {
        error: `Invalid key. Must be one of: favicon, loginHero, loginBanner`,
      },
      { status: 400 }
    );
  }

  // ── Clear branch ────────────────────────────────────────────────
  if (body.clear) {
    await clearChapterBrandImage(chapterId, key);
    return NextResponse.json({ ok: true, key, cleared: true });
  }

  // ── Set branch ──────────────────────────────────────────────────
  const source = body.source;
  if (typeof source !== "string" || source.length === 0) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }

  let finalUrl: string;

  if (source.startsWith("https://") || source.startsWith("http://")) {
    // CASE 1: source is already a public URL. Must be a Vercel Blob URL
    // (host check prevents SSRF — admin can't trick the API into
    // fetching+storing arbitrary internal URLs).
    if (
      !source.includes(".blob.vercel-storage.com") &&
      !source.includes("vercel-storage.com")
    ) {
      return NextResponse.json(
        { error: "URL must be a Vercel Blob URL" },
        { status: 400 }
      );
    }
    finalUrl = source;
  } else {
    // CASE 2: source is a bare filename → copy bytes from .images/ to Blob.
    if (!/^[A-Za-z0-9 _.\-]+$/.test(source)) {
      return NextResponse.json({ error: "Invalid source name" }, { status: 400 });
    }
    if (source.includes("..") || source.includes("/") || source.includes("\\")) {
      return NextResponse.json({ error: "Invalid source name" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), ".images");
    const filePath = path.join(dir, source);
    const resolvedDir = path.resolve(dir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      return NextResponse.json({ error: "Invalid source name" }, { status: 400 });
    }

    let stat;
    try {
      stat = await fs.stat(resolvedFile);
      if (!stat.isFile()) {
        return NextResponse.json({ error: "Not a file" }, { status: 404 });
      }
    } catch {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const ext = path.extname(source).toLowerCase();
    const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".svg"]);
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
    }

    const safeExt = safeFileExtension(source, extToMime(ext), "bin");
    const filename = uniqueBlobFilename(safeExt);
    // Stored at chapter-brand/<chapterId>/<filename> so each chapter's
    // brand images are isolated in their own Blob prefix (easy to list
    // per chapter later if we add a per-chapter gallery view).
    const pathname = safeBlobPathname("chapter-brand", chapterId, filename);

    // Stream the file into Vercel Blob.
    const stream = createReadStream(resolvedFile);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);

    try {
      const blob = await put(pathname, buf, {
        access: "public",
        contentType: extToMime(ext),
        addRandomSuffix: false,
      });
      finalUrl = blob.url;
    } catch (err) {
      console.error("[chapter-brand-images/select] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload image: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // ── Persist the chapter-scoped selection ────────────────────────
  await setChapterBrandImage(chapterId, key, finalUrl, user!.id);

  return NextResponse.json({ ok: true, key, value: finalUrl });
}

/** Map a file extension to a MIME type. */
function extToMime(ext: string): string {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".bmp":
      return "image/bmp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
