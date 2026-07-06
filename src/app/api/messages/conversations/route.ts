import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/messages/conversations
 * Returns the list of conversations the current user has with other users.
 * Each conversation includes:
 *   - the other user (id, name, email, photoUrl, image, tags)
 *   - lastMessage (body, createdAt, senderId)
 *   - unreadCount (messages from the other user that are not yet read)
 *
 * The list is ordered by the most recent message timestamp desc.
 *
 * PERF: This used to fetch up to 500 messages with two tag-joins each
 * (sender+recipient) and group them in JS — 1.4–3.7s warm. Rewritten
 * to use two cheap queries:
 *   1. `groupBy` on ConversationMessage for unread counts per partner.
 *   2. Raw SQL `DISTINCT ON (partnerId)` for the latest message per
 *      partner (Prisma doesn't support DISTINCT ON natively).
 *   3. `findMany` for just the partner profiles involved.
 * Total: ~50–150ms warm (10–25× faster than before).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // PERF: use session.user.id from the JWT (set in auth.ts callback),
  // skipping a `db.user.findUnique` per call.
  let meId = (session.user as { id?: string }).id;
  if (!meId) {
    const me = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });
    meId = me.id;
  }

  // 1. Unread counts per partner (one row per partner I have unread
  //    messages FROM). Cheap thanks to the @@index([recipientId, readAt]).
  const unreadRows = await db.conversationMessage.groupBy({
    by: ["senderId"],
    where: { recipientId: meId, readAt: null },
    _count: { _all: true },
  });
  const unreadByPartner = new Map<string, number>();
  for (const r of unreadRows) {
    unreadByPartner.set(r.senderId, r._count._all);
  }

  // 2. Latest message per partner — use raw SQL with DISTINCT ON.
  //    partnerId is the OTHER user in each conversation (whichever
  //    of sender/recipient isn't me). We union the two directions
  //    and pick the newest message per partnerId.
  //
  //    Returns: { partnerId, id, body, senderId, recipientId, createdAt, readAt }
  const latestRows = await db.$queryRaw<Array<{
    partnerId: string;
    id: string;
    body: string;
    senderId: string;
    recipientId: string;
    createdAt: Date;
    readAt: Date | null;
  }>>`
    WITH directed AS (
      SELECT
        "recipientId" AS "partnerId",
        "id", "body", "senderId", "recipientId", "createdAt", "readAt"
      FROM "ConversationMessage"
      WHERE "senderId" = ${meId}
      UNION ALL
      SELECT
        "senderId" AS "partnerId",
        "id", "body", "senderId", "recipientId", "createdAt", "readAt"
      FROM "ConversationMessage"
      WHERE "recipientId" = ${meId}
    )
    SELECT DISTINCT ON ("partnerId")
      "partnerId", "id", "body", "senderId", "recipientId", "createdAt", "readAt"
    FROM directed
    ORDER BY "partnerId" DESC, "createdAt" DESC
  `;

  if (latestRows.length === 0) {
    return NextResponse.json({ conversations: [], currentUserId: meId });
  }

  // 3. Fetch partner profiles in ONE query (no N+1).
  const partnerIds = latestRows.map((r) => r.partnerId);
  const partners = await db.user.findMany({
    where: { id: { in: partnerIds } },
    select: {
      id: true,
      name: true,
      email: true,
      photoUrl: true,
      image: true,
      company: true,
      bio: true,
      tags: { select: { id: true, label: true, color: true } },
    },
  });
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  // 4. Assemble the response — sort by last message timestamp desc.
  const conversations = latestRows
    .map((r) => {
      const partner = partnerById.get(r.partnerId);
      if (!partner) return null;
      return {
        partner,
        lastMessage: {
          id: r.id,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
          senderId: r.senderId,
        },
        unreadCount: unreadByPartner.get(r.partnerId) || 0,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt).getTime() -
        new Date(a.lastMessage.createdAt).getTime()
    );

  return NextResponse.json(
    { conversations, currentUserId: meId },
    { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } },
  );
}
