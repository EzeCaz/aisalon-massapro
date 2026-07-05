import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  can,
  isSuperAdmin,
  isSuperAdminEmail,
  normalizeRole,
  ROLES,
  ASSIGNABLE_ROLES,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth-guards";

/**
 * PATCH /api/admin/members/[id]
 *
 * Admin-side edit of a member's profile fields. Mirrors the self-serve
 * PATCH /api/profile, but allows an admin to edit ANY user (not just
 * themselves). Used by the "Edit member" dialog in the admin members
 * table — clickable name + Edit button on each row.
 *
 * Body: {
 *   name?, bio?, company?, companyUrl?, linkedinUrl?, portfolioUrl?, title?,
 *   mobile?, interestedIn?, profileCategories?, appliedFor?, invitedToSpeak?,
 *   role?  // ONLY Super Admin can change role; value must be one of
 *          // ASSIGNABLE_ROLES (ADMIN, CO_HOST, MEMBER). SUPER_ADMIN
 *          // cannot be granted via this endpoint — only the
 *          // hard-coded email list in permissions.ts can be Super Admin.
 * }
 *
 * Email is NOT editable here (it's the immutable identity). Photo is
 * uploaded separately via POST /api/profile/photo or a dedicated admin
 * upload route.
 *
 * Permission rules:
 *   - me.role === "ADMIN"      → can edit profile fields, NOT role
 *   - me.role === "SUPER_ADMIN" → can edit profile fields AND role
 *   - "CO_HOST" / "MEMBER"      → 403 (this is an admin-only endpoint)
 *
 * Super Admin protection:
 *   - The target user's role CANNOT be changed away from SUPER_ADMIN
 *     via this endpoint (it's hard-coded by email).
 *   - SUPER_ADMIN users cannot be deleted either (separate DELETE route).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Use getCurrentUser() so the auto-sync runs (if the user's email is
  // in the SUPER_ADMIN_EMAILS allowlist but their DB role hasn't been
  // upgraded yet, this will upgrade it inline).
  // NOTE: getCurrentUser() returns { user, error } — we must destructure.
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  // me is now a { id, email, name, role } object with the synced role.
  // Debug: include diagnostic info in 403 errors so we can see exactly
  // which check failed and what the server sees as the caller's identity.
  const debugInfo = {
    youEmail: me.email,
    youRole: me.role,
    isSuperAdminByEmail: isSuperAdminEmail(me.email),
    isSuperAdmin: isSuperAdmin({ email: me.email, role: me.role }),
    canEditMembers: can(me.role, "members.edit"),
  };
  if (!can(me.role, "members.edit") && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Forbidden", debug: debugInfo },
      { status: 403 }
    );
  }

  const { id } = await params;
  const existing = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
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
    title?: string | null;
    mobile?: string | null;
    interestedIn?: string | null;
    profileCategories?: string | null;
    appliedFor?: string | null;
    invitedToSpeak?: string | null;
    role?: string | null;
  };

  // ---- Role change authorization ----
  // Super Admin targets are IMMUTABLE — no one (not even another Super
  // Admin) can change their role via the API. The only way to add or
  // remove a Super Admin is by editing the SUPER_ADMIN_EMAILS list in
  // src/lib/permissions.ts and re-deploying.
  if (isSuperAdminEmail(existing.email)) {
    if (body.role !== undefined && body.role !== null && body.role !== ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Cannot change the role of a Super Admin. Super Admin status is hard-coded by email." },
        { status: 403 }
      );
    }
  }

  // Only Super Admin can change roles at all.
  // We use isSuperAdmin() (email-based OR DB-role-based) so that an
  // admin whose DB role hasn't synced yet (stale JWT) is still
  // authorized as long as their email is in the hard-coded allowlist.
  if (body.role !== undefined && body.role !== null) {
    if (!isSuperAdmin({ email: me.email, role: me.role })) {
      return NextResponse.json(
        { error: "Only a Super Admin can change a member's role.", debug: debugInfo },
        { status: 403 }
      );
    }
    // Validate the new role is in the assignable set (prevents granting
    // SUPER_ADMIN via this endpoint — that's only available by editing
    // the hard-coded email list).
    const newRole = normalizeRole(body.role);
    if (!ASSIGNABLE_ROLES.includes(newRole)) {
      return NextResponse.json(
        { error: `Invalid role. Allowed values: ${ASSIGNABLE_ROLES.join(", ")}.` },
        { status: 400 }
      );
    }
  }

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
  if (body.title !== undefined) {
    const trimmed = (body.title || "").trim();
    data.title = trimmed.length > 0 ? trimmed.slice(0, 120) : null;
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
  if (body.role !== undefined && body.role !== null) {
    data.role = normalizeRole(body.role);
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
      title: updated.title,
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
 * DELETE /api/admin/members/[id]
 *
 * Permanently delete a member. ONLY Super Admin can do this.
 * Super Admins themselves CANNOT be deleted (their role is hard-coded
 * by email, so deleting the row would just cause them to be re-created
 * with SUPER_ADMIN role on their next sign-in).
 *
 * Cascades: secondary emails, speaker messages, etc. are deleted with
 * the user (per the schema's onDelete: Cascade). EventCoHost rows
 * added BY this user have their addedBy set to null (onDelete: SetNull).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // NOTE: getCurrentUser() returns { user, error } — we must destructure.
  const { user: me, error: authError } = await getCurrentUser();
  if (authError) return authError;
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only a Super Admin can delete members." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Super Admins cannot be deleted.
  if (isSuperAdminEmail(target.email)) {
    return NextResponse.json(
      { error: "Super Admins cannot be deleted. Remove their email from SUPER_ADMIN_EMAILS first." },
      { status: 403 }
    );
  }

  // Don't allow self-delete (avoids footgun — would lock the admin out).
  if (target.id === me.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  await db.user.delete({ where: { id } });

  return NextResponse.json({ ok: true, deleted: id });
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
