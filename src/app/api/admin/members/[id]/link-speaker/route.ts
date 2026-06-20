import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PUT /api/admin/members/[id]/link-speaker
 * Body: { speakerId: string | null }
 *
 * Links a platform User to an existing Speaker row by setting
 * `Speaker.userId = id` and `Speaker.contactEmail = user.email`.
 *
 * Pass `speakerId: null` to unlink the user from any speaker.
 *
 * Admin-only.
 */
export async function PUT(
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

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { speakerId } = (await req.json()) as { speakerId: string | null };

  if (speakerId === null) {
    // Unlink: clear userId on any speakers currently linked to this user.
    await db.speaker.updateMany({
      where: { userId: id },
      data: { userId: null },
    });
    return NextResponse.json({ ok: true, linked: null });
  }

  if (typeof speakerId !== "string" || !speakerId.trim()) {
    return NextResponse.json({ error: "speakerId required" }, { status: 400 });
  }

  // Verify the speaker exists
  const speaker = await db.speaker.findUnique({
    where: { id: speakerId },
    select: { id: true, userId: true },
  });
  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  // If this speaker is currently linked to a different user, clear that link
  if (speaker.userId && speaker.userId !== id) {
    await db.speaker.update({
      where: { id: speakerId },
      data: { userId: null },
    });
  }

  await db.speaker.update({
    where: { id: speakerId },
    data: {
      userId: id,
      contactEmail: target.email, // also set contactEmail so the link survives
    },
  });

  return NextResponse.json({
    ok: true,
    linked: { speakerId, userId: id },
  });
}
