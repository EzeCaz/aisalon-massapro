import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { MEMBER_TAG_CATALOG } from "@/lib/tags";

/**
 * POST /api/admin/members/merge
 * Body: {
 *   primaryId: string,             // the user to KEEP
 *   secondaryIds: string[],        // users to merge INTO primary (will be DELETED)
 *   confirmNameMismatch?: boolean  // must be true if any pair of names isn't similar
 * }
 *
 * MERGE SEMANTICS — "combine, don't erase":
 *
 *   - bio: concatenate primary's bio + each secondary's bio (with header)
 *   - interestedIn: union of all comma-separated values
 *   - profileCategories: union of all comma-separated values
 *   - appliedFor: union of all values, joined with " / "
 *   - invitedToSpeak: "Yes" if ANY user has "Yes"
 *   - importSource: pipe-joined if different across users
 *   - importedAt: earliest non-null
 *   - createdAt: earliest (handled by keeping primary — see below)
 *   - role: "ADMIN" if ANY user is admin, else "MEMBER"
 *   - tags: union by label (no duplicates)
 *   - name, image, photoUrl, linkedinUrl, company, companyUrl, portfolioUrl,
 *     passwordHash, mobile: prefer primary's non-null, else first non-null
 *     (these are single-value fields — can't truly combine)
 *   - email: ALWAYS primary's (it's the unique identifier)
 *
 * RELATIONS REASSIGNED (cascade-safe):
 *
 *   - Speaker.userId         → primary (or null if primary already has a
 *                              speaker on the same event — orphan, don't delete)
 *   - EventImage.uploaderId  → primary (cascade would DELETE images otherwise!)
 *   - PresentationFile.uploaderId → primary (same reason)
 *   - SpeakerMessage.fromUserId → primary
 *   - ConversationMessage.senderId    → primary
 *   - ConversationMessage.recipientId → primary
 *     (Messages where BOTH sender and recipient are in the merge set are
 *      DELETED first — they'd become self-messages otherwise.)
 *
 * NAME SIMILARITY CHECK:
 *
 *   Before merging, the server checks all name pairs for similarity
 *   (shared first name, shared token, or one is a substring of the other).
 *   If ANY pair isn't similar AND confirmNameMismatch !== true, returns
 *   409 with `nameMismatch: true` and the list of mismatched pairs so
 *   the client can show a confirmation prompt.
 *
 * Admin-only. The admin performing the merge cannot be in secondaryIds
 * (would delete their own account).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    primaryId?: string;
    secondaryIds?: string[];
    confirmNameMismatch?: boolean;
  };

  const primaryId = body.primaryId;
  const secondaryIds = Array.isArray(body.secondaryIds) ? body.secondaryIds : [];

  if (!primaryId || secondaryIds.length === 0) {
    return NextResponse.json(
      { error: "primaryId and at least one secondaryId are required" },
      { status: 400 }
    );
  }
  if (secondaryIds.includes(primaryId)) {
    return NextResponse.json(
      { error: "primaryId must not appear in secondaryIds" },
      { status: 400 }
    );
  }
  // Don't let the admin delete themselves
  if (secondaryIds.includes(me.id)) {
    return NextResponse.json(
      { error: "You cannot merge yourself into another account. Remove yourself from the selection or pick yourself as the primary." },
      { status: 400 }
    );
  }

  const allIds = [primaryId, ...secondaryIds];

  // Fetch all users with relations we need to reassign
  const users = await db.user.findMany({
    where: { id: { in: allIds } },
    include: {
      tags: true,
      speakers: { select: { id: true, eventId: true, name: true, topic: true } },
    },
  });

  if (users.length !== allIds.length) {
    const foundIds = new Set(users.map((u) => u.id));
    const missing = allIds.filter((id) => !foundIds.has(id));
    return NextResponse.json(
      { error: `Users not found: ${missing.join(", ")}` },
      { status: 404 }
    );
  }

  const primary = users.find((u) => u.id === primaryId)!;
  const secondaries = users.filter((u) => u.id !== primaryId);
  const allUsers = [primary, ...secondaries];

  // --- Name similarity check --------------------------------------------
  const nameCheck = checkNamesSimilar(allUsers);
  if (!nameCheck.similar && !body.confirmNameMismatch) {
    return NextResponse.json(
      {
        error: "Name mismatch detected. The selected names don't appear to belong to the same person. Pass confirmNameMismatch=true to override.",
        nameMismatch: true,
        mismatchedPairs: nameCheck.mismatchedPairs,
      },
      { status: 409 }
    );
  }

  // --- Compute merged field values --------------------------------------
  // Tags: union by label (skip ones primary already has)
  const primaryTagLabels = new Set(primary.tags.map((t) => t.label));
  const tagsToAdd: { label: string; color: string }[] = [];
  const seenLabels = new Set(primaryTagLabels);
  for (const u of secondaries) {
    for (const t of u.tags) {
      if (!seenLabels.has(t.label)) {
        seenLabels.add(t.label);
        const color =
          MEMBER_TAG_CATALOG.find((c) => c.label === t.label)?.color ||
          t.color ||
          "#52525B";
        tagsToAdd.push({ label: t.label, color });
      }
    }
  }

  // Bio: concatenate (primary's first, then each secondary's with header)
  const secondaryBios = secondaries.filter(
    (u) => u.bio && u.bio.trim() && u.bio !== primary.bio
  );
  let mergedBio = primary.bio || "";
  if (secondaryBios.length > 0) {
    const parts: string[] = [];
    if (primary.bio && primary.bio.trim()) parts.push(primary.bio);
    for (const u of secondaryBios) {
      parts.push(
        `— Merged from ${u.name || u.email} (${u.email}) —\n${u.bio!.trim()}`
      );
    }
    mergedBio = parts.join("\n\n");
  }

  // Comma-separated fields: union
  const combineCsv = (field: "interestedIn" | "profileCategories") => {
    const set = new Set<string>();
    for (const u of allUsers) {
      const v = u[field];
      if (!v) continue;
      for (const item of v.split(",").map((s) => s.trim()).filter(Boolean)) {
        set.add(item);
      }
    }
    return set.size > 0 ? Array.from(set).join(", ") : null;
  };
  const mergedInterestedIn = combineCsv("interestedIn");
  const mergedProfileCategories = combineCsv("profileCategories");

  // appliedFor: union joined with " / "
  const appliedForSet = new Set<string>();
  for (const u of allUsers) {
    if (!u.appliedFor) continue;
    for (const v of u.appliedFor.split(/[/,]/).map((s) => s.trim()).filter(Boolean)) {
      appliedForSet.add(v);
    }
  }
  const mergedAppliedFor =
    appliedForSet.size > 0 ? Array.from(appliedForSet).join(" / ") : null;

  // invitedToSpeak: "Yes" if any
  const mergedInvitedToSpeak = allUsers.some((u) => u.invitedToSpeak === "Yes")
    ? "Yes"
    : primary.invitedToSpeak || null;

  // importSource: pipe-join if different
  const importSources = new Set(
    allUsers.map((u) => u.importSource).filter(Boolean) as string[]
  );
  const mergedImportSource =
    importSources.size > 0 ? Array.from(importSources).join(" | ") : null;

  // importedAt: earliest non-null
  const importedAts = allUsers
    .map((u) => u.importedAt)
    .filter(Boolean) as Date[];
  const mergedImportedAt =
    importedAts.length > 0
      ? importedAts.sort((a, b) => a.getTime() - b.getTime())[0]
      : null;

  // role: pick the highest-privilege role among the merged users.
  // SUPER_ADMIN is preserved (since it's tied to a hard-coded email,
  // the primary email will inherit it on next sign-in anyway).
  // Then ADMIN > CO_HOST > MEMBER.
  const roleRank: Record<string, number> = {
    SUPER_ADMIN: 4,
    ADMIN: 3,
    CO_HOST: 2,
    MEMBER: 1,
  };
  const mergedRole =
    allUsers
      .map((u) => u.role)
      .sort((a, b) => (roleRank[b] || 0) - (roleRank[a] || 0))[0] || "MEMBER";

  // Single-value fields: prefer primary's non-null, else first non-null
  const pickFirst = (field: keyof typeof primary): string | null => {
    for (const u of allUsers) {
      const v = u[field] as string | null;
      if (v !== null && v !== undefined && (typeof v !== "string" || v.trim())) {
        return v;
      }
    }
    return null;
  };

  // --- Run the merge in a single transaction ----------------------------
  const result = await db.$transaction(async (tx) => {
    // 1. Delete ConversationMessages where BOTH sender AND recipient are
    //    in the merge set — these would become self-messages.
    await tx.conversationMessage.deleteMany({
      where: {
        AND: [
          { senderId: { in: allIds } },
          { recipientId: { in: allIds } },
        ],
      },
    });

    // 2. Reassign remaining ConversationMessage.senderId → primary
    await tx.conversationMessage.updateMany({
      where: { senderId: { in: secondaryIds } },
      data: { senderId: primaryId },
    });

    // 3. Reassign remaining ConversationMessage.recipientId → primary
    await tx.conversationMessage.updateMany({
      where: { recipientId: { in: secondaryIds } },
      data: { recipientId: primaryId },
    });

    // 4. Reassign SpeakerMessage.fromUserId → primary
    await tx.speakerMessage.updateMany({
      where: { fromUserId: { in: secondaryIds } },
      data: { fromUserId: primaryId },
    });

    // 5. Reassign EventImage.uploaderId → primary
    //    (CRITICAL: cascade would DELETE images otherwise)
    await tx.eventImage.updateMany({
      where: { uploaderId: { in: secondaryIds } },
      data: { uploaderId: primaryId },
    });

    // 6. Reassign PresentationFile.uploaderId → primary
    //    (CRITICAL: cascade would DELETE presentations otherwise)
    await tx.presentationFile.updateMany({
      where: { uploaderId: { in: secondaryIds } },
      data: { uploaderId: primaryId },
    });

    // 7. Reassign Speaker.userId → primary (or orphan if primary already
    //    has a speaker on the same event — don't delete, just unlink)
    const primarySpeakerEventIds = new Set(
      primary.speakers.map((s) => s.eventId)
    );
    for (const sec of secondaries) {
      for (const sp of sec.speakers) {
        if (primarySpeakerEventIds.has(sp.eventId)) {
          // Primary already has a speaker on this event — orphan the secondary's
          await tx.speaker.update({
            where: { id: sp.id },
            data: { userId: null },
          });
        } else {
          await tx.speaker.update({
            where: { id: sp.id },
            data: { userId: primaryId },
          });
          // Track so we don't reassign multiple secondaries' speakers on
          // the same event to primary (only the first one wins).
          primarySpeakerEventIds.add(sp.eventId);
        }
      }
    }

    // 8. Add missing tags to primary
    for (const t of tagsToAdd) {
      try {
        await tx.memberTag.create({
          data: { userId: primaryId, label: t.label, color: t.color },
        });
      } catch (err) {
        // If a global unique constraint exists and is violated, skip —
        // primary already has this label via another path. Log and continue.
        console.log(
          `[merge] tag create skipped for label "${t.label}":`,
          (err as Error).message
        );
      }
    }

    // 9. Update primary user with merged field values
    await tx.user.update({
      where: { id: primaryId },
      data: {
        name: pickFirst("name"),
        image: pickFirst("image"),
        photoUrl: pickFirst("photoUrl"),
        bio: mergedBio || null,
        linkedinUrl: pickFirst("linkedinUrl"),
        company: pickFirst("company"),
        companyUrl: pickFirst("companyUrl"),
        portfolioUrl: pickFirst("portfolioUrl"),
        passwordHash: pickFirst("passwordHash"),
        mobile: pickFirst("mobile"),
        interestedIn: mergedInterestedIn,
        profileCategories: mergedProfileCategories,
        appliedFor: mergedAppliedFor,
        invitedToSpeak: mergedInvitedToSpeak,
        importSource: mergedImportSource,
        importedAt: mergedImportedAt,
        role: mergedRole,
      },
    });

    // 10. Delete secondary users
    //     (MemberTag cascade-deletes their tags; Speaker.userId gets SetNull;
    //      SpeakerMessage.fromUserId gets SetNull — but we already reassigned
    //      the ones we cared about above)
    await tx.user.deleteMany({
      where: { id: { in: secondaryIds } },
    });

    return { deletedCount: secondaries.length };
  });

  return NextResponse.json({
    ok: true,
    primaryId,
    deletedCount: result.deletedCount,
  });
}

// ---------------------------------------------------------------------------
// Name similarity helpers
// ---------------------------------------------------------------------------

/**
 * Check if two names are "similar" — i.e. could plausibly be the same person.
 *
 * Heuristics (any one is enough to count as similar):
 *   1. Same first token (first name)
 *   2. Any shared token of length >= 2 (last name, middle name)
 *   3. One name is a substring of the other (e.g. "Eze" ⊂ "Ezequiel")
 *
 * If none of these hold, the names are "not even close".
 */
function areNamesSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  const ta = norm(a);
  const tb = norm(b);
  if (ta.length === 0 || tb.length === 0) return false;

  // Same first token?
  if (ta[0] === tb[0]) return true;

  // Any shared token?
  const sa = new Set(ta);
  for (const t of tb) if (sa.has(t)) return true;

  // Substring check
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al.length >= 3 && bl.includes(al)) return true;
  if (bl.length >= 3 && al.includes(bl)) return true;

  return false;
}

/**
 * Check all pairs in a set of users. Returns similar=false if ANY pair
 * isn't similar, plus the list of mismatched pairs.
 */
function checkNamesSimilar(
  users: { id: string; name: string | null; email: string }[]
): {
  similar: boolean;
  mismatchedPairs: { a: string; b: string }[];
} {
  const mismatchedPairs: { a: string; b: string }[] = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const a = users[i].name || users[i].email.split("@")[0];
      const b = users[j].name || users[j].email.split("@")[0];
      if (!areNamesSimilar(a, b)) {
        mismatchedPairs.push({ a, b });
      }
    }
  }
  return { similar: mismatchedPairs.length === 0, mismatchedPairs };
}
