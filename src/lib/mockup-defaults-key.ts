/**
 * Chapter-scoped localStorage key helper for mockup "Set as default".
 *
 * PROBLEM (TSK-0076):
 *   The mockup editors (speaker-intro, meet-the-speaker, event-profile,
 *   agenda-profile, qr-salon) let the admin click "Set as default" to
 *   save the current mockup data to localStorage. Previously the key was
 *   global (e.g. `speaker-intro-style-defaults-style1`), which meant a
 *   Montreal admin's default would leak to a Tel Aviv admin on the same
 *   browser. The user explicitly wants these defaults to be per-chapter.
 *
 * SOLUTION:
 *   Each mockup server page computes a `scopeKey` string from the admin's
 *   UserScope and passes it to the editor as a prop. The editor then uses
 *   this helper to build the localStorage key:
 *
 *     `${prefix}${scopeKey}-${suffix}`
 *
 *   Examples:
 *     - Montreal admin  → scopeKey "chapter_<cuid>"  → key "speaker-intro-style-defaults-chapter_abc123-style1"
 *     - Super admin      → scopeKey "global"          → key "speaker-intro-style-defaults-global-style1"
 *     - Country admin    → scopeKey "country_<cuid>"  → key "speaker-intro-style-defaults-country_xyz789-style1"
 *
 * MIGRATION:
 *   Old keys (without a scopeKey segment) are NOT migrated. The first time
 *   an admin clicks "Set as default" after this change, a new chapter-scoped
 *   key is created. The old global key is left in localStorage (harmless).
 *   If the admin clicks "Reset" and no chapter-scoped key exists yet, the
 *   editor falls back to SAMPLE_DATA (same as before).
 */

/**
 * Build a stable string identifier for a UserScope.
 * Returns one of:
 *   - "global"                          (SUPER_ADMIN — sees all chapters)
 *   - "country_<countryId>"             (ADMIN — sees their country)
 *   - "chapter_<chapterId>"             (CHAPTER_ORGANIZER / CO_HOST — sees their chapter)
 *   - "none"                            (no admin access — shouldn't happen in mockup pages)
 */
export function buildScopeKey(scope: {
  kind: "global" | "country" | "chapter" | "none";
  countryId?: string;
  chapterId?: string;
}): string {
  switch (scope.kind) {
    case "global":
      return "global";
    case "country":
      return `country_${scope.countryId ?? "unknown"}`;
    case "chapter":
      return `chapter_${scope.chapterId ?? "unknown"}`;
    case "none":
      return "none";
  }
}

/**
 * Build the full localStorage key for a chapter-scoped mockup default.
 *
 * @param prefix  e.g. "speaker-intro-style-defaults-"
 * @param scopeKey  e.g. "chapter_abc123" (from buildScopeKey)
 * @param suffix  e.g. "style1" or "current"
 */
export function buildMockupDefaultKey(
  prefix: string,
  scopeKey: string,
  suffix: string,
): string {
  return `${prefix}${scopeKey}-${suffix}`;
}
