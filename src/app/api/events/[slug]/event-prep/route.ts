import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isEventCoHost, isSuperAdmin, ROLES, normalizeRole } from "@/lib/permissions";

/**
 * /api/events/[slug]/event-prep
 *
 * GET  — list all prep questions (generic + per-speaker) for the event,
 *        PLUS all suggestions (pending + accepted + rejected). Visible to
 *        Super Admin, Admin, and Co-hosts of this event.
 * PUT  — Super Admin only. Replace the entire question set for the event
 *        (or for one speaker). Body shape:
 *          { mode: "replaceAll", questions: [{scope, speakerId, text, tag}] }
 *          { mode: "replaceOne", questionId, text, tag }
 *          { mode: "create", scope, speakerId, text, tag }
 *          { mode: "delete", questionId }
 * POST — Super Admin OR Co-host/Admin. Create a SUGGESTION (not a direct
 *        edit). Body: { questionId?, proposedText, proposedScope?,
 *        proposedSpeakerId?, proposedTag? }. Used by Admins/Co-hosts to
 *        suggest changes; Super Admin can also use this flow but typically
 *        uses PUT to edit directly.
 */

async function authorize(meId: string, meRole: string, meEmail: string | null, eventId: string) {
  // Super Admin or Admin (events.edit) → always allowed.
  if (can(meRole, "events.edit") || isSuperAdmin({ email: meEmail, role: meRole })) {
    return true;
  }
  // Co-host of this event → allowed.
  if (normalizeRole(meRole) === ROLES.CO_HOST) {
    return await isEventCoHost(meId, eventId);
  }
  return false;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const authorized = await authorize(me.id, me.role, me.email, event.id);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden — Super Admin, Admin, or Co-host of this event only" }, { status: 403 });
  }

  const [questions, suggestions] = await Promise.all([
    db.eventPrepQuestion.findMany({
      where: { eventId: event.id },
      orderBy: [{ scope: "asc" }, { speakerId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      include: {
        speaker: { select: { id: true, name: true, role: true, company: true, photoUrl: true } },
        suggestions: {
          include: {
            suggestedByUser: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    db.eventPrepSuggestion.findMany({
      where: { eventId: event.id },
      include: {
        question: { select: { id: true, text: true, scope: true, speakerId: true } },
        suggestedByUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    event: { id: event.id, title: event.title },
    me: { id: me.id, name: me.name, email: me.email, role: me.role, isSuperAdmin: isSuperAdmin({ email: me.email, role: me.role }) },
    questions: questions.map((q) => ({
      ...q,
      speaker: q.speaker ? { ...q.speaker } : null,
      suggestions: q.suggestions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
      })),
    })),
    suggestions: suggestions.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
    })),
  });
}

/** Super Admin only — directly mutate the question set. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 });
  }

  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const mode = body.mode as string;

  if (mode === "create") {
    const { scope, speakerId, text, tag } = body as {
      scope: string;
      speakerId?: string | null;
      text: string;
      tag?: string | null;
    };
    if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
    if (scope !== "GENERIC" && scope !== "SPEAKER") {
      return NextResponse.json({ error: "scope must be GENERIC or SPEAKER" }, { status: 400 });
    }
    const q = await db.eventPrepQuestion.create({
      data: {
        eventId: event.id,
        scope,
        speakerId: scope === "SPEAKER" ? (speakerId ?? null) : null,
        text: text.trim(),
        tag: tag?.trim() || null,
        order: body.order ?? 0,
      },
    });
    return NextResponse.json({ question: q });
  }

  if (mode === "replaceOne") {
    const { questionId, text, tag } = body as { questionId: string; text: string; tag?: string | null };
    if (!questionId || !text?.trim()) {
      return NextResponse.json({ error: "questionId + text required" }, { status: 400 });
    }
    const q = await db.eventPrepQuestion.update({
      where: { id: questionId },
      data: { text: text.trim(), tag: tag?.trim() || null },
    });
    return NextResponse.json({ question: q });
  }

  if (mode === "delete") {
    const { questionId } = body as { questionId: string };
    if (!questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });
    await db.eventPrepQuestion.delete({ where: { id: questionId } });
    return NextResponse.json({ ok: true });
  }

  if (mode === "reorder") {
    const { orderedIds } = body as { orderedIds: string[] };
    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: "orderedIds array required" }, { status: 400 });
    }
    await db.$transaction(
      orderedIds.map((id, i) =>
        db.eventPrepQuestion.update({ where: { id }, data: { order: i } })
      )
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
}

/** Super Admin, Admin, or Co-host — create a SUGGESTION (not a direct edit). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const authorized = await authorize(me.id, me.role, me.email, event.id);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden — Super Admin, Admin, or Co-host of this event only" }, { status: 403 });
  }

  const body = await req.json();
  const { questionId, proposedText, proposedScope, proposedSpeakerId, proposedTag } = body as {
    questionId?: string | null;
    proposedText: string;
    proposedScope?: string | null;
    proposedSpeakerId?: string | null;
    proposedTag?: string | null;
  };

  if (!proposedText?.trim()) {
    return NextResponse.json({ error: "proposedText required" }, { status: 400 });
  }

  // If questionId is provided, validate it belongs to this event.
  if (questionId) {
    const q = await db.eventPrepQuestion.findUnique({
      where: { id: questionId },
      select: { eventId: true },
    });
    if (!q || q.eventId !== event.id) {
      return NextResponse.json({ error: "question not found in this event" }, { status: 404 });
    }
  }

  const suggestion = await db.eventPrepSuggestion.create({
    data: {
      eventId: event.id,
      questionId: questionId ?? null,
      proposedScope: proposedScope ?? null,
      proposedSpeakerId: proposedSpeakerId ?? null,
      proposedText: proposedText.trim(),
      proposedTag: proposedTag?.trim() || null,
      suggestedBy: me.name || me.email,
      suggestedByUserId: me.id,
      status: "PENDING",
    },
    include: {
      suggestedByUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    suggestion: {
      ...suggestion,
      createdAt: suggestion.createdAt.toISOString(),
      reviewedAt: null,
    },
  });
}
