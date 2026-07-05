/**
 * Centralized role + permissions system for AI Salon Tel Aviv.
 *
 * Roles (stored on User.role):
 *   - "SUPER_ADMIN"  Hard-coded for eze@massapro.com (single Super Admin).
 *                    The ONLY role that can delete members or change
 *                    another user's role. Cannot be removed or revoked
 *                    (even by another SUPER_ADMIN).
 *   - "ADMIN"        Full platform access (events, members info, email
 *                    campaigns, agenda, speakers) EXCEPT delete-member
 *                    and role-change operations.
 *   - "CO_HOST"      Per-event collaborator. Can add/edit agendas +
 *                    speakers for events they are explicitly co-hosting
 *                    (EventCoHost table). Cannot create new events,
 *                    cannot see member info, cannot send email campaigns.
 *                    CAN view event-scoped data (registrants, speakers,
 *                    check-in, event dashboard, mockups) for events
 *                    they co-host — data is filtered server-side.
 *   - "SPEAKER"      Per-event speaker. Can view the Event Prep page
 *                    (read-only) for events they are speaking at.
 *                    Cannot edit agenda, event details, or anything else.
 *   - "MEMBER"       Default community member. Can RSVP, message
 *                    speakers, view event pages.
 *
 * Permission check pattern:
 *   import { can } from "@/lib/permissions";
 *   if (!can(me, "members.delete")) return 403;
 *
 * The `can()` helper handles SUPER_ADMIN → ADMIN → CO_HOST → MEMBER
 * inheritance automatically, so most callers just ask "can this user
 * do X?" without caring about the specific role string.
 *
 * NOTE: SPEAKER is intentionally OUTSIDE the inheritance chain — it has
 * rank 0 (below MEMBER). It does NOT inherit MEMBER permissions; it only
 * gets the explicit `eventprep.view` permission plus the standard
 * `events.view` that everyone signed-in gets.
 */

/** The five canonical role strings. SPEAKER is intentionally rank 0
 * (outside the inheritance chain) — it does NOT inherit MEMBER. */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  CO_HOST: "CO_HOST",
  MEMBER: "MEMBER",
  SPEAKER: "SPEAKER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * The email address that is ALWAYS the Super Admin.
 * Adding or removing from this list is the only way to grant or
 * revoke Super Admin status — it CANNOT be done via the UI.
 *
 * NOTE: Per user request (2026-06-23), only eze@massapro.com is a
 * Super Admin. To add another Super Admin in the future, append
 * their lowercase email to this Set and re-deploy.
 */
export const SUPER_ADMIN_EMAILS: ReadonlySet<string> = new Set([
  "eze@massapro.com",
]);

/**
 * Determine whether a given email is a Super Admin (by hard-coded list).
 * Used by the auth flow to seed/sync the SUPER_ADMIN role on every
 * sign-in, so the DB role field stays in sync with this list.
 */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.toLowerCase());
}

/**
 * Determine whether a user (with both email + role) is a Super Admin.
 *
 * This is the CANONICAL super-admin check for server-side authorization.
 * It returns true if EITHER:
 *   - the user's email is in the SUPER_ADMIN_EMAILS hard-coded list, OR
 *   - the user's DB role field is "SUPER_ADMIN"
 *
 * The email check is authoritative — it catches the case where an
 * admin's DB role hasn't been synced yet (e.g. they were just added
 * to the allowlist via code deploy but haven't logged out/in to
 * refresh their JWT). The DB role check is a forward-compatibility
 * fallback.
 *
 * Use this anywhere you need to authorize a Super-Admin-only action.
 */
export function isSuperAdmin(args: { email?: string | null; role?: string | null }): boolean {
  if (isSuperAdminEmail(args.email)) return true;
  return normalizeRole(args.role) === ROLES.SUPER_ADMIN;
}

/**
 * Normalize any role string to one of the canonical ROLES values.
 * Unknown / legacy values (e.g. "ADMIN" from the V3.0 schema) are
 * passed through unchanged so existing rows keep working. New code
 * should write one of the canonical ROLES.* strings.
 */
export function normalizeRole(role: string | null | undefined): Role {
  if (!role) return ROLES.MEMBER;
  const upper = role.toUpperCase();
  if (upper === "SUPER_ADMIN") return ROLES.SUPER_ADMIN;
  if (upper === "ADMIN") return ROLES.ADMIN;
  if (upper === "CO_HOST") return ROLES.CO_HOST;
  if (upper === "MEMBER") return ROLES.MEMBER;
  if (upper === "SPEAKER") return ROLES.SPEAKER;
  // Legacy / unknown values default to MEMBER
  return ROLES.MEMBER;
}

/**
 * Privilege rank — higher = more powerful. Used for inheritance.
 *   SUPER_ADMIN = 4
 *   ADMIN       = 3
 *   CO_HOST     = 2
 *   MEMBER      = 1
 *   SPEAKER     = 0  (outside inheritance — gets only explicit perms)
 */
const RANK: Record<Role, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  CO_HOST: 2,
  MEMBER: 1,
  SPEAKER: 0,
};

