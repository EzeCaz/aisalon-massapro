/**
 * <Flag /> — render a country flag emoji safely.
 *
 * Some `Country.flagEmoji` rows were seeded with the ISO code instead of
 * the actual emoji (e.g. "CA" stored where "🇨🇦" should be). This
 * component uses `displayFlag()` to derive the real emoji from the ISO
 * code when the stored value is malformed or missing.
 *
 * Usage:
 *   <Flag code="CA" flagEmoji={c.flagEmoji} />
 *   <Flag code={c.country.code} flagEmoji={c.country.flagEmoji} />
 *
 * Falls back to 🏳️ when neither can produce a flag.
 */
import * as React from "react";
import { displayFlag } from "@/lib/country-flag";

export function Flag({
  code,
  flagEmoji,
  className,
}: {
  code?: string | null;
  flagEmoji?: string | null;
  className?: string;
}) {
  const flag = displayFlag(code, flagEmoji);
  return <span className={className} aria-label="Country flag">{flag}</span>;
}
