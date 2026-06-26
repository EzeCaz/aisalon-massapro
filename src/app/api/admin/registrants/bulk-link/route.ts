import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/registrants/bulk-link
 *
 * Link multiple RSVPs to platform users in one transaction.
 * Used by the "Look for members" bulk action — the admin reviews
 * suggested matches, then clicks "Apply" to link them all at once.
 *
 * Body: { links: Array<{ rsvpId: string, userId: string }> }
 *
 * Response: {
 *   linked: number,
 *   errors: Array<{ rsvpId: string, reason: string }>
 * }
 *
 * Permission: members.view (same as the rest of the admin endpoints).
 * Each link is validated:
 *   - RSVP must exist
 *   - User must exist
 *   - If the RSVP is already linked to the same user, skip (idempotent)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    links?: Array<{ rsvpId: string; userId: string }>;
  };
  const links = Array.isArray(body.links) ? body.links : [];
  if (links.length === 0) {
    return NextResponse.json(
      { error: "Missing `links` array (or empty)." },
      { status: 400 }
    );
  }
  if (links.length > 500) {
    return NextResponse.json(
      { error: "Too many links in one request (max 500). Split into smaller batches." },
      { status: 400 }
    );
  }

  // Validate all rsvpIds + userIds exist in one query each (faster than
  // per-row lookups).
  const rsvpIds = Array.from(new Set(links.map((l) => l.rsvpId)));
  const userIds = Array.from(new Set(links.map((l) => l.userId)));

  const [rsvps, users] = await Promise.all([
    db.eventRsvp.findMany({
      where: { id: { in: rsvpIds } },
      select: { id: true, userId: true },
    }),
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    }),
  ]);
  const rsvpById = new Map(rsvps.map((r) => [r.id, r]));
  const userById = new Set(users.map((u) => u.id));

  const errors: Array<{ rsvpId: string; reason: string }> = [];
  const toLink: Array<{ rsvpId: string; userId: string }> = [];

  for (const link of links) {
    const rsvp = rsvpById.get(link.rsvpId);
    if (!rsvp) {
      errors.push({ rsvpId: link.rsvpId, reason: "RSVP not found" });
      continue;
    }
    if (!userById.has(link.userId)) {
      errors.push({ rsvpId: link.rsvpId, reason: "User not found" });
      continue;
    }
    // Skip if already linked to the same user (idempotent)
    if (rsvp.userId === link.userId) continue;
    toLink.push(link);
  }

  // Apply all links in a single transaction
  let linked = 0;
  if (toLink.length > 0) {
    const result = await db.$transaction(
      toLink.map((l) =>
        db.eventRsvp.update({
          where: { id: l.rsvpId },
          data: { userId: l.userId },
          select: { id: true },
        })
      )
    );
    linked = result.length;
  }

  return NextResponse.json({
    linked,
    skipped: links.length - toLink.length - errors.length,
    errors,
  });
}
