-- 20260919120000_fix_country_flagemoji_seed
--
-- Some Country rows were seeded with the ISO-2 code in flagEmoji
-- (e.g. 'CA' stored where '🇨🇦' should be). Israel was correct, but
-- Canada (and possibly others) got the raw code, so the chapter
-- landing page rendered "CA" where the flag should have been.
--
-- This migration is IDEMPOTENT — only touches rows whose flagEmoji
-- looks like a 2-char ASCII code (no regional-indicator chars). It
-- converts each such row to the actual flag emoji derived from its
-- ISO-2 code via regional indicator symbols (U+1F1E6 + (letter - 'A')).
--
-- Safe to re-run — the WHERE clause filters out already-correct rows.

UPDATE "Country"
SET "flagEmoji" = (
  -- Pair of regional indicator letters for the country code.
  chr(127462 + ascii(upper(substr("code", 1, 1))) - ascii('A'))
  || chr(127462 + ascii(upper(substr("code", 2, 2))) - ascii('A'))
)
WHERE "code" ~ '^[A-Za-z]{2}$'
  AND "flagEmoji" IS NOT NULL
  AND length("flagEmoji") <= 2
  AND "flagEmoji" !~ '[\x{1F1E6}-\x{1F1FF}]';
