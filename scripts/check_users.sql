-- Check users in the database
SELECT id, email, name, "passwordHash" IS NOT NULL AS has_password, role, "createdAt"
FROM "User"
ORDER BY "createdAt" DESC
LIMIT 10;
