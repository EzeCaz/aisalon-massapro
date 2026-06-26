import { NextRequest, NextResponse } from "next/server";
import { promises as fs, createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import {
  ALL_KEYS,
  setSetting,
  K_FAVICON,
  K_LOGIN_HERO,
  K_LOGIN_BANNER,
} from "@/lib/site-settings";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * POST /api/admin/brand-images/select
 *
 * Mark one image as the favicon, the login-page hero, or the login-page
 * banner. The image is identified by EITHER:
 *   - a Vercel Blob URL (already public) → stored as-is in SiteSetting
 *   - a stock image name from `.images/` (NOT public) → we copy the bytes
 *     to Vercel Blob at `brand-assets/`, then store the new Blob URL
 *
 * Body (JSON):
 *   { key: "favicon" | "loginHero" | "loginBanner", source: "<url-or-name>" }
 *
 *   - `key` must be one of the three canonical keys (allowlist-enforced).
 *   - `source` is either:
 *       (a) an absolute https://... URL (must already be a Vercel Blob URL
 *           under the project's blob storage account, to prevent SSRF),
 *       (b) a bare filename like "Falafel meerkat.jpg" referring to a file
 *           in the `.images/` folder.
 *
 * SUPER_ADMIN-only.
 *
 * Returns:
 *   { ok: true, key, value }   — the (possibly new) URL stored for that key
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!isSuperAdmin({ email: user!.email, role: user!.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { key?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = body.key;
  const source = body.source;

  if (!key || !ALL_KEYS.has(key)) {
    return NextResponse.json(
      { error: `Invalid key. Must be one of: ${[...ALL_KEYS].join(", ")}` },
      { status: 400 }
    );
  }
  if (typeof source !== "string" || source.length === 0) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }

  let finalUrl: string;

  if (source.startsWith("https://") || source.startsWith("http://")) {
    // CASE 1: source is already a public URL. Verify it's a Vercel Blob
    // URL by checking the host — this prevents SSRF (admin can't trick
    // the API into fetching+storing arbitrary internal URLs).
    //
    // Vercel Blob URLs look like:
    //   https://<random>.public.blob.vercel-storage.com/...
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
    // Apply the same 3-layer path-traversal protection as the [name] route.
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
    const pathname = safeBlobPathname("brand-assets", filename);

    // Stream the file into Vercel Blob. Readable → Buffer conversion is
    // fine here because brand images are typically <2 MB.
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
      console.error("[brand-images/select] Vercel Blob put failed:", err);
      return NextResponse.json(
        { error: `Failed to upload image: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // Persist the selection.
  await setSetting(key, finalUrl, user!.id);

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

// Re-export the keys for client-side use (used by ImagesGallery).
export { K_FAVICON, K_LOGIN_HERO, K_LOGIN_BANNER };
