import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/admin/speakers/[id]/link-agenda
 *
 * Link a Speaker to an agenda item (a.k.a. a "session") on the SAME
 * event as the speaker. The agenda item's `speakerId` is set to this
 * speaker. If the agenda item was previously linked to a different
 * speaker, that link is replaced.
 *
 * Body: { agendaItemId: string }
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

  const { id } = await params;
  const speaker = await db.speaker.findUnique({
    where: { id },
    select: { id: true, eventId: true, name: true },
  });
  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  const body = await req.json();
  const { agendaItemId } = body as { agendaItemId?: string };
  if (!agendaItemId) {
    return NextResponse.json({ error: "agendaItemId is required" }, { status: 400 });
  }

  // Verify the agenda item belongs to the same event.
  const item = await db.eventAgendaItem.findUnique({
    where: { id: agendaItemId },
    select: { id: true, eventId: true, title: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
  }
  if (item.eventId !== speaker.eventId) {
    return NextResponse.json(
      {
        error:
          "Agenda item belongs to a different event. Clone the speaker to that event first.",
      },
      { status: 400 }
    );
  }

  const updated = await db.eventAgendaItem.update({
    where: { id: agendaItemId },
    data: { speakerId: speaker.id },
    select: {
      id: true,
      title: true,
      type: true,
      startsAt: true,
      endsAt: true,
      speaker: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ agendaItem: updated });
}
