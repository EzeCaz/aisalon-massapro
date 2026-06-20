/**
 * Helpers for building Vercel Blob pathnames that pass the API's
 * server-side pathname validation.
 *
 * Vercel Blob's pathname rules (enforced server-side, not just by the
 * SDK) are:
 *   - 1–950 characters
 *   - Only ASCII letters, digits, hyphen, underscore, period, slash
 *     (regex: ^[a-zA-Z0-9\-_.\/]+$)
 *   - No `//` (consecutive slashes)
 *   - No leading/trailing slash
 *   - No `..` segments
 *
 * The most common way we accidentally violate this rule is by deriving
 * the file extension from `file.name.split(".").pop()`. When a file has
 * NO extension and a non-ASCII name (very common with Hebrew, Arabic,
 * Cyrillic filenames — e.g. a file literally named "תמונה"), `pop()`
 * returns the entire non-ASCII filename, which then becomes the
 * "extension" appended to the blob pathname. The non-ASCII characters
 * fail the regex → the upload fails with:
 *
 *   "The request blob name \"...\" doesn't match the expected path or pattern"
 *
 * which is the error users see in the UI as
 *   "string doesn't match the expected path or pattern".
 *
 * This module provides:
 *   - `safeFileExtension(name, mimeType)` — always returns an ASCII-only
 *     extension (1–8 alphanumeric chars), preferring the original
 *     extension when it's safe, falling back to a MIME-type mapping,
 *     then to a generic fallback.
 *   - `safeBlobPathname(...)` — joins path segments with `/`, stripping
 *     any leading/trailing slashes on each segment and rejecting `..`.
 */

const MIME_TO_EXT: Record<string, string> = {
  // images
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/svg+xml": "svg",
  // documents / presentations
  "application/pdf": "pdf",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.apple.keynote": "key",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/rtf": "rtf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/octet-stream": "bin",
};

/**
 * Returns a safe ASCII-only file extension (no leading dot) for use in
 * a Vercel Blob pathname.
 *
 * Resolution order:
 *   1. The original extension from `fileName`, IF it's 1–8 chars and
 *      matches `[a-z0-9]+` (after lowercasing).
 *   2. The MIME-type → extension mapping above, IF the MIME type is known.
 *   3. The provided `fallback` (default `"bin"`).
 *
 * Examples:
 *   safeFileExtension("photo.jpg", "image/jpeg")        → "jpg"
 *   safeFileExtension("deck.PPTX", "...presentationml") → "pptx"
 *   safeFileExtension("תמונה", "image/jpeg")            → "jpg"   ← was the bug
 *   safeFileExtension("תמונה", "")                      → "bin"
 *   safeFileExtension("photo", "image/jpeg")            → "jpg"
 *   safeFileExtension("archive.tar.gz", "application/gzip") → "gz"
 *   safeFileExtension("", "image/png")                  → "png"
 */
export function safeFileExtension(
  fileName: string | undefined | null,
  mimeType: string | undefined | null,
  fallback = "bin"
): string {
  // Try the original extension first
  if (fileName) {
    const raw = fileName.split(".").pop()?.toLowerCase() ?? "";
    // Only accept pure ASCII alphanumeric, 1–8 chars. This rejects
    // Hebrew/Arabic/Cyrillic "extensions" (which are actually the whole
    // filename when there's no dot), spaces, special chars, etc.
    if (raw && /^[a-z0-9]{1,8}$/.test(raw)) {
      return raw;
    }
  }
  // Fall back to MIME mapping
  if (mimeType) {
    const mapped = MIME_TO_EXT[mimeType.toLowerCase()];
    if (mapped) return mapped;
  }
  return fallback;
}

/**
 * Joins path segments into a single safe Vercel Blob pathname.
 *
 * - Each segment is stripped of leading/trailing slashes.
 * - `..` segments are rejected (throws) — callers should never pass
 *   user-controlled path segments that resolve to a parent directory.
 * - Empty segments are dropped (avoids `//`).
 * - The result is checked against Vercel Blob's pathname regex.
 *
 * Example:
 *   safeBlobPathname("events", eventId, "presentations", `${ts}-${rand}.${ext}`)
 *   → "events/<eventId>/presentations/<ts>-<rand>.<ext>"
 */
export function safeBlobPathname(...segments: (string | number)[]): string {
  const cleaned: string[] = [];
  for (const seg of segments) {
    const s = String(seg).trim().replace(/^\/+|\/+$/g, "");
    if (s === "") continue;
    if (s === "..") {
      throw new Error(`safeBlobPathname: '..' segment is not allowed (got: ${segments.join("/")})`);
    }
    cleaned.push(s);
  }
  const joined = cleaned.join("/");
  if (joined.length === 0) {
    throw new Error(`safeBlobPathname: pathname is empty (got: ${segments.join("/")})`);
  }
  if (joined.length > 950) {
    throw new Error(`safeBlobPathname: pathname too long (${joined.length} > 950 chars)`);
  }
  // Final safety check — must match Vercel Blob's server-side regex
  if (!/^(?!.*\/\/)[A-Za-z0-9\-_.\/]+$/.test(joined)) {
    throw new Error(`safeBlobPathname: result contains invalid characters: "${joined}"`);
  }
  return joined;
}

/**
 * Builds a unique-ish filename for a blob upload, combining a timestamp
 * and a short random suffix. Used as the last segment of a blob pathname.
 *
 * Example: `1700000000000-abc123.jpg`
 *
 * NOTE: When `addRandomSuffix: false` is used with Vercel Blob's `put()`,
 * the caller is responsible for ensuring the pathname is unique. This
 * helper provides a timestamp + 6-char base-36 random suffix, which
 * gives ~2.17 billion combinations per millisecond — collision is
 * effectively impossible in practice.
 */
export function uniqueBlobFilename(ext: string): string {
  const safeExt = ext.replace(/^\.+/, "").toLowerCase();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}.${safeExt}`;
}
