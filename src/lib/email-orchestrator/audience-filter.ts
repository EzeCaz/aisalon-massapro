/**
 * Audience filter evaluator.
 *
 * A "dynamic" EmailAudience stores a filter spec in `filtersJson`:
 *
 *   {
 *     source: "users" | "rsvps" | "users_and_rsvps",
 *     combinator: "AND" | "OR",           // how groups combine
 *     groups: [
 *       {
 *         combinator: "AND" | "OR",       // how rules combine inside this group
 *         rules: [
 *           { field: "role", op: "equals", value: "MEMBER" }
 *         ]
 *       }
 *     ]
 *   }
 *
 * The evaluator translates the spec into Prisma `where` clauses and
 * returns a de-duplicated list of lowercased email addresses.
 *
 * Available fields + operators are exported below for use in the UI.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FilterOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "in"           // comma-separated list of values
  | "not_in"
  | "is_set"       // value is ignored
  | "is_not_set"
  | "before"       // ISO date string
  | "after";       // ISO date string

export type FilterRule = {
  field: string;
  op: FilterOp;
  value: string;
};

export type FilterGroup = {
  combinator: "AND" | "OR";
  rules: FilterRule[];
};

export type AudienceFilterSpec = {
  source: "users" | "rsvps" | "users_and_rsvps";
  combinator: "AND" | "OR";
  groups: FilterGroup[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Field catalogue (used by the UI)
// ─────────────────────────────────────────────────────────────────────────────

export type FieldDef = {
  field: string;
  label: string;
  type: "string" | "enum" | "boolean" | "date";
  options?: { value: string; label: string }[];
  /** Supported operators. If absent, all operators are supported. */
  ops?: FilterOp[];
};

export const USER_FIELDS: FieldDef[] = [
  { field: "email", label: "Email", type: "string" },
  { field: "name", label: "Name", type: "string" },
  { field: "company", label: "Company", type: "string" },
  { field: "companyUrl", label: "Company URL", type: "string" },
  { field: "title", label: "Title / Role", type: "string" },
  { field: "linkedinUrl", label: "LinkedIn URL", type: "string" },
  { field: "portfolioUrl", label: "Portfolio URL", type: "string" },
  { field: "bio", label: "Bio", type: "string" },
  { field: "mobile", label: "Mobile", type: "string" },
  { field: "interestedIn", label: "Interested in", type: "string" },
  { field: "profileCategories", label: "Profile categories", type: "string" },
  { field: "appliedFor", label: "Applied for", type: "string" },
  { field: "invitedToSpeak", label: "Invited to speak", type: "string" },
  {
    field: "role",
    label: "Role",
    type: "enum",
    options: [
      { value: "SUPER_ADMIN", label: "Super Admin" },
      { value: "ADMIN", label: "Admin" },
      { value: "CO_HOST", label: "Co-Host" },
      { value: "MEMBER", label: "Member" },
    ],
  },
  { field: "onboardedAt", label: "Onboarded at", type: "date" },
  { field: "archivedAt", label: "Archived at", type: "date" },
  { field: "createdAt", label: "Signed up at", type: "date" },
];

export const RSVP_FIELDS: FieldDef[] = [
  { field: "email", label: "Email", type: "string" },
  { field: "name", label: "Name", type: "string" },
  {
    field: "status",
    label: "RSVP status",
    type: "enum",
    options: [
      { value: "GOING", label: "Going" },
      { value: "MAYBE", label: "Maybe" },
      { value: "NOT_GOING", label: "Not going" },
    ],
  },
  {
    field: "source",
    label: "RSVP source",
    type: "enum",
    options: [
      { value: "MANUAL", label: "Manual" },
      { value: "EVENT_PAGE", label: "Event page" },
      { value: "IMPORT", label: "Import" },
    ],
  },
  { field: "eventId", label: "Event ID", type: "string" },
  { field: "doorCheckedAt", label: "Door checked-in at", type: "date" },
  { field: "attendedAt", label: "Attended at", type: "date" },
  { field: "noShow", label: "No-show", type: "boolean" },
  { field: "createdAt", label: "RSVP created at", type: "date" },
];

export const ALL_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "in", label: "is any of" },
  { value: "not_in", label: "is none of" },
  { value: "is_set", label: "is set (not empty)" },
  { value: "is_not_set", label: "is empty" },
  { value: "before", label: "is before" },
  { value: "after", label: "is after" },
];

/** Pick the appropriate operator list for a field type. */
export function opsForField(field: FieldDef): FilterOp[] {
  if (field.ops) return field.ops;
  switch (field.type) {
    case "boolean":
      return ["equals"];
    case "enum":
      return ["equals", "not_equals", "in", "not_in"];
    case "date":
      return ["before", "after", "is_set", "is_not_set"];
    default:
      return ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "in", "not_in", "is_set", "is_not_set"];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec → Prisma where translation
// ─────────────────────────────────────────────────────────────────────────────

/** Parse + validate the JSON spec. Returns null on malformed input. */
export function parseSpec(json: string | null | undefined): AudienceFilterSpec | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (typeof obj !== "object" || obj === null) return null;
    if (!["users", "rsvps", "users_and_rsvps"].includes(obj.source)) return null;
    if (!["AND", "OR"].includes(obj.combinator)) return null;
    if (!Array.isArray(obj.groups)) return null;
    return obj as AudienceFilterSpec;
  } catch {
    return null;
  }
}

