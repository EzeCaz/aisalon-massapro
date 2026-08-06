/**
 * POST /api/email-audiences/preview — evaluate a filter spec (no persistence).
 * Body: { filters: AudienceFilterSpec, includeUserDetails?: boolean }
 * Returns:
 *   {
 *     emails: string[],
 *     count: number,
 *     users?: Array<{          // only when includeUserDetails=true
 *       email: string,
 *       name: string | null,
 *       company: string | null,
 *       title: string | null,
 *       interestedIn: string | null,
 *       profileCategories: string | null,
 *       appliedFor: string | null,
 *       bio: string | null,
 *       archivedAt: string | null,
 *     }>
 *   }
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 *
 * The `users` array is ordered the same way as `emails` (alphabetical).
 * For emails that don't have a matching User row (e.g. RSVP-only emails
 * with no account), the entry is omitted from `users` — `emails` is the
 * source of truth for the count.
 *
 * When `includeUserDetails=true` AND `filters.excludedEmails` is set,
 * the response also includes `excludedCount` (how many were excluded)
 * so the UI can display "N matched, M excluded, K will receive".
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  resolveAudienceEmails,
  resolveAudienceBaseEmails,
  resolveExcludeRuleEmails,
  type AudienceFilterSpec,
} from "@/lib/email-orchestrator/audience-filter";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    filters?: AudienceFilterSpec;
    includeUserDetails?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.filters || !body.filters.groups || body.filters.groups.length === 0) {
    return NextResponse.json({
      emails: [],
      count: 0,
      users: body.includeUserDetails ? [] : undefined,
      baseCount: 0,
      excludedCount: 0,
    });
  }

  try {
    // Resolve the FULL set (BEFORE exclusions) and the final set (AFTER
    // exclusions) so the UI can show "N matched, M excluded, K will
    // receive" without re-running the resolver.
    const baseEmails = await resolveAudienceBaseEmails(body.filters);
    const finalEmails = await resolveAudienceEmails(body.filters);

    // Resolve rule-based exclusions (excludeGroups) separately so the UI
    // can distinguish "excluded by rule" from "excluded manually (per-user
    // checkbox)". Rule-excluded emails are those matched by excludeGroups
    // AND also in the base set (so we don't show users who wouldn't have
    // been included anyway).
    const ruleExcludeSet = await resolveExcludeRuleEmails(body.filters);
    const ruleExcludedEmails = baseEmails.filter((e) => ruleExcludeSet.has(e));
    const ruleExcludedCount = ruleExcludedEmails.length;

    // Manually-excluded count = total excluded - rule-excluded
    const totalExcludedCount = baseEmails.length - finalEmails.length;
    const manualExcludedCount = Math.max(0, totalExcludedCount - ruleExcludedCount);

    if (!body.includeUserDetails) {
      return NextResponse.json({
        emails: finalEmails,
        count: finalEmails.length,
        baseCount: baseEmails.length,
        excludedCount: totalExcludedCount,
        ruleExcludedCount,
        manualExcludedCount,
      });
    }

    // Fetch user details for each email (left join — some emails may be
    // RSVP-only with no User row, in which case they're omitted from
    // `users` but still counted in `count`).
    const users = finalEmails.length === 0
      ? []
      : await db.user.findMany({
          where: { email: { in: finalEmails } },
          select: {
            email: true,
            name: true,
            company: true,
            title: true,
            interestedIn: true,
            profileCategories: true,
            appliedFor: true,
            bio: true,
            archivedAt: true,
          },
        });

    // Fetch the MANUALLY-excluded users' details (per-user checkbox
    // exclusions from the live match preview). These show with a checkbox
    // so the admin can re-include them.
    const manuallyExcludedEmails = body.filters.excludedEmails
      ? body.filters.excludedEmails.filter((e) => baseEmails.includes(e.toLowerCase()))
      : [];
    const excludedUsers = manuallyExcludedEmails.length === 0
      ? []
      : await db.user.findMany({
          where: { email: { in: manuallyExcludedEmails } },
          select: {
            email: true,
            name: true,
            company: true,
            title: true,
            interestedIn: true,
            profileCategories: true,
            appliedFor: true,
            bio: true,
            archivedAt: true,
          },
        });

    // Fetch the RULE-excluded users' details (matched by excludeGroups).
    // These show WITHOUT a checkbox — they're excluded by rule, not by
    // manual selection. To re-include them, the admin must remove the
    // exclude rule.
    const ruleExcludedUsers = ruleExcludedEmails.length === 0
      ? []
      : await db.user.findMany({
          where: { email: { in: ruleExcludedEmails } },
          select: {
            email: true,
            name: true,
            company: true,
            title: true,
            interestedIn: true,
            profileCategories: true,
            appliedFor: true,
            bio: true,
            archivedAt: true,
          },
        });

    return NextResponse.json({
      emails: finalEmails,
      count: finalEmails.length,
      users,
      excludedUsers,
      ruleExcludedUsers,
      baseCount: baseEmails.length,
      excludedCount: totalExcludedCount,
      ruleExcludedCount,
      manualExcludedCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
