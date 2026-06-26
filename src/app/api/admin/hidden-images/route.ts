import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requirePermission, isError } from "@/lib/auth-guards";

/**
 * GET /api/admin/hidden-images
 *
 * Returns a JSON list of every image in the project's hidden image folder
 * (`.images/` at the project root). Each entry includes:
 *   - name        (filename, e.g. "Falafel meerkat.jpg")
 *   - size        (bytes)
 *   - mimeType    (image/jpeg | image/png | image/webp | ...)
 *   - url         (the auth-gated URL to stream the bytes:
 *                 /api/admin/hidden-images/<encodeURIComponent(name)>)
 *
 * ADMIN-ONLY — same gate as the rest of /admin (SUPER_ADMIN or ADMIN).
 *
 * The .images folder is intentionally NOT under public/, so the files
 * cannot be served by Next's static file server. This route is the only
 * way to discover them; the [name] route is the only way to fetch their
 * bytes.
 */
export async function GET() {
  const me = await requirePermission("members.view");
  if (isError(me)) return me;

  const dir = path.join(process.cwd(), ".images");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (e) {
    // Folder missing or unreadable — return an empty list rather than 500ing,
    // so the /admin/images page still renders (with an "no images found"
    // empty state) instead of crashing.
    console.warn("[hidden-images] could not read .images folder:", e);
    return NextResponse.json({ images: [] });
  }

  const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".svg"]);
  const images = await Promise.all(
    entries
      .filter((name) => {
        const ext = path.extname(name).toLowerCase();
        return ALLOWED_EXT.has(ext);
      })
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(async (name) => {
        let size = 0;
        try {
          const stat = await fs.stat(path.join(dir, name));
          size = stat.size;
        } catch {
          // ignore — report 0 if stat fails
        }
        const ext = path.extname(name).toLowerCase();
        const mimeType =
          ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".png"
              ? "image/png"
              : ext === ".webp"
                ? "image/webp"
                : ext === ".gif"
                  ? "image/gif"
                  : ext === ".avif"
                    ? "image/avif"
                    : ext === ".bmp"
                      ? "image/bmp"
                      : ext === ".svg"
                        ? "image/svg+xml"
                        : "application/octet-stream";
        return {
          name,
          size,
          mimeType,
          url: `/api/admin/hidden-images/${encodeURIComponent(name)}`,
        };
      })
  );

  return NextResponse.json({ images });
}
