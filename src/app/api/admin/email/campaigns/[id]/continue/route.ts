import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendCampaignBatch } from "@/lib/email-campaign/sender";

/**
 * POST /api/admin/email/campaigns/[id]/continue
 *
 * Continue sending a campaign that's in SENDING status (i.e. more
 * recipients remain). Used by the admin UI to poll/continue sending
 * in batches when the first batch didn't finish the full list.
 */
export async function POST(
  _req: NextRequest,
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
  if (campaign.status !== "SENDING") {
    return NextResponse.json(
      { error: `Campaign is in ${campaign.status} state, cannot continue` },
      { status: 400 }
    );
  }

  const result = await sendCampaignBatch(id);
  return NextResponse.json({ result });
}
