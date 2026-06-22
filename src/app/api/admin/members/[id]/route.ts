import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PATCH /api/admin/members/[id]
 *
 * Admin-side edit of a member's profile fields. Mirrors the self-serve
 * PATCH /api/profile, but allows an admin to edit ANY user (not just
 * themselves). Used by the "Edit member" dialog in the admin members
 * table — clickable name + Edit button on each row.
 *
 * Body: {
 *   name?, bio?, company?, companyUrl?, linkedinUrl?, portfolioUrl?,
 *   mobile?, interestedIn?, profileCategories?, appliedFor?, invitedToSpeak?
 * }
 *
 * Email is NOT editable here (it's the immutable identity). Photo is
 * uploaded separately via POST /api/profile/photo or a dedicated admin
 * upload route. Role changes are intentionally NOT supported here —
 * use a dedicated admin endpoint if/when needed.
 */
export async function PATCH(
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
  const existing = await db.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string | null;
    bio?: string | null;
    company?: string | null;
    companyUrl?: string | null;
    linkedinUrl?: string | null;
    portfolioUrl?: string | null;
    mobile?: string | null;
    interestedIn?: string | null;
    profileCategories?: string | null;
    appliedFor?: string | null;
    invitedToSpeak?: string | null;
  };

  // Build the update payload — only fields explicitly present in the
  // body are touched (so partial updates work). Strings are trimmed +
  // length-capped to match the schema; URLs are sanitized.
  const data: Record<string, string | null> = {};

  if (body.name !== undefined) {
    const trimmed = (body.name || "").trim();
    data.name = trimmed.length > 0 ? trimmed.slice(0, 100) : null;
  }
  if (body.bio !== undefined) {
    const trimmed = (body.bio || "").trim();
    data.bio = trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
  }
  if (body.company !== undefined) {
    const trimmed = (body.company || "").trim();
    data.company = trimmed.length > 0 ? trimmed.slice(0, 120) : null;
  }
  if (body.companyUrl !== undefined) {
    const trimmed = (body.companyUrl || "").trim();
    data.companyUrl = trimmed.length > 0 ? sanitizeUrl(trimmed) : null;
  }
  if (body.linkedinUrl !== undefined) {
    const trimmed = (body.linkedinUrl || "").trim();
    data.linkedinUrl = trimmed.length > 0 ? sanitizeUrl(trimmed) : null;
  }
  if (body.portfolioUrl !== undefined) {
    const trimmed = (body.portfolioUrl || "").trim();
    data.portfolioUrl = trimmed.length > 0 ? sanitizeUrl(trimmed) : null;
  }
  if (body.mobile !== undefined) {
    const trimmed = (body.mobile || "").trim();
    data.mobile = trimmed.length > 0 ? trimmed.slice(0, 60) : null;
  }
  if (body.interestedIn !== undefined) {
    const trimmed = (body.interestedIn || "").trim();
    data.interestedIn = trimmed.length > 0 ? trimmed.slice(0, 1000) : null;
  }
  if (body.profileCategories !== undefined) {
    const trimmed = (body.profileCategories || "").trim();
    data.profileCategories = trimmed.length > 0 ? trimmed.slice(0, 1000) : null;
  }
  if (body.appliedFor !== undefined) {
    const trimmed = (body.appliedFor || "").trim();
    data.appliedFor = trimmed.length > 0 ? trimmed.slice(0, 120) : null;
  }
  if (body.invitedToSpeak !== undefined) {
    const trimmed = (body.invitedToSpeak || "").trim();
    data.invitedToSpeak = trimmed.length > 0 ? trimmed.slice(0, 120) : null;
  }

  const updated = await db.user.update({
    where: { id },
    data,
    include: { tags: true },
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      image: updated.image,
      photoUrl: updated.photoUrl,
      bio: updated.bio,
      company: updated.company,
      companyUrl: updated.companyUrl,
      linkedinUrl: updated.linkedinUrl,
      portfolioUrl: updated.portfolioUrl,
      mobile: updated.mobile,
      interestedIn: updated.interestedIn,
      profileCategories: updated.profileCategories,
      appliedFor: updated.appliedFor,
      invitedToSpeak: updated.invitedToSpeak,
      role: updated.role,
      tags: updated.tags,
    },
  });
}

/**
 * Sanitize a user-supplied URL:
 *  - reject javascript: / data: / file: / vbscript: schemes
 *  - prepend https:// if missing scheme
 *  - cap length to 500 chars
 */
function sanitizeUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (v.length > 500) v = v.slice(0, 500);
  if (/^(javascript|data|file|vbscript):/i.test(v)) return null;
  if (!/^https?:\/\//i.test(v)) {
    v = `https://${v}`;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(v);
    return v;
  } catch {
    return null;
  }
}