/** Translate a single rule into a Prisma fragment. Returns null if rule is invalid. */
function ruleToPrisma(rule: FilterRule): Prisma.UserWhereInput | Prisma.EventRsvpWhereInput | null {
  const { field, op, value } = rule;
  if (!field || !op) return null;

  // is_set / is_not_set apply to any field
  if (op === "is_set") {
    return { [field]: { not: null } } as Prisma.UserWhereInput;
  }
  if (op === "is_not_set") {
    return { [field]: null } as Prisma.UserWhereInput;
  }

  // Boolean fields
  if (op === "equals" && (value === "true" || value === "false")) {
    return { [field]: value === "true" } as Prisma.UserWhereInput;
  }

  // Date fields
  if (op === "before" || op === "after") {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return { [field]: op === "before" ? { lt: d } : { gt: d } } as Prisma.UserWhereInput;
  }

  // in / not_in: split comma-separated
  if (op === "in" || op === "not_in") {
    const list = value.split(",").map((v) => v.trim()).filter(Boolean);
    if (list.length === 0) return null;
    if (op === "in") {
      return { [field]: { in: list } } as Prisma.UserWhereInput;
    }
    return { NOT: { [field]: { in: list } } } as Prisma.UserWhereInput;
  }

  // String ops
  switch (op) {
    case "equals":
      return { [field]: value } as Prisma.UserWhereInput;
    case "not_equals":
      return { NOT: { [field]: value } } as Prisma.UserWhereInput;
    case "contains":
      return { [field]: { contains: value, mode: "insensitive" } } as Prisma.UserWhereInput;
    case "not_contains":
      return { NOT: { [field]: { contains: value, mode: "insensitive" } } } as Prisma.UserWhereInput;
    case "starts_with":
      return { [field]: { startsWith: value, mode: "insensitive" } } as Prisma.UserWhereInput;
    case "ends_with":
      return { [field]: { endsWith: value, mode: "insensitive" } } as Prisma.UserWhereInput;
    default:
      return null;
  }
}

/** Translate a group (rules combined by its combinator) into a Prisma fragment. */
function groupToPrisma(group: FilterGroup): Prisma.UserWhereInput | Prisma.EventRsvpWhereInput | null {
  const rules = group.rules.map(ruleToPrisma).filter(Boolean) as Prisma.UserWhereInput[];
  if (rules.length === 0) return null;
  if (group.combinator === "AND") {
    return { AND: rules } as Prisma.UserWhereInput;
  }
  return { OR: rules } as Prisma.UserWhereInput;
}

/** Translate the full spec into a Prisma `where` for the User model. */
function buildUserWhere(spec: AudienceFilterSpec): Prisma.UserWhereInput {
  const groups = spec.groups.map(groupToPrisma).filter(Boolean) as Prisma.UserWhereInput[];
  if (groups.length === 0) return {};
  if (spec.combinator === "AND") {
    return { AND: groups };
  }
  return { OR: groups };
}

/** Translate the full spec into a Prisma `where` for the EventRsvp model. */
function buildRsvpWhere(spec: AudienceFilterSpec): Prisma.EventRsvpWhereInput {
  const groups = spec.groups.map(groupToPrisma).filter(Boolean) as Prisma.EventRsvpWhereInput[];
  if (groups.length === 0) return {};
  if (spec.combinator === "AND") {
    return { AND: groups };
  }
  return { OR: groups };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: resolve a dynamic audience to a list of emails
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate the given filter spec and return a de-duplicated, lowercased
 * list of email addresses. Returns an empty array if the spec is empty
 * or invalid.
 *
 * For `source: "users"` — pulls emails from User.email + UserEmail.email
 *   (excludes archived users).
 * For `source: "rsvps"` — pulls emails from EventRsvp.email.
 * For `source: "users_and_rsvps"` — pulls from both, deduplicated.
 */
export async function resolveAudienceEmails(spec: AudienceFilterSpec): Promise<string[]> {
  const emailSet = new Set<string>();

  if (spec.source === "users" || spec.source === "users_and_rsvps") {
    const userWhere = buildUserWhere(spec);
    // Pull primary emails
    const users = await db.user.findMany({
      where: { ...userWhere, archivedAt: null },
      select: { email: true },
    });
    users.forEach((u) => emailSet.add(u.email.toLowerCase()));

    // Pull secondary emails (UserEmail) for matching users
    const userIds = users.map((u) => u.email);
    if (userIds.length > 0) {
      const secondary = await db.userEmail.findMany({
        where: {
          user: {
            email: { in: userIds },
            archivedAt: null,
          },
        },
        select: { email: true },
      });
      secondary.forEach((e) => emailSet.add(e.email.toLowerCase()));
    }
  }

  if (spec.source === "rsvps" || spec.source === "users_and_rsvps") {
    const rsvpWhere = buildRsvpWhere(spec);
    const rsvps = await db.eventRsvp.findMany({
      where: rsvpWhere,
      select: { email: true },
    });
    rsvps.forEach((r) => emailSet.add(r.email.toLowerCase()));
  }

  return Array.from(emailSet).sort();
}

/**
 * Resolve an audience (by ID) to its current list of emails. Works for
 * both STATIC and DYNAMIC audiences. Returns lowercased de-duplicated
 * emails. Returns an empty array if the audience doesn't exist.
 */
export async function resolveAudienceEmailsById(audienceId: string | null | undefined): Promise<string[]> {
  if (!audienceId) return [];
  const audience = await db.emailAudience.findUnique({
    where: { id: audienceId },
    select: { kind: true, emailsJson: true, filtersJson: true },
  });
  if (!audience) return [];

  if (audience.kind === "STATIC") {
    try {
      const arr = JSON.parse(audience.emailsJson);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((e) => typeof e === "string")
        .map((e: string) => e.toLowerCase());
    } catch {
      return [];
    }
  }

  // DYNAMIC
  const spec = parseSpec(audience.filtersJson);
  if (!spec) return [];
  return resolveAudienceEmails(spec);
}
