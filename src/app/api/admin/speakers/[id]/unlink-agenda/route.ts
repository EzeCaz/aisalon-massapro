import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/admin/speakers/[id]/unlink-agenda
 *
 * Unlink a Speaker from an agenda item. The agenda item's `speakerId`
 * is set to NULL. The speaker itself is preserved.
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
    select: { id: true },
  });
  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  const body = await req.json();
  const { agendaItemId } = body as { agendaItemId?: string };
  if (!agendaItemId) {
    return NextResponse.json({ error: "agendaItemId is required" }, { status: 400 });
  }

  const item = await db.eventAgendaItem.findUnique({
    where: { id: agendaItemId },
    select: { id: true, speakerId: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
  }
  if (item.speakerId !== speaker.id) {
    return NextResponse.json(
      { error: "Agenda item is not linked to this speaker" },
      { status: 400 }
    );
  }

  await db.eventAgendaItem.update({
    where: { id: agendaItemId },
    data: { speakerId: null },
  });

  return NextResponse.json({ ok: true });
}
