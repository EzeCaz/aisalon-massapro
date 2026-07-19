// ============================================================================
// src/lib/relay-recipients.ts
// ============================================================================
// V7 helper: resolves who should receive "relay" copies of member-to-speaker
// and member-to-member messages.
//
// CONFIRMED DECISION (Q6, see core/v7/plan.md §8):
//   1. Try to relay to all Chapter Organizers of the event's chapter.
//   2. Fallback: if the chapter has zero organizers, relay to ADMIN_EMAIL
//      (status quo V6 behavior) so no message is silently lost.
//
// STATUS: Draft. Not yet wired into the speaker-message or DM relay code paths.
// When V7 implementation lands, replace the inline `adminEmail = process.env.ADMIN_EMAIL`
// pattern in:
//   - src/app/api/speakers/[id]/messages/route.ts
//   - src/app/api/messages/[userId]/route.ts
// with a call to getRelayRecipientsForEvent(eventId).
// ============================================================================

import { db } from "@/lib/db";

/**
 * Returns the email addresses that should receive a relay copy of a
 * member-to-speaker or member-to-member message tied to a specific event.
 *
 * Resolution:
 *   1. Look up the event's chapter.
 *   2. Find all users with role="CHAPTER_ORGANIZER" where chapterId = event.chapterId.
 *   3. If at least one organizer exists, return their emails.
 *   4. Otherwise, fall back to [ADMIN_EMAIL] (defaults to "eze@massapro.com").
 *
 * @param eventId  The event the message relates to (e.g. the speaker's event)
 * @returns Array of email addresses to CC on the relay
 */
export async function getRelayRecipientsForEvent(
  eventId: string
): Promise<string[]> {
  // Load the event with its chapter
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      chapterId: true,
      chapter: { select: { id: true, name: true } },
    },
  });

  if (event?.chapterId) {
    // Find all Chapter Organizers of this chapter
    const organizers = await db.user.findMany({
      where: {
        role: "CHAPTER_ORGANIZER",
        chapterId: event.chapterId,
        archivedAt: null,
      },
      select: { email: true },
    });

    if (organizers.length > 0) {
      return organizers.map((u) => u.email);
    }
    // No organizers — fall through to fallback below
    console.warn(
      `[relay-recipients] Event ${eventId} (chapter "${event.chapter?.name}") ` +
      `has no Chapter Organizers — falling back to ADMIN_EMAIL.`
    );
  } else {
    console.warn(
      `[relay-recipients] Event ${eventId} has no chapterId — falling back to ADMIN_EMAIL.`
    );
  }

  // Fallback: global ADMIN_EMAIL (V6 behavior)
  const adminEmail = (process.env.ADMIN_EMAIL || "eze@massapro.com").toLowerCase();
  return [adminEmail];
}

/**
 * Variant for member-to-member DMs that aren't tied to a specific event.
 * In V7, the relay goes to the chapter organizers of the SENDER's chapter
 * (since the DM is initiated from within a chapter context).
 *
 * If the sender has no chapterId (e.g. a member who hasn't RSVP'd yet),
 * falls back to ADMIN_EMAIL.
 *
 * @param senderId  The User.id of the DM sender
 * @returns Array of email addresses to CC on the relay
 */
export async function getRelayRecipientsForDM(
  senderId: string
): Promise<string[]> {
  const sender = await db.user.findUnique({
    where: { id: senderId },
    select: { chapterId: true },
  });

  if (sender?.chapterId) {
    const organizers = await db.user.findMany({
      where: {
        role: "CHAPTER_ORGANIZER",
        chapterId: sender.chapterId,
        archivedAt: null,
      },
      select: { email: true },
    });

    if (organizers.length > 0) {
      return organizers.map((u) => u.email);
    }
    console.warn(
      `[relay-recipients] DM sender ${senderId}'s chapter has no organizers — falling back to ADMIN_EMAIL.`
    );
  } else {
    console.warn(
      `[relay-recipients] DM sender ${senderId} has no chapterId — falling back to ADMIN_EMAIL.`
    );
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "eze@massapro.com").toLowerCase();
  return [adminEmail];
}
