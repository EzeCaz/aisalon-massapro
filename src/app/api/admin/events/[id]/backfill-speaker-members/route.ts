import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEventSpeakersEdit, isError } from "@/lib/auth-guards";

/**
 * POST /api/admin/events/[id]/backfill-speaker-members
 *
 * PRODUCT OWNER DIRECTIVE: "if there is currently a speaker that is not
 * a member, make it a member and link it to the speaker profile."
 *
 * For every Speaker on this event that has a contactEmail but no userId:
 *   1. Find a User with that email.
 *   2. If found → link (set Speaker.userId).
 *   3. If not found → create a new MEMBER User with that email + the
 *      speaker's name/company/bio/photoUrl, then link.
 *
 * Returns: { linked, created, skipped, total }
 *   - linked:   count of Speakers linked to an existing User
 *   - created:  count of new MEMBER Users created
 *   - skipped:  count of Speakers skipped (no contactEmail, or already linked)
 *   - total:    total Speakers scanned
 *
 * Permission: ADMIN+ or CO_HOST of this event.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;

  const me = await requireEventSpeakersEdit(eventId);
  if (isError(me)) return me;

  const speakers = await db.speaker.findMany({
    where: { eventId },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      userId: true,
      role: true,
      company: true,
      bio: true,
      topic: true,
      photoUrl: true,
    },
  });

  let linked = 0;
  let created = 0;
  let skipped = 0;

  for (const s of speakers) {
    if (s.userId) {
      skipped++;
      continue;
    }
    if (!s.contactEmail) {
      skipped++;
      continue;
    }

    const email = s.contactEmail.trim().toLowerCase();
    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    let userId: string;
    if (existing) {
      userId = existing.id;
      linked++;
    } else {
      try {
        const created2 = await db.user.create({
          data: {
            email,
            name: s.name,
            company: s.company,
            bio: s.bio,
            photoUrl: s.photoUrl,
            role: "MEMBER",
          },
          select: { id: true },
        });
        userId = created2.id;
        created++;
      } catch (err) {
        // Race: another request created the user. Refetch.
        const retry = await db.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (retry) {
          userId = retry.id;
          linked++;
        } else {
          console.error("[backfill] could not create+link user for", email, err);
          skipped++;
          continue;
        }
      }
    }

    await db.speaker.update({
      where: { id: s.id },
      data: { userId },
    });
  }

  return NextResponse.json({
    linked,
    created,
    skipped,
    total: speakers.length,
  });
}
