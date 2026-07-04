import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { materializeRecipients } from "@/lib/email-campaign/sender";

/**
 * POST /api/admin/email/campaigns/[id]/schedule
 *   Body: { scheduledAt: ISO string }
 *   Sets status = SCHEDULED. Cron picks it up.
 *
 * DELETE /api/admin/email/campaigns/[id]/schedule
 *   Cancels a scheduled campaign (reverts to DRAFT).
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

  const { id } = await params;
  const body = await req.json();
  const { scheduledAt } = body as { scheduledAt?: string };

  if (!scheduledAt) {
    return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 });
  }

  const when = new Date(scheduledAt);
  if (isNaN(when.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
  }
  if (when.getTime() < Date.now()) {
    return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
  }

  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Campaign is in ${campaign.status} state, cannot schedule` },
      { status: 400 }
    );
  }

  const recipientCount = await materializeRecipients(id);
  const updated = await db.emailCampaign.update({
    where: { id },
    data: { status: "SCHEDULED", scheduledAt: when },
  });

  return NextResponse.json({ campaign: updated, recipientCount });
}

export async function DELETE(
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
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "SCHEDULED") {
    return NextResponse.json(
      { error: `Campaign is in ${campaign.status} state, cannot cancel` },
      { status: 400 }
    );
  }

  const updated = await db.emailCampaign.update({
    where: { id },
    data: { status: "DRAFT", scheduledAt: null },
  });

  return NextResponse.json({ campaign: updated });
}
