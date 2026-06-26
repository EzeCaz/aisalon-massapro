import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { list, put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";
import { getPublicSettings } from "@/lib/site-settings";

/**
 * GET /api/admin/brand-images
 *
 * Returns a combined list of:
 *   1. Stock images — every image in the project's hidden `.images/` folder
 *      (the brand-image vault). These are NOT directly web-accessible;
 *      they're streamed through /api/admin/hidden-images/[name].
 *   2. Uploaded images — every object under the `brand-assets/` prefix in
 *      Vercel Blob (production), OR every file in /public/uploads/brand-assets/
 *      (local sandbox fallback when Blob isn't configured).
 *
 * Plus the current selection for each role (favicon / loginHero /
 * loginBanner) so the UI can highlight which image is currently set.
 *
 * SUPER_ADMIN-only. (Admins can VIEW the .images/ folder via
 * /api/admin/hidden-images, but only Super Admins can upload + select
 * brand assets, because those choices affect every page of the site.)
 */

/** True when Vercel Blob is configured (token present). */
function hasBlob(): boolean {
  // NOTE: only BLOB_READ_WRITE_TOKEN counts. VERCEL_TOKEN is for the Vercel
  // REST API (deployments, env vars), NOT for Blob storage — having it set
  // doesn't mean we can call put() / list() successfully.
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Local filesystem path for /public/uploads/brand-assets/ */
const LOCAL_BRAND_DIR = path.join(process.cwd(), "public", "uploads", "brand-assets");

/** Public URL prefix for local brand assets. */
const LOCAL_BRAND_URL = "/uploads/brand-assets";

export async function GET() {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. List stock images from the hidden .images/ folder.
  const stock: Array<{
    name: string;
    size: number;
    mimeType: string;
    url: string;
    kind: "stock";
  }> = [];
  try {
    const dir = path.join(process.cwd(), ".images");
    const entries = await fs.readdir(dir);
    const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".svg"]);
    for (const name of entries.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))) {
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      let size = 0;
      try {
        const stat = await fs.stat(path.join(dir, name));
        size = stat.size;
      } catch {
        /* ignore */
      }
      stock.push({
        name,
        size,
        mimeType: extToMime(ext),
        url: `/api/admin/hidden-images/${encodeURIComponent(name)}`,
        kind: "stock",
      });
    }
  } catch (e) {
    console.warn("[brand-images] could not read .images folder:", e);
    // Return empty stock list — uploaded images are still returned.
  }

  // 2. List uploaded images. Try Vercel Blob first; fall back to local disk.
  const uploaded: Array<{
    name: string;
    size: number;
    mimeType: string;
    url: string;
    kind: "uploaded";
  }> = [];

  if (hasBlob()) {
    try {
      let cursor: string | undefined = undefined;
      for (let i = 0; i < 5; i++) {
        const result = await list({
          prefix: "brand-assets/",
          limit: 100,
          cursor,
        });
        for (const blob of result.blobs) {
          uploaded.push({
            name: blob.pathname.split("/").pop() ?? blob.pathname,
            size: blob.size,
            mimeType: blob.contentType || "application/octet-stream",
            url: blob.url,
            kind: "uploaded",
          });
        }
        if (!result.hasMore || !result.cursor) break;
        cursor = result.cursor;
      }
    } catch (e) {
      console.warn("[brand-images] could not list Vercel Blob brand-assets/:", e);
    }
  } else {
    // Local sandbox fallback: read /public/uploads/brand-assets/
    try {
      await fs.mkdir(LOCAL_BRAND_DIR, { recursive: true });
      const entries = await fs.readdir(LOCAL_BRAND_DIR);
      const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".svg"]);
      for (const name of entries.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))) {
        const ext = path.extname(name).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) continue;
        let size = 0;
        try {
          const stat = await fs.stat(path.join(LOCAL_BRAND_DIR, name));
          size = stat.size;
        } catch {
          /* ignore */
        }
        uploaded.push({
          name,
          size,
          mimeType: extToMime(ext),
          url: `${LOCAL_BRAND_URL}/${encodeURIComponent(name)}`,
          kind: "uploaded",
        });
      }
    } catch (e) {
      console.warn("[brand-images] could not read local brand-assets dir:", e);
    }
  }

  // 3. Current selections for each role.
  const settings = await getPublicSettings();

  return NextResponse.json({
    images: [...uploaded, ...stock],
    selections: settings,
  });
}

/**
 * POST /api/admin/brand-images
 *
 * Upload a new brand image. In production this goes to Vercel Blob at
 * `brand-assets/<filename>`. In the local sandbox (no BLOB_READ_WRITE_TOKEN),
 * it's written to /public/uploads/brand-assets/<filename> and served
 * statically from there.
 *
 * Multipart form data:
 *   - file: single image (JPG/PNG/WebP/GIF/AVIF, max 8 MB)
 *
 * SUPER_ADMIN-only.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // ---- Production path: Vercel Blob ----
  if (hasBlob()) {
    const pathname = safeBlobPathname("brand-assets", filename);
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
      console.error("[brand-images] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload image: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // ---- Sandbox fallback: local filesystem ----
  try {
    await fs.mkdir(LOCAL_BRAND_DIR, { recursive: true });
    const fullPath = path.join(LOCAL_BRAND_DIR, filename);
    await fs.writeFile(fullPath, buf);
    const publicUrl = `${LOCAL_BRAND_URL}/${encodeURIComponent(filename)}`;
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
    console.error("[brand-images] local write failed:", err);
    return NextResponse.json(
      { error: `Failed to upload image locally: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/** Map a file extension to a MIME type (mirrors the [name] route). */
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
