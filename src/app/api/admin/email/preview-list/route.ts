import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { previewRecipientList, type ListSource } from "@/lib/email-campaign/list-builder";

/**
 * POST /api/admin/email/preview-list
 *
 * Returns the count + sample of recipients that a given list source +
 * config would produce. Used by the admin composer wizard.
 *
 * Body:
 *   {
 *     source: "all_members" | "non_members" | "event_rsvp" | "manual_upload" | "specific_users",
 *     config: { eventId?, rsvpStatuses?, emails?, externalEmails?, userIds?, tags?, appliedFor? },
 *     sampleSize?: number  // default 10, max 50
 *   }
 *
 * Returns:
 *   { total: number, sample: [{ email, name, userId }] }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { source, config, sampleSize } = body as {
    source: ListSource;
    config: any;
    sampleSize?: number;
  };

  if (!source || !config) {
    return NextResponse.json(
      { error: "source and config are required" },
      { status: 400 }
    );
  }

  const validSources: ListSource[] = [
    "all_members",
    "non_members",
    "event_rsvp",
    "manual_upload",
    "specific_users",
  ];
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const size = Math.min(sampleSize ?? 10, 50);
  const result = await previewRecipientList(source, config, size);
  return NextResponse.json(result);
}
