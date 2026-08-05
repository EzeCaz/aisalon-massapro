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
    const excludedCount = baseEmails.length - finalEmails.length;

    if (!body.includeUserDetails) {
      return NextResponse.json({
        emails: finalEmails,
        count: finalEmails.length,
        baseCount: baseEmails.length,
        excludedCount,
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

    // Also fetch the EXCLUDED users' details so the UI can show them as
    // "deselected" rows (with a checkbox to re-include them).
    const excludedEmails = baseEmails.filter(
      (e) => !finalEmails.includes(e),
    );
    const excludedUsers = excludedEmails.length === 0
      ? []
      : await db.user.findMany({
          where: { email: { in: excludedEmails } },
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
      baseCount: baseEmails.length,
      excludedCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
