/**
 * src/lib/chapter-core.ts
 *
 * Parser for the `chaptercore.md` blueprint file.
 *
 * The chaptercore.md file lives at the repo root and contains a
 * machine-readable JSON config block delimited by:
 *
 *   <!-- CHAPTERCORE_JSON_START
 *   { ...json... }
 *   CHAPTERCORE_JSON_END -->
 *
 * This module extracts + validates that JSON block and exposes it as a
 * typed object. The seed-chapter API uses it to apply default brand
 * images + chapter settings to every new chapter.
 *
 * WHY A MARKDOWN FILE (not a .json)?
 *   The user wanted a single human-readable file that serves as both
 *   documentation AND the source of truth. Editing chaptercore.md is
 *   the only step needed to update the default new chapter config —
 *   no code changes, no separate .json file to keep in sync.
 *
 * The markdown prose documents WHAT each key means + HOW to update it;
 * the embedded JSON block is what the API actually reads.
 */
import { readFileSync } from "fs";
import { join } from "path";

/** Shape of a single brand image entry in the chaptercore config. */
export type ChapterCoreBrandImage = {
  /** Public path (e.g. "/defaults/chapter-core/favicon.webp") OR an absolute URL. */
  path: string;
  /**
   * For images stored as ChapterSetting rows: the setting key
   * (e.g. "favicon", "loginHero", "loginBanner", "emailLogo").
   * Mutually exclusive with `chapterField`.
   */
  chapterSettingKey?: string;
  /**
   * For images stored directly on the Chapter row: the column name
   * (e.g. "heroImageUrl"). Mutually exclusive with `chapterSettingKey`.
   */
  chapterField?: string;
};

/** Shape of the `defaults` block in the chaptercore config. */
export type ChapterCoreDefaults = {
  /** Default timezone for new chapters (e.g. "America/Toronto"). */
  timezone?: string;
  /** Default WhatsApp group URL (null = don't set). */
  whatsappGroupUrl?: string | null;
  /** Default LinkedIn URL (null = don't set). */
  linkedinUrl?: string | null;
};

/** Parsed shape of the chaptercore.md JSON block. */
export type ChapterCoreConfig = {
  version: number;
  capturedFromChapter: string;
  capturedAt: string;
  description?: string;
  brandImages: Record<string, ChapterCoreBrandImage>;
  defaults: ChapterCoreDefaults;
  emailTemplates?: {
    note?: string;
    stages?: number[];
  };
};

// ─── Internal cache ─────────────────────────────────────────────────
// chaptercore.md is read once per process (dev: once per request until
// the module reloads; prod: once per cold start). This is fine — the
// file only changes on deploy.
let _cache: ChapterCoreConfig | null = null;

/** Marker delimiters in chaptercore.md. */
const JSON_START = "CHAPTERCORE_JSON_START";
const JSON_END = "CHAPTERCORE_JSON_END";

/**
 * Read + parse the chaptercore.md file. Throws if the file is missing
 * or the JSON block is malformed — this is a fail-fast signal that the
 * blueprint file was edited incorrectly.
 */
function parseFile(): ChapterCoreConfig {
  // chaptercore.md lives at the project root (the directory containing
  // package.json + next.config.ts). In Next.js, process.cwd() is the
  // project root at runtime.
  const filePath = join(process.cwd(), "chaptercore.md");
  const raw = readFileSync(filePath, "utf-8");

  // The markers CHAPTERCORE_JSON_START / CHAPTERCORE_JSON_END also appear
  // in the prose documentation (e.g. in the "How to update" section).
  // The ACTUAL JSON block is the one wrapped in HTML comment syntax:
  //   <!-- CHAPTERCORE_JSON_START\n{...}\nCHAPTERCORE_JSON_END -->
  // So we look for the comment-wrapped form specifically.
  const startMarker = `<!-- ${JSON_START}`;
  const endMarker = `${JSON_END} -->`;
  const startIdx = raw.lastIndexOf(startMarker);
  const endIdx = raw.lastIndexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      `[chapter-core] chaptercore.md is missing the JSON config block. ` +
        `Expected "<!-- ${JSON_START}\\n{...}\\n${JSON_END} -->" — check the file at ${filePath}.`
    );
  }

  // Extract the text after "<!-- CHAPTERCORE_JSON_START" up to "CHAPTERCORE_JSON_END -->".
  const jsonText = raw
    .slice(startIdx + startMarker.length, endIdx)
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `[chapter-core] chaptercore.md JSON block is invalid JSON: ${(err as Error).message}`
    );
  }

  return validateShape(parsed, filePath);
}

/** Runtime shape validation — catches typos introduced when editing the file. */
function validateShape(parsed: unknown, filePath: string): ChapterCoreConfig {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`[chapter-core] chaptercore.md JSON block is not an object.`);
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.version !== "number") {
    throw new Error(`[chapter-core] chaptercore.md: missing or invalid "version" field.`);
  }
  if (typeof p.capturedFromChapter !== "string") {
    throw new Error(`[chapter-core] chaptercore.md: missing or invalid "capturedFromChapter" field.`);
  }
  if (typeof p.capturedAt !== "string") {
    throw new Error(`[chapter-core] chaptercore.md: missing or invalid "capturedAt" field.`);
  }
  if (typeof p.brandImages !== "object" || p.brandImages === null) {
    throw new Error(`[chapter-core] chaptercore.md: missing or invalid "brandImages" object.`);
  }

  // Validate each brand image entry.
  for (const [key, val] of Object.entries(p.brandImages as Record<string, unknown>)) {
    if (typeof val !== "object" || val === null) {
      throw new Error(`[chapter-core] chaptercore.md: brandImages.${key} is not an object.`);
    }
    const img = val as Record<string, unknown>;
    if (typeof img.path !== "string") {
      throw new Error(`[chapter-core] chaptercore.md: brandImages.${key}.path is missing or not a string.`);
    }
    const hasSettingKey = typeof img.chapterSettingKey === "string";
    const hasChapterField = typeof img.chapterField === "string";
    if (!hasSettingKey && !hasChapterField) {
      throw new Error(
        `[chapter-core] chaptercore.md: brandImages.${key} must have either "chapterSettingKey" or "chapterField".`
      );
    }
  }

  if (typeof p.defaults !== "object" || p.defaults === null) {
    // defaults is optional-ish — default to empty object.
    p.defaults = {};
  }

  return parsed as ChapterCoreConfig;
}

/**
 * Get the parsed chaptercore config. Cached after first read.
 *
 * Call from server-side code only (uses readFileSync).
 */
export function getChapterCoreConfig(): ChapterCoreConfig {
  if (_cache) return _cache;
  _cache = parseFile();
  return _cache;
}

/**
 * Reset the cache. Only useful in tests or when the file is known to have
 * changed during a single process lifetime (rare in prod).
 */
export function __resetChapterCoreCacheForTests(): void {
  _cache = null;
}

/**
 * Convert a public path (e.g. "/defaults/chapter-core/favicon.webp") to a
 * fully-qualified URL using the app's origin. This is needed because
 * ChapterSetting values for brand images are expected to be URLs that
 * email clients + OG scrapers can fetch — relative paths don't work in
 * emails.
 *
 * In dev, uses localhost:3000. In prod, uses the VERCEL_URL or the
 * NEXT_PUBLIC_APP_URL env var.
 */
export function resolvePublicPathToUrl(path: string): string {
  // Already an absolute URL → return as-is.
  if (/^https?:\/\//i.test(path)) return path;

  // It's a public/ path like "/defaults/chapter-core/favicon.webp".
  // Resolve to an absolute URL.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  // Ensure no double slash between origin + path.
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