/** Does role A have AT LEAST the privileges of role B? */
export function hasAtLeastRole(userRole: string | null | undefined, required: Role): boolean {
  const r = normalizeRole(userRole);
  return RANK[r] >= RANK[required];
}

/**
 * Permissions catalog. Each permission is a string like "members.delete".
 * The CAN_MAP maps each permission to the MINIMUM role that grants it.
 *
 * SUPER_ADMIN implicitly grants ALL permissions (handled in can()).
 */
const CAN_MAP: Record<string, Role> = {
  // Member management
  "members.view": ROLES.ADMIN, // see /admin + member info
  "members.edit": ROLES.ADMIN, // edit profile fields
  "members.delete": ROLES.SUPER_ADMIN, // ONLY super admin
  "members.changeRole": ROLES.SUPER_ADMIN, // ONLY super admin
  "members.export": ROLES.ADMIN,
  "members.bulkImport": ROLES.ADMIN,
  "members.merge": ROLES.ADMIN,

  // Events
  "events.create": ROLES.ADMIN,
  "events.edit": ROLES.ADMIN, // edit any event (admins)
  "events.delete": ROLES.SUPER_ADMIN,
  "events.view": ROLES.MEMBER, // anyone signed in can see events

  // Agenda
  "agenda.edit": ROLES.ADMIN, // admins can edit any event's agenda
  "agenda.editCoHosted": ROLES.CO_HOST, // co-hosts can edit agenda of events they co-host

  // Speakers
  "speakers.create": ROLES.ADMIN,
  "speakers.edit": ROLES.ADMIN,
  "speakers.delete": ROLES.SUPER_ADMIN,
  "speakers.editCoHosted": ROLES.CO_HOST,

  // Registrants / RSVPs
  "registrants.view": ROLES.ADMIN,
  "registrants.edit": ROLES.ADMIN,
  "registrants.bulkImport": ROLES.ADMIN,

  // Email campaigns
  "email.view": ROLES.ADMIN,
  "email.send": ROLES.ADMIN,
  "email.templates": ROLES.ADMIN,

  // Images / presentations
  "images.manageAny": ROLES.ADMIN,
  "images.rotate": ROLES.ADMIN,
  "presentations.manageAny": ROLES.ADMIN,

  // Tags
  "tags.manage": ROLES.ADMIN,

  // ── Event-scoped data views (for CO_HOST) ──────────────────────────
  // CO_HOSTs can view event-scoped admin pages (registrants, speakers,
  // check-in, event-dashboard, mockups) — but only for events they
  // co-host. The data filtering happens server-side in each page via
  // getCoHostedEventIds().
  "eventdata.viewCoHosted": ROLES.CO_HOST,

  // ── Event Prep (for SPEAKER) ──────────────────────────────────────
  // Speakers can view the Event Prep page (read-only) for events they
  // are speaking at. They cannot edit anything — agenda, event details,
  // speakers, etc. are all read-only.
  "eventprep.view": ROLES.SPEAKER,
};

/**
 * Check whether a user (with the given role) is allowed to perform
 * the given permission.
 *
 * Super Admins always get true (they inherit everything).
 * Otherwise we look up the permission in CAN_MAP and compare ranks.
 *
 * Note: some permissions are SCOPE-LIMITED (e.g. "agenda.editCoHosted"
 * only applies to events the user is a co-host of). The can() helper
 * only checks ROLE — the caller is responsible for additionally
 * verifying the per-event scope via isEventCoHost().
 *
 * Example:
 *   if (!can(me.role, "agenda.edit") && !can(me.role, "agenda.editCoHosted")) return 403;
 *   // If user is CO_HOST, also verify they're a co-host of THIS event:
 *   if (me.role === "CO_HOST" && !(await isEventCoHost(me.id, eventId))) return 403;
 */
export function can(
  userRole: string | null | undefined,
  permission: keyof typeof CAN_MAP | string
): boolean {
  const r = normalizeRole(userRole);
  // Super Admins inherit everything
  if (r === ROLES.SUPER_ADMIN) return true;
  const required = CAN_MAP[permission];
  if (!required) return false;
  // SPEAKER has rank 0 — they ONLY pass checks where the required role
  // is also SPEAKER (e.g. "eventprep.view"). They do NOT inherit MEMBER
  // permissions despite being a signed-in user.
  if (r === ROLES.SPEAKER) {
    return required === ROLES.SPEAKER;
  }
  return RANK[r] >= RANK[required];
}

/**
 * Check whether a user (by id) is a co-host of a given event.
 * Returns false for non-CO_HOST users (use can(permission) for role checks).
 *
 * This is an async DB lookup — used by API routes that need per-event
 * scope checks for CO_HOST users.
 */
