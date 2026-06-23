import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/registrants/find-members
 *
 * Given a list of unlinked RSVPs, find the most likely platform member
 * for each one based on email, name, and mobile matches.
 *
 * Body: {
 *   rsvpIds?: string[],            // optional — if omitted, processes ALL unlinked RSVPs
 *   limit?: number                 // max suggestions per RSVP (default 3)
 * }
 *
 * Response: {
 *   results: Array<{
 *     rsvpId: string,
 *     rsvpEmail: string,
 *     rsvpName: string | null,
 *     suggestions: Array<{
 *       userId: string,
 *       name: string | null,
 *       email: string,
 *       mobile: string | null,
 *       company: string | null,
 *       score: number,             // 0-100, higher = more likely
 *       reasons: string[]          // e.g. ["Exact email match", "Same mobile"]
 *     }>
 *   }>,
 *   totalUnlinked: number
 * }
 *
 * MATCHING ALGORITHM (highest score wins):
 *   1. Exact email match (primary or secondary)        → 100 (auto-linkable)
 *   2. Same mobile number (normalized)                  → 85
 *   3. Same name (case-insensitive, full name match)    → 75
 *   4. Email domain match (e.g. both @google.com)       → 40
 *   5. Similar first name + last name initial           → 30
 *   6. Same first name only                             → 15
 *
 * Only suggestions with score >= 15 are returned. Suggestions are
 * sorted by score descending. The admin reviews them in the UI and
 * decides which to apply.
 *
 * Permission: members.view.
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

  const body = (await req.json().catch(() => ({}))) as {
    rsvpIds?: string[];
    limit?: number;
  };
  const limit = Math.min(Math.max(body.limit ?? 3, 1), 10);

  // Load RSVPs — either the specified ones (if unlinked) or all unlinked.
  const where = {
    userId: null,
    ...(body.rsvpIds && body.rsvpIds.length > 0
      ? { id: { in: body.rsvpIds } }
      : {}),
  };
  const rsvps = await db.eventRsvp.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      event: { select: { title: true, slug: true } },
    },
    take: 500, // safety cap
  });

  if (rsvps.length === 0) {
    return NextResponse.json({
      results: [],
      totalUnlinked: 0,
    });
  }

  // Load all members (we need email, name, mobile, secondary emails).
  // For 1000s of members this is fine — the matching is all in-memory.
  const members = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      mobile: true,
      company: true,
      secondaryEmails: { select: { email: true } },
    },
    take: 10000, // safety cap
  });

  // Build lookup indexes for fast matching
  const membersByPrimaryEmail = new Map<string, typeof members[number]>();
  const membersBySecondaryEmail = new Map<string, typeof members[number]>();
  const membersByMobile = new Map<string, typeof members[number][]>();
  const membersByFirstName = new Map<string, typeof members[number][]>();

  for (const m of members) {
    membersByPrimaryEmail.set(m.email.toLowerCase(), m);
    for (const se of m.secondaryEmails) {
      membersBySecondaryEmail.set(se.email.toLowerCase(), m);
    }
    const mobileNorm = normalizeMobile(m.mobile);
    if (mobileNorm) {
      const arr = membersByMobile.get(mobileNorm) || [];
      arr.push(m);
      membersByMobile.set(mobileNorm, arr);
    }
    const first = firstNameOf(m.name);
    if (first) {
      const arr = membersByFirstName.get(first) || [];
      arr.push(m);
      membersByFirstName.set(first, arr);
    }
  }

  const results = rsvps.map((rsvp) => {
    const rsvpEmail = rsvp.email.toLowerCase();
    const rsvpName = (rsvp.name || "").trim();
    const rsvpMobileNorm = normalizeMobile(null); // RSVPs don't store mobile — would need schema change
    const rsvpDomain = emailDomain(rsvp.email);
    const rsvpFirst = firstNameOf(rsvpName);

    const scored: Array<{
      member: typeof members[number];
      score: number;
      reasons: string[];
    }> = [];

    const considered = new Set<string>(); // dedupe by member id

    // 1. Exact email match (primary)
    const byPrimary = membersByPrimaryEmail.get(rsvpEmail);
    if (byPrimary && !considered.has(byPrimary.id)) {
      considered.add(byPrimary.id);
      scored.push({ member: byPrimary, score: 100, reasons: ["Exact email match"] });
    }
    // 1b. Exact email match (secondary)
    const bySecondary = membersBySecondaryEmail.get(rsvpEmail);
    if (bySecondary && !considered.has(bySecondary.id)) {
      considered.add(bySecondary.id);
      scored.push({
        member: bySecondary,
        score: 95,
        reasons: ["Matches a secondary email on the member's account"],
      });
    }
    // 2. Same mobile — RSVPs don't currently store mobile, so this is
    //    a no-op for now. Kept here for when the schema adds mobile to RSVP.
    if (rsvpMobileNorm) {
      const byMobile = membersByMobile.get(rsvpMobileNorm) || [];
      for (const m of byMobile) {
        if (considered.has(m.id)) continue;
        considered.add(m.id);
        scored.push({ member: m, score: 85, reasons: ["Same mobile number"] });
      }
    }
    // 3. Same name (full, case-insensitive)
    if (rsvpName) {
      const rsvpNameLower = rsvpName.toLowerCase();
      for (const m of members) {
        if (considered.has(m.id)) continue;
        if (m.name && m.name.toLowerCase() === rsvpNameLower) {
          considered.add(m.id);
          scored.push({ member: m, score: 75, reasons: ["Exact name match"] });
        }
      }
    }
    // 4. Email domain match (only if domain is non-generic)
    if (rsvpDomain && !isGenericDomain(rsvpDomain)) {
      for (const m of members) {
        if (considered.has(m.id)) continue;
        const mDomain = emailDomain(m.email);
        if (mDomain && mDomain === rsvpDomain) {
          considered.add(m.id);
          scored.push({
            member: m,
            score: 40,
            reasons: [`Same email domain (@${rsvpDomain})`],
          });
        }
      }
    }
    // 5. Similar first name + last name initial
    if (rsvpFirst && rsvpName) {
      const rsvpLast = lastNameOf(rsvpName);
      const rsvpLastInitial = rsvpLast ? rsvpLast[0].toLowerCase() : null;
      const candidates = membersByFirstName.get(rsvpFirst) || [];
      for (const m of candidates) {
        if (considered.has(m.id)) continue;
        const mLast = lastNameOf(m.name || "");
        if (rsvpLastInitial && mLast && mLast[0].toLowerCase() === rsvpLastInitial) {
          considered.add(m.id);
          scored.push({
            member: m,
            score: 30,
            reasons: [`Same first name + last initial (${rsvpFirst} ${rsvpLastInitial}.)`],
          });
        }
      }
    }
    // 6. Same first name only (weakest signal — only include if nothing else matched)
    if (rsvpFirst) {
      const candidates = membersByFirstName.get(rsvpFirst) || [];
      for (const m of candidates) {
        if (considered.has(m.id)) continue;
        considered.add(m.id);
        scored.push({
          member: m,
          score: 15,
          reasons: [`Same first name (${rsvpFirst})`],
        });
      }
    }

    // Filter out score < 15, sort by score desc, take top N
    const suggestions = scored
      .filter((s) => s.score >= 15)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => ({
        userId: s.member.id,
        name: s.member.name,
        email: s.member.email,
        mobile: s.member.mobile,
        company: s.member.company,
        score: s.score,
        reasons: s.reasons,
      }));

    return {
      rsvpId: rsvp.id,
      rsvpEmail: rsvp.email,
      rsvpName: rsvp.name,
      rsvpEventTitle: rsvp.event.title,
      suggestions,
    };
  });

  return NextResponse.json({
    results,
    totalUnlinked: rsvps.length,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeMobile(s: string | null): string | null {
  if (!s) return null;
  // Strip everything except digits
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Strip leading country code zeros/972 for Israeli numbers so +972-50-1234567
  // matches 0501234567 and 972501234567.
  let normalized = digits;
  if (normalized.startsWith("972")) normalized = "0" + normalized.slice(3);
  if (normalized.startsWith("00972")) normalized = "0" + normalized.slice(5);
  return normalized;
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function isGenericDomain(domain: string): boolean {
  return [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "live.com",
    "msn.com",
    "protonmail.com",
    "proton.me",
    "walla.com",
    "walla.co.il",
  ].includes(domain);
}

function firstNameOf(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0];
}

function lastNameOf(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}
