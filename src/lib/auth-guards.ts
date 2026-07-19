/**
 * Helpers for enforcing role-based permissions in API routes.
 *
 * The basic permission check is `can(role, permission)` from
 * @/lib/permissions — that handles SUPER_ADMIN inheritance and the
 * minimum-role-for-permission lookup.
 *
 * V7: `getCurrentUser()` also returns the user's effective `scope`
 * (global / country / chapter / none). Pass `scope` into your query
 * filters via `scopeUserWhere(scope)` / `scopeEventWhere(scope)` /
 * `scopeChapterWhere(scope)`.
 *
 * This file adds helpers for the common "load the current user,
 * check their role, return 401/403 if not allowed" pattern, plus
 * per-event scope checks for CHAPTER_ORGANIZER / CO_HOST users.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  can,
  getUserScope,
  isEventCoHost,
  isSuperAdminEmail,
  ROLES,
  type UserScope,
} from "@/lib/permissions";

/**
 * Load the current authenticated user from the session. Returns:
 *   - { user: <User>, error: null, scope: <UserScope> }  on success
 *   - { user: null,  error: <401 NextResponse>, scope: null }  if not signed in
 *   - { user: null,  error: <403 NextResponse>, scope: null }  if signed in but no DB row
 *
 * SIDE EFFECT: If the user's email is in the SUPER_ADMIN_EMAILS allowlist
 * but their DB role isn't SUPER_ADMIN yet (e.g. they were just added to
 * the allowlist via code deploy and haven't logged out/in to refresh
 * their JWT), this function auto-syncs the DB role to SUPER_ADMIN. This
 * guarantees that the hard-coded email allowlist is ALWAYS authoritative,
 * regardless of DB state.
 *
 * V7: also returns the user's effective `scope` (global / country / chapter / none).
 * Use `scope` to filter db queries in admin pages.
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      scope: null as UserScope | null,
    };
  }
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      countryId: true,
      chapterId: true,
    },
  });
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "User not found" }, { status: 403 }),
      scope: null as UserScope | null,
    };
  }
  // Auto-sync: if email is in super admin allowlist but DB role isn't,
  // upgrade the DB row immediately so all subsequent can() checks pass.
  if (isSuperAdminEmail(user.email) && user.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: user.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    const syncedUser = { ...user, role: ROLES.SUPER_ADMIN };
    return { user: syncedUser, error: null, scope: { kind: "global" } as UserScope };
  }
  const scope = await getUserScope(user.id);
  return { user, error: null, scope };
}

/**
 * Require that the current user has the given permission.
 * Returns the user on success, or a 401/403 NextResponse on failure.
 *
 * Usage:
 *   const me = await requirePermission("members.view");
 *   if (me instanceof NextResponse) return me;
 *   // ... me is now a { id, email, name, role } object
 *
 * (The `req` argument is not used — it's kept in the signature for
 *  future compatibility, but you can pass null/undefined for GET
 *  handlers that don't have a request body to inspect.)
 */
export async function requirePermission(permission: string) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (!can(user!.role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user!;
}

/**
 * Require that the current user can edit a SPECIFIC event's agenda.
 *
 *   - SUPER_ADMIN + ADMIN → always allowed (they can edit any event)
 *   - CO_HOST             → allowed only if they're a co-host of this event
 *   - MEMBER              → 403
 *
 * Usage:
 *   const me = await requireEventAgendaEdit(eventId);
 *   if (me instanceof NextResponse) return me;
 */
export async function requireEventAgendaEdit(eventId: string) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  // Admins + Super Admins can edit any event's agenda
  if (can(user!.role, "agenda.edit")) return user!;
  // CO_HOST users need to be a co-host of THIS specific event
  if (can(user!.role, "agenda.editCoHosted")) {
    const ok = await isEventCoHost(user!.id, eventId);
    if (ok) return user!;
    return NextResponse.json(
      { error: "You are not a co-host of this event." },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Require that the current user can edit a SPECIFIC event's speakers.
 * Same scope rules as requireEventAgendaEdit.
 */
export async function requireEventSpeakersEdit(eventId: string) {
  const { user, error } = await getCurrentUser();
  if (error) return error;
  if (can(user!.role, "speakers.edit")) return user!;
  if (can(user!.role, "speakers.editCoHosted")) {
    const ok = await isEventCoHost(user!.id, eventId);
    if (ok) return user!;
    return NextResponse.json(
      { error: "You are not a co-host of this event." },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Type guard: is the return value from requirePermission* a NextResponse
 * (i.e. an error response) or the actual user?
 */
export function isError<T>(v: T | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
