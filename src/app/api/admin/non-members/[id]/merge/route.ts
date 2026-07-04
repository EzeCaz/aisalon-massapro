import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/admin/non-members/[id]/merge
 *
 * Merge a NonMember into an existing User account. The NonMember's
 * email is added to the User as a secondary email (so the person can
 * sign in with either email), all of the NonMember's event
 * registrations are converted into EventRegistration rows on the User,
 * and the NonMember is marked as `duplicateStatus = "merged"` (kept
 * for audit; the row can be hard-deleted later if the admin wants).
 *
 * Body:
 *   { userId: string }   // the existing User to merge INTO
 *
 * Admin-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: nonMemberId } = await params;
  const body = await req.json().catch(() => ({}));
  const { userId } = body as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "Missing userId in body" }, { status: 400 });
  }

  const nm = await db.nonMember.findUnique({
    where: { id: nonMemberId },
    include: { eventRegistrations: { select: { eventId: true, registeredAt: true, source: true } } },
  });
  if (!nm) {
    return NextResponse.json({ error: "NonMember not found" }, { status: 404 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, secondaryEmails: { select: { email: true } } },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Don't merge if the NonMember's email is already used by another user
  // (as either a primary or secondary email) and it's NOT this user.
  if (nm.email.toLowerCase() !== user.email.toLowerCase()) {
    // Check if the NonMember email is already attached to a DIFFERENT user
    const conflictUser = await db.user.findFirst({
      where: { email: { equals: nm.email, mode: "insensitive" } },
      select: { id: true },
    });
    const conflictSecondary = await db.userEmail.findFirst({
      where: { email: { equals: nm.email, mode: "insensitive" } },
      select: { id: true, userId: true },
    });
    if (conflictUser && conflictUser.id !== user.id) {
      return NextResponse.json({
        error: `Email ${nm.email} is already the primary email of a different user. Cannot merge.`,
      }, { status: 409 });
    }
    if (conflictSecondary && conflictSecondary.userId !== user.id) {
      return NextResponse.json({
        error: `Email ${nm.email} is already attached as a secondary email to a different user. Cannot merge.`,
      }, { status: 409 });
    }
  }

  // Run the merge in a transaction
  const result = await db.$transaction(async (tx) => {
    // 1. Add the NonMember's email as a secondary email on the User
    //    (if it's not already the user's primary email and not already a secondary).
    if (nm.email.toLowerCase() !== user.email.toLowerCase()) {
      const alreadySecondary = user.secondaryEmails.some(
        (se) => se.email.toLowerCase() === nm.email.toLowerCase()
      );
      if (!alreadySecondary) {
        await tx.userEmail.create({
          data: {
            userId: user.id,
            email: nm.email,
            label: `Merged from ${nm.importSource ?? "non-member lead"}`,
          },
        });
      }
    }

    // 2. Convert each NonMemberRegistration into an EventRegistration
    //    for the User. Idempotent — skip if the user is already registered.
    let converted = 0;
    for (const reg of nm.eventRegistrations) {
      const existing = await tx.eventRegistration.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: reg.eventId } },
        select: { id: true },
      });
      if (existing) continue;
      await tx.eventRegistration.create({
        data: {
          userId: user.id,
          eventId: reg.eventId,
          source: "merge",
          importName: nm.name,
          importCompany: nm.company,
          registeredAt: reg.registeredAt,
        },
      });
      converted++;
    }

    // 3. Backfill any null fields on the User from the NonMember
    //    (don't overwrite existing data — only fill gaps).
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: user.name ?? nm.name,
        mobile: (await tx.user.findUnique({ where: { id: user.id }, select: { mobile: true } }))?.mobile ?? nm.mobile,
        company: (await tx.user.findUnique({ where: { id: user.id }, select: { company: true } }))?.company ?? nm.company,
        linkedinUrl: (await tx.user.findUnique({ where: { id: user.id }, select: { linkedinUrl: true } }))?.linkedinUrl ?? nm.linkedinUrl,
        bio: (await tx.user.findUnique({ where: { id: user.id }, select: { bio: true } }))?.bio ?? nm.bio,
      },
    });

    // 4. Mark the NonMember as merged (keep the row for audit; the
    //    admin can hard-delete later via DELETE /api/admin/non-members/[id]).
    await tx.nonMember.update({
      where: { id: nonMemberId },
      data: {
        duplicateStatus: "merged",
        duplicateOfUserId: user.id,
        duplicateReason: `Merged into ${user.email} on ${new Date().toISOString()}`,
      },
    });

    return { converted };
  });

  return NextResponse.json({
    ok: true,
    nonMemberId,
    userId: user.id,
    userEmail: user.email,
    convertedRegistrations: result.converted,
  });
}
