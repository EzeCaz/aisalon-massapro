/**
 * GET /api/email-audiences/[id]/emails — resolve an audience to its current
 *   list of emails. For STATIC audiences, parses emailsJson. For DYNAMIC
 *   audiences, evaluates the filter spec against the current DB state
 *   (so new users/RSVPs that match are picked up automatically).
 *
 * Returns: { emails: string[], count: number }
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseSpec, resolveAudienceEmails } from "@/lib/email-orchestrator/audience-filter";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const audience = await db.emailAudience.findUnique({
    where: { id },
    select: { kind: true, emailsJson: true, filtersJson: true },
  });
  if (!audience) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (audience.kind === "STATIC") {
    try {
      const arr = JSON.parse(audience.emailsJson);
      const emails = Array.isArray(arr)
        ? arr.filter((e) => typeof e === "string").map((e: string) => e.toLowerCase())
        : [];
      return NextResponse.json({ emails, count: emails.length });
    } catch {
      return NextResponse.json({ emails: [], count: 0 });
    }
  }

  // DYNAMIC — evaluate the filter spec
  const spec = parseSpec(audience.filtersJson);
  if (!spec) {
    return NextResponse.json({ error: "invalid filter spec" }, { status: 500 });
  }
  try {
    const emails = await resolveAudienceEmails(spec);
    return NextResponse.json({ emails, count: emails.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
