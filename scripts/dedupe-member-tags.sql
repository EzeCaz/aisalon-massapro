-- Dedupe MemberTag.label so we can add the unique constraint.
-- Strategy: keep the OLDEST row per label, delete the rest.
-- (No join table — MemberTag.userId is a direct FK, so we don't need to re-link anything.)
-- The duplicates are tags created by the bulk-import script that didn't
-- check for an existing label first.
BEGIN;

-- Show what we're about to dedupe.
SELECT label, COUNT(*) AS n
FROM "MemberTag"
GROUP BY label
HAVING COUNT(*) > 1
ORDER BY n DESC;

-- Delete every duplicate row EXCEPT the oldest (lowest createdAt) per label.
DELETE FROM "MemberTag"
WHERE id NOT IN (
  SELECT DISTINCT ON (label) id
  FROM "MemberTag"
  ORDER BY label, "createdAt" ASC
);

-- Verify.
SELECT label, COUNT(*) AS n
FROM "MemberTag"
GROUP BY label
HAVING COUNT(*) > 1;

COMMIT;