export async function isEventCoHost(userId: string, eventId: string): Promise<boolean> {
  // Lazy-import db to avoid circular imports in client-side code
  const { db } = await import("@/lib/db");
  const row = await db.eventCoHost.findUnique({
    where: {
      eventId_userId: { eventId, userId },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Returns the set of event IDs a CO_HOST user is allowed to see, OR null
 * if the user has global access (SUPER_ADMIN or ADMIN).
 *
 * Returns:
 *   - null  → user has global access (admin+) — DO NOT filter
 *   - []    → user has no event access (e.g. MEMBER/SPEAKER) — return empty
 *   - [id1, id2, ...] → user is CO_HOST of these specific events
 *
 * Usage in admin pages:
 *   const scopedEventIds = await getCoHostedEventIds(me.id, me.role);
 *   const where = scopedEventIds === null
 *     ? {}  // admin+: all events
 *     : { eventId: { in: scopedEventIds } };  // CO_HOST: only their events
 */
export async function getCoHostedEventIds(
  userId: string,
  role: string | null | undefined
): Promise<string[] | null> {
  // Admins + Super Admins see all events — return null to signal "no filter"
  if (can(role, "events.edit")) return null;
  // CO_HOST users see only their co-hosted events
  if (normalizeRole(role) === ROLES.CO_HOST) {
    const { db } = await import("@/lib/db");
    const rows = await db.eventCoHost.findMany({
      where: { userId },
      select: { eventId: true },
    });
    return rows.map((r) => r.eventId);
  }
  // Everyone else (MEMBER, SPEAKER, unknown): no events
  return [];
}

/**
 * Check whether a user is a Speaker (linked via Speaker.userId) of a
 * given event. Used to gate the Event Prep page for SPEAKER role.
 */
export async function isEventSpeaker(userId: string, eventId: string): Promise<boolean> {
  const { db } = await import("@/lib/db");
  const row = await db.speaker.findFirst({
    where: { userId, eventId },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Returns the event IDs where this user is a Speaker (linked via
 * Speaker.userId). Used by the Event Prep page to list the SPEAKER's
 * events. Returns [] for users who aren't speakers anywhere.
 */
export async function getSpeakerEventIds(userId: string): Promise<string[]> {
  const { db } = await import("@/lib/db");
  const rows = await db.speaker.findMany({
    where: { userId },
    select: { eventId: true },
  });
  // Dedupe — a user could theoretically be linked to multiple Speaker
  // rows for the same event (shouldn't happen, but be defensive).
  return Array.from(new Set(rows.map((r) => r.eventId)));
}

/**
 * Convenience: does the user have ANY of the listed permissions?
 * Useful for "can edit agenda (either as admin OR co-host)" checks.
 */
export function canAny(
  userRole: string | null | undefined,
  permissions: string[]
): boolean {
  return permissions.some((p) => can(userRole, p));
}

/**
 * Human-readable label for display in the UI.
 */
export function roleLabel(role: string | null | undefined): string {
  const r = normalizeRole(role);
  switch (r) {
    case ROLES.SUPER_ADMIN:
      return "Super Admin";
    case ROLES.ADMIN:
      return "Admin";
    case ROLES.CO_HOST:
      return "Co-host";
    case ROLES.SPEAKER:
      return "Speaker";
    case ROLES.MEMBER:
      return "Member";
  }
}

/**
 * Short badge color class (Tailwind) for each role.
 */
export function roleBadgeClass(role: string | null | undefined): string {
  const r = normalizeRole(role);
  switch (r) {
    case ROLES.SUPER_ADMIN:
      return "bg-[#820A7D] text-white";
    case ROLES.ADMIN:
      return "bg-[#FF005A] text-white";
    case ROLES.CO_HOST:
      return "bg-[#00E6FF]/20 text-[#007E72] border border-[#00E6FF]/40";
    case ROLES.SPEAKER:
      return "bg-[#FFB300]/20 text-[#8a5a00] border border-[#FFB300]/40";
    case ROLES.MEMBER:
      return "bg-black/5 text-black/80 border border-black/10";
  }
}

/**
 * Roles that a Super Admin can assign to a user via the EditMemberDialog.
 * Super Admin itself is NOT in this list — it can only be granted by
 * editing SUPER_ADMIN_EMAILS in code.
 */
export const ASSIGNABLE_ROLES: Role[] = [
  ROLES.ADMIN,
  ROLES.CO_HOST,
  ROLES.SPEAKER,
  ROLES.MEMBER,
];

/**
 * Roles that an Admin can assign to a user (more restrictive).
 * Admins cannot grant Admin to others (only Super Admin can).
 */
export const ADMIN_ASSIGNABLE_ROLES: Role[] = [
  ROLES.CO_HOST,
  ROLES.SPEAKER,
  ROLES.MEMBER,
];

/**
 * Returns true if the user role should see the "Admin" link in the
 * site header. This includes ADMIN+ and CO_HOST (event-scoped admin
 * pages). SPEAKER is excluded — they access Event Prep via the event
 * page itself (the 🎯 Event prep tab on /events/[slug]), not via /admin.
 */
export function canSeeAdminNav(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return (
    r === ROLES.SUPER_ADMIN ||
    r === ROLES.ADMIN ||
    r === ROLES.CO_HOST
  );
}
