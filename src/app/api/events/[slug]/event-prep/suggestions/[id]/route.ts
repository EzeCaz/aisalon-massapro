import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin } from "@/lib/permissions";

/**
 * /api/events/[slug]/event-prep/suggestions/[id]
 *
 * PATCH — Super Admin only. Accept or reject a suggestion.
 *   Body: { action: "accept" | "reject", reviewerNote?: string }
 *
 * On "accept":
 *   - If the suggestion has a questionId (edit to existing question),
 *     apply proposedText to that question (and proposedTag if set).
 *   - If the suggestion has NO questionId (new-question suggestion),
 *     create a new EventPrepQuestion with proposedScope/speakerId/text/tag.
 *   - Mark the suggestion status="ACCEPTED", set reviewedBy + reviewedAt.
 *
 * On "reject":
 *   - Just mark status="REJECTED" with the reviewerNote. Question untouched.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
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

  const { slug, id: suggestionId } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const suggestion = await db.eventPrepSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!suggestion || suggestion.eventId !== event.id) {
    return NextResponse.json({ error: "Suggestion not found in this event" }, { status: 404 });
  }
  if (suggestion.status !== "PENDING") {
    return NextResponse.json({ error: `Suggestion already ${suggestion.status}` }, { status: 409 });
  }

  const body = await req.json();
  const action = body.action as string;
  const reviewerNote = (body.reviewerNote as string | undefined)?.trim() || null;

  if (action === "reject") {
    const updated = await db.eventPrepSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "REJECTED",
        reviewerNote,
        reviewedBy: me.id,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ suggestion: { ...updated, createdAt: updated.createdAt.toISOString(), reviewedAt: updated.reviewedAt?.toISOString() ?? null } });
  }

  if (action === "accept") {
    // Apply the suggestion.
    if (suggestion.questionId) {
      // Edit existing question.
      const data: { text: string; tag?: string | null } = { text: suggestion.proposedText };
      if (suggestion.proposedTag !== null && suggestion.proposedTag !== undefined) {
        data.tag = suggestion.proposedTag;
      }
      await db.eventPrepQuestion.update({
        where: { id: suggestion.questionId },
        data,
      });
    } else {
      // New-question suggestion. Validate scope.
      const scope = suggestion.proposedScope === "GENERIC" ? "GENERIC" : "SPEAKER";
      const speakerId = scope === "SPEAKER" ? (suggestion.proposedSpeakerId ?? null) : null;
      if (scope === "SPEAKER" && !speakerId) {
        return NextResponse.json(
          { error: "Cannot accept new-question suggestion: proposedSpeakerId missing for SPEAKER scope" },
          { status: 400 }
        );
      }
      await db.eventPrepQuestion.create({
        data: {
          eventId: event.id,
          scope,
          speakerId,
          text: suggestion.proposedText,
          tag: suggestion.proposedTag || null,
          order: 0,
        },
      });
    }
    const updated = await db.eventPrepSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "ACCEPTED",
        reviewerNote,
        reviewedBy: me.id,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ suggestion: { ...updated, createdAt: updated.createdAt.toISOString(), reviewedAt: updated.reviewedAt?.toISOString() ?? null } });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
