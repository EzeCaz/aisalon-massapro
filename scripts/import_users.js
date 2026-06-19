/**
 * Import users from the AI Salon TLV Excel extract into the platform DB.
 *
 * - Reads scripts/import_users.json (produced by extract_excel.py)
 * - Upserts each row by email: if a User with that email already exists
 *   (e.g. they signed up already), the imported fields are merged in
 *   without overwriting any user-edited fields (name, bio, linkedinUrl,
 *   company, photoUrl, passwordHash, role, image). The imported-only
 *   fields (mobile, interestedIn, profileCategories, appliedFor,
 *   invitedToSpeak, importSource, importedAt) are SET to the spreadsheet
 *   values, since the spreadsheet is the source of truth for those.
 * - If no User exists, a new one is created with role=MEMBER and
 *   passwordHash=null (they cannot sign in until they go through
 *   password reset / Google OAuth).
 *
 * Run:  node scripts/import_users.js
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const db = new PrismaClient();
const SOURCE = "excel:AI Salon TLV.xlsx";

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function normalizeText(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

async function main() {
  const dataPath = path.join(__dirname, "import_users.json");
  const rows = loadJson(dataPath);
  console.log(`[import] ${rows.length} rows to upsert`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = (r.email || "").toLowerCase().trim();
    if (!email) {
      errors.push({ row: i, reason: "missing email", data: r });
      continue;
    }

    try {
      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true, importSource: true },
      });

      const importedAt = r.importedAt ? new Date(r.importedAt) : new Date();

      if (!existing) {
        // Create a new user
        await db.user.create({
          data: {
            email,
            name: normalizeText(r.name),
            company: normalizeText(r.company),
            linkedinUrl: normalizeText(r.linkedinUrl),
            bio: normalizeText(r.bio),
            mobile: normalizeText(r.mobile),
            interestedIn: normalizeText(r.interestedIn),
            profileCategories: normalizeText(r.profileCategories),
            appliedFor: normalizeText(r.appliedFor),
            invitedToSpeak: normalizeText(r.invitedToSpeak),
            importSource: SOURCE,
            importedAt,
            role: "MEMBER",
          },
        });
        created++;
      } else {
        // Update — but only set imported-only fields if they're missing
        // (don't clobber admin edits). Always refresh importedAt +
        // importSource so we can re-run the import safely.
        const data = {
          importSource: SOURCE,
          importedAt,
        };
        // For imported-only fields, always overwrite with spreadsheet value
        // (spreadsheet is source of truth for these).
        for (const k of [
          "mobile",
          "interestedIn",
          "profileCategories",
          "appliedFor",
          "invitedToSpeak",
        ]) {
          data[k] = normalizeText(r[k]);
        }
        // For shared fields (name, company, linkedinUrl, bio), only set
        // if the user hasn't already filled them in. We can't easily tell
        // here without another query — so fetch the current values.
        const cur = await db.user.findUnique({
          where: { email },
          select: {
            name: true,
            company: true,
            linkedinUrl: true,
            bio: true,
          },
        });
        if (cur) {
          if (!cur.name && r.name) data.name = normalizeText(r.name);
          if (!cur.company && r.company) data.company = normalizeText(r.company);
          if (!cur.linkedinUrl && r.linkedinUrl)
            data.linkedinUrl = normalizeText(r.linkedinUrl);
          if (!cur.bio && r.bio) data.bio = normalizeText(r.bio);
        }
        await db.user.update({ where: { email }, data });
        updated++;
      }
    } catch (err) {
      errors.push({ row: i, email, reason: err.message });
      console.error(`[import] row ${i} (${email}) failed:`, err.message);
    }
  }

  console.log(`\n[import] done`);
  console.log(`  created:  ${created}`);
  console.log(`  updated:  ${updated}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  errors:   ${errors.length}`);
  if (errors.length) {
    console.log("  first 3 errors:", JSON.stringify(errors.slice(0, 3), null, 2));
  }
}

main()
  .catch((e) => {
    console.error("[import] fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
