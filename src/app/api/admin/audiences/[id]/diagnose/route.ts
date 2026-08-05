/**
 * GET /api/admin/audiences/[id]/diagnose — diagnose why a DYNAMIC audience
 * resolves to a different count than the keyword search preview shows.
 *
 * Returns:
 *   {
 *     audience: { id, name, kind, filtersJson, filtersParsed },
 *     resolverCount: number,        // resolveAudienceEmails(spec).length
 *     resolverEmails: string[],     // first 50 emails
 *     searchCount: number,          // count from running the same keyword
 *                                    // through /api/admin/members/search semantics
 *     searchUsers: Array<{          // first 50 users from keyword search
 *       email, name, archivedAt, matchedFields[]
 *     }>,
 *     diff: {
 *       inSearchNotResolver: Array<{ email, name, archivedAt, matchedFields[] }>,
 *       inResolverNotSearch: string[]
 *     },
 *     keyword: string | null        // extracted from the spec, if any
 *   }
 *
 * Auth: SUPER_ADMIN or ADMIN.
 *
 * This route is READ-ONLY — it doesn't modify anything. Useful for
 * debugging "flow editor shows 0, audience page shows 19" type issues.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  parseSpec,
  resolveAudienceEmails,
  type FilterRule,
} from "@/lib/email-orchestrator/audience-filter";

export const dynamic = "force-dynamic";

// Same field list as the keyword search bar in audiences-client.tsx
// (kept in sync manually — if you add a field there, add it here too).
const KEYWORD_USER_FIELDS = [
  "name",
  "email",
  "company",
  "title",
  "bio",
  "mobile",
  "companyUrl",
  "linkedinUrl",
  "portfolioUrl",
  "interestedIn",
  "profileCategories",
  "appliedFor",
  "invitedToSpeak",
];

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  archivedAt: Date | null;
  interestedIn: string | null;
  profileCategories: string | null;
  appliedFor: string | null;
  invitedToSpeak: string | null;
  bio: string | null;
  company: string | null;
  title: string | null;
  mobile: string | null;
  companyUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
};

function buildKeywordWhere(q: string) {
  return {
    OR: KEYWORD_USER_FIELDS.map((field) => ({
      [field]: { contains: q, mode: "insensitive" as const },
    })),
  };
}

/** Extract the most likely keyword from a saved spec — looks for a single
 *  OR group of `contains` rules all sharing the same value across multiple
 *  fields. Returns null if no such pattern is found. */
function extractKeywordFromSpec(spec: ReturnType<typeof parseSpec>): string | null {
  if (!spec || !spec.groups || spec.groups.length === 0) return null;
  // Find an OR group with 3+ contains rules sharing the same value.
  for (const g of spec.groups) {
    if (g.combinator !== "OR") continue;
    const containsRules = g.rules.filter(
      (r: FilterRule) => r.op === "contains" && r.value && r.value.trim().length > 0,
    );
    if (containsRules.length < 3) continue;
    const firstValue = (containsRules[0] as FilterRule).value.trim();
    const allSameValue = containsRules.every(
      (r: FilterRule) => r.value.trim() === firstValue,
    );
    if (allSameValue) return firstValue;
  }
  return null;
}

/** For each user, return the list of fields where the keyword actually
 *  matched (so the admin can see WHY the user matched the search). */
function matchedFieldsForUser(u: UserRow, q: string): string[] {
  const lower = q.toLowerCase();
  const matches: string[] = [];
  for (const field of KEYWORD_USER_FIELDS) {
    const v = u[field as keyof UserRow];
    if (typeof v === "string" && v.toLowerCase().includes(lower)) {
      matches.push(field);
    }
  }
  return matches;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const audience = await db.emailAudience.findUnique({ where: { id } });
  if (!audience) {
    return NextResponse.json({ error: "Audience not found" }, { status: 404 });
  }

  // Parse the saved spec.
  const specParsed = audience.filtersJson ? parseSpec(audience.filtersJson) : null;

  // Run the resolver (same code path as flow editor + audience sidebar).
  let resolverEmails: string[] = [];
  let resolverError: string | null = null;
  if (specParsed) {
    try {
      resolverEmails = await resolveAudienceEmails(specParsed);
    } catch (err) {
      resolverError = err instanceof Error ? err.message : String(err);
    }
  }

  // Extract keyword from the spec (if any) and run the keyword-search
  // semantics (same as /api/admin/members/search but without the limit).
  const keyword = extractKeywordFromSpec(specParsed);
  let searchUsersRaw: UserRow[] = [];
  let searchError: string | null = null;
  if (keyword) {
    try {
      const where = buildKeywordWhere(keyword);
      searchUsersRaw = await db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          archivedAt: true,
          interestedIn: true,
          profileCategories: true,
          appliedFor: true,
          invitedToSpeak: true,
          bio: true,
          company: true,
          title: true,
          mobile: true,
          companyUrl: true,
          linkedinUrl: true,
          portfolioUrl: true,
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      });
    } catch (err) {
      searchError = err instanceof Error ? err.message : String(err);
    }
  }

  // Build the diff.
  const resolverSet = new Set(resolverEmails.map((e) => e.toLowerCase()));
  const searchEmails = searchUsersRaw.map((u) => u.email.toLowerCase());
  const searchSet = new Set(searchEmails);
  const inSearchNotResolver = searchUsersRaw
    .filter((u) => !resolverSet.has(u.email.toLowerCase()))
    .map((u) => ({
      email: u.email,
      name: u.name,
      archivedAt: u.archivedAt ? u.archivedAt.toISOString() : null,
      matchedFields: matchedFieldsForUser(u, keyword || ""),
    }));
  const inResolverNotSearch = resolverEmails.filter(
    (e) => !searchSet.has(e.toLowerCase()),
  );

  return NextResponse.json({
    audience: {
      id: audience.id,
      name: audience.name,
      kind: audience.kind,
      filtersJson: audience.filtersJson,
      filtersParsed: specParsed,
    },
    keyword,
    resolverCount: resolverEmails.length,
    resolverEmails: resolverEmails.slice(0, 50),
    resolverError,
    searchCount: searchUsersRaw.length,
    searchUsers: searchUsersRaw.slice(0, 50).map((u) => ({
      email: u.email,
      name: u.name,
      archivedAt: u.archivedAt ? u.archivedAt.toISOString() : null,
      matchedFields: matchedFieldsForUser(u, keyword || ""),
    })),
    searchError,
    diff: {
      inSearchNotResolver,
      inResolverNotSearch,
    },
    archivedCountInSearch: searchUsersRaw.filter((u) => u.archivedAt !== null).length,
    activeCountInSearch: searchUsersRaw.filter((u) => u.archivedAt === null).length,
  });
}
