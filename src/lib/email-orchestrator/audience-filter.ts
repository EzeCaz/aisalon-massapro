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
  type: "string" | "enum" | "boolean" | "date" | "engagement";
  options?: { value: string; label: string }[];
  /** Supported operators. If absent, all operators are supported. */
  ops?: FilterOp[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Engagement (behaviour-based) virtual fields
// ─────────────────────────────────────────────────────────────────────────────
//
// These field names are NOT real columns on User/EventRsvp. They are virtual:
// the evaluator intercepts them, runs an async query against EmailQueue /
// EmailRecipient / TrackingLog to compute the set of emails that match the
// behaviour, then injects that set as an `email: { in: [...] }` filter.
//
// Value format: `<kind>:<id>` where kind ∈ {template, campaign}.
//   - `template:<EmailStageTemplate.id>` — looks at all EmailQueue rows whose
//     flowStep.templateId = id, OR (for default stage templates) whose stage =
//     template.stage AND flowStepId IS NULL.
//   - `campaign:<EmailCampaign.id>` — looks at EmailRecipient rows linked to
//     that campaign.
//
// Engagement rules are added to the field catalogue so they appear in the UI
// dropdown. They use a single operator `equals` (the only meaningful op).
// The UI renders the value as a dropdown populated by
// GET /api/email-audiences/email-options.

export type EngagementBehavior = "opened" | "notOpened" | "clicked" | "notClicked";

export const ENGAGEMENT_FIELDS: FieldDef[] = [
  {
    field: "__emailOpened",
    label: "✉️  Opened a specific email",
    type: "engagement",
    ops: ["equals"],
  },
  {
    field: "__emailNotOpened",
    label: "📭  Did NOT open a specific email",
    type: "engagement",
    ops: ["equals"],
  },
  {
    field: "__emailClicked",
    label: "🖱️  Clicked in a specific email",
    type: "engagement",
    ops: ["equals"],
  },
  {
    field: "__emailNotClicked",
    label: "🚫  Did NOT click in a specific email",
    type: "engagement",
    ops: ["equals"],
  },
];

export const ENGAGEMENT_FIELD_TO_BEHAVIOR: Record<string, EngagementBehavior> = {
  __emailOpened: "opened",
  __emailNotOpened: "notOpened",
  __emailClicked: "clicked",
  __emailNotClicked: "notClicked",
};

export function isEngagementField(field: string): boolean {
  return field in ENGAGEMENT_FIELD_TO_BEHAVIOR;
}

export function parseEngagementValue(value: string): { kind: "template" | "campaign"; id: string } | null {
  const m = /^(template|campaign):(.+)$/.exec(value);
  if (!m) return null;
  return { kind: m[1] as "template" | "campaign", id: m[2] };
}

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
  // Engagement virtual fields — work for any source because they resolve
  // to an `email: { in: [...] }` filter applied on the User / EventRsvp
  // email column. See ENGAGEMENT_FIELDS above for semantics.
  ...ENGAGEMENT_FIELDS,
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
  // Engagement virtual fields — see USER_FIELDS comment above.
  ...ENGAGEMENT_FIELDS,
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
    case "engagement":
      return ["equals"];
    default:
      return ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "in", "not_in", "is_set", "is_not_set"];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec → Prisma where translation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Non-nullable fields per model. Used by `is_set` / `is_not_set` operators:
 * checking "IS NULL" on a non-nullable column is invalid Prisma syntax, so
 * we short-circuit (is_set → match all, is_not_set → match none).
 *
 * Source of truth: prisma/schema.prisma — keep in sync if schema changes.
 */
const NON_NULLABLE_USER_FIELDS = new Set([
  "id", "email", "role", "createdAt", "updatedAt",
]);
const NON_NULLABLE_RSVP_FIELDS = new Set([
  "id", "eventId", "userId", "email", "status", "source", "noShow", "createdAt", "updatedAt",
]);

/** Returns true if the field is non-nullable on BOTH User and EventRsvp. */
function isNonNullableField(field: string): boolean {
  return NON_NULLABLE_USER_FIELDS.has(field) && NON_NULLABLE_RSVP_FIELDS.has(field);
}

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

/**
 * Engagement context — a pre-computed map from rule key (groupIdx:ruleIdx) to
 * the set of emails that match the behaviour. Built once at the start of
 * resolveAudienceEmails and threaded through the where-clause builders.
 */
type EngagementContext = {
  /** key = `${groupIdx}:${ruleIdx}` → lowercased email set */
  emailSets: Map<string, Set<string>>;
};

/** Translate a single rule into a Prisma fragment. Returns null if rule is invalid. */
function ruleToPrisma(rule: FilterRule, ctx: EngagementContext, ruleKey: string): Prisma.UserWhereInput | Prisma.EventRsvpWhereInput | null {
  const { field, op, value } = rule;
  if (!field || !op) return null;

  // Engagement virtual fields — intercept and inject email set filter.
  if (isEngagementField(field)) {
    const emails = ctx.emailSets.get(ruleKey);
    // If the set is missing (rule wasn't pre-processed) or empty, return a
    // sentinel that matches nothing. An empty set means "no one exhibited
    // this behaviour" — for "opened" that yields no matches, which is
    // correct. For "notOpened" it also yields no matches because we already
    // computed receivedEmails - openedEmails (also empty if no one received).
    const list = emails ? Array.from(emails) : [];
    return { email: { in: list } } as Prisma.UserWhereInput;
  }

  // is_set / is_not_set apply to any field.
  //
  // NOTE on Prisma null-checks:
  //  - For NULLABLE fields, `{ [field]: { not: null } }` is INVALID — Prisma
  //    serializes `null` as missing, so it raises "Argument `not` is missing".
  //    The correct pattern is `{ NOT: { [field]: null } }`.
  //  - For NON-NULLABLE fields (User.email, EventRsvp.email, etc.), Prisma
  //    rejects `NOT: { [field]: null }` with "Argument `<field>` is missing"
  //    because null isn't a valid value for a non-nullable field. In that case
  //    `is_set` is trivially TRUE (always set) → return {} to match everything,
  //    and `is_not_set` is trivially FALSE → return a never-match sentinel.
  if (op === "is_set") {
    if (isNonNullableField(field)) {
      return {} as Prisma.UserWhereInput;
    }
    return { NOT: { [field]: null } } as Prisma.UserWhereInput;
  }
  if (op === "is_not_set") {
    if (isNonNullableField(field)) {
      // Impossible — non-nullable field is always set. Return a never-match.
      return { id: "__impossible__" } as Prisma.UserWhereInput;
    }
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
function groupToPrisma(group: FilterGroup, ctx: EngagementContext, groupIdx: number): Prisma.UserWhereInput | Prisma.EventRsvpWhereInput | null {
  const rules = group.rules
    .map((rule, ruleIdx) => ruleToPrisma(rule, ctx, `${groupIdx}:${ruleIdx}`))
    .filter(Boolean) as Prisma.UserWhereInput[];
  if (rules.length === 0) return null;
  if (group.combinator === "AND") {
    return { AND: rules } as Prisma.UserWhereInput;
  }
  return { OR: rules } as Prisma.UserWhereInput;
}

/** Translate the full spec into a Prisma `where` for the User model. */
function buildUserWhere(spec: AudienceFilterSpec, ctx: EngagementContext): Prisma.UserWhereInput {
  const groups = spec.groups.map((g, i) => groupToPrisma(g, ctx, i)).filter(Boolean) as Prisma.UserWhereInput[];
  if (groups.length === 0) return {};
  if (spec.combinator === "AND") {
    return { AND: groups };
  }
  return { OR: groups };
}

/** Translate the full spec into a Prisma `where` for the EventRsvp model. */
function buildRsvpWhere(spec: AudienceFilterSpec, ctx: EngagementContext): Prisma.EventRsvpWhereInput {
  const groups = spec.groups.map((g, i) => groupToPrisma(g, ctx, i)).filter(Boolean) as Prisma.EventRsvpWhereInput[];
  if (groups.length === 0) return {};
  if (spec.combinator === "AND") {
    return { AND: groups };
  }
  return { OR: groups };
}

// ─────────────────────────────────────────────────────────────────────────────
// Engagement resolver — compute email sets for behaviour-based rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the set of emails that RECEIVED the target email (i.e. were sent it).
 *
 * For `kind: "template"`:
 *   - Match EmailQueue rows where flowStep.templateId = id, OR (for default
 *     stage templates) where stage = template.stage AND flowStepId IS NULL.
 *   - Only count rows that were actually SENT (status ∈ SENT/OPENED/CLICKED,
 *     sentAt IS NOT NULL).
 *
 * For `kind: "campaign"`:
 *   - Match EmailRecipient rows where campaignId = id AND status ∈ SENT/OPENED.
 *
 * Returns a Set<string> of lowercased emails.
 */
async function resolveReceivedEmails(target: { kind: "template" | "campaign"; id: string }): Promise<Set<string>> {
  const out = new Set<string>();

  if (target.kind === "template") {
    // Look up the template to get its stage (for default templates).
    const template = await db.emailStageTemplate.findUnique({
      where: { id: target.id },
      select: { stage: true, name: true },
    });
    if (!template) return out;

    // Match flow-step queue rows: flowStep.templateId = id.
    // AND legacy orchestrator rows: stage = template.stage AND flowStepId IS NULL
    // (only if template.stage is set — custom templates have stage = null).
    const queueWhere: Prisma.EmailQueueWhereInput = {
      status: { in: ["SENT", "OPENED", "CLICKED"] },
      OR: [
        { flowStep: { templateId: target.id } },
        ...(template.stage != null
          ? [{ flowStepId: null, stage: template.stage }]
          : []),
      ],
    };
    const queues = await db.emailQueue.findMany({
      where: queueWhere,
      select: { email: true },
    });
    queues.forEach((q) => {
      if (q.email) out.add(q.email.toLowerCase());
    });
    return out;
  }

  // Campaign — EmailRecipient
  const recipients = await db.emailRecipient.findMany({
    where: {
      campaignId: target.id,
      status: { in: ["SENT", "BOUNCED"] }, // SENT includes opened/clicked; BOUNCED counts as "sent attempt"
      // Actually for "received" we want only successful sends:
    },
    select: { email: true, status: true },
  });
  // Only count successful sends (exclude BOUNCED).
  recipients
    .filter((r) => r.status !== "BOUNCED")
    .forEach((r) => out.add(r.email.toLowerCase()));
  return out;
}

/**
 * Find the set of emails that OPENED the target email.
 *
 * For templates: EmailQueue where the target match (see resolveReceivedEmails)
 * AND (openedAt IS NOT NULL OR status ∈ OPENED/CLICKED).
 *
 * For campaigns: EmailRecipient where openCount > 0 OR firstOpenedAt IS NOT NULL.
 */
async function resolveOpenedEmails(target: { kind: "template" | "campaign"; id: string }): Promise<Set<string>> {
  const out = new Set<string>();

  if (target.kind === "template") {
    const template = await db.emailStageTemplate.findUnique({
      where: { id: target.id },
      select: { stage: true },
    });
    if (!template) return out;

    const queues = await db.emailQueue.findMany({
      where: {
        OR: [
          { NOT: { openedAt: null } },
          { status: { in: ["OPENED", "CLICKED"] } },
        ],
        AND: [
          {
            OR: [
              { flowStep: { templateId: target.id } },
              ...(template.stage != null
                ? [{ flowStepId: null, stage: template.stage }]
                : []),
            ],
          },
        ],
      },
      select: { email: true },
    });
    queues.forEach((q) => {
      if (q.email) out.add(q.email.toLowerCase());
    });
    return out;
  }

  const recipients = await db.emailRecipient.findMany({
    where: {
      campaignId: target.id,
      OR: [{ openCount: { gt: 0 } }, { NOT: { firstOpenedAt: null } }],
    },
    select: { email: true },
  });
  recipients.forEach((r) => out.add(r.email.toLowerCase()));
  return out;
}

/**
 * Find the set of emails that CLICKED in the target email.
 *
 * For templates: EmailQueue where clickedAt IS NOT NULL OR status = CLICKED.
 * For campaigns: EmailRecipient where clickCount > 0 OR firstClickedAt IS NOT NULL.
 */
async function resolveClickedEmails(target: { kind: "template" | "campaign"; id: string }): Promise<Set<string>> {
  const out = new Set<string>();

  if (target.kind === "template") {
    const template = await db.emailStageTemplate.findUnique({
      where: { id: target.id },
      select: { stage: true },
    });
    if (!template) return out;

    const queues = await db.emailQueue.findMany({
      where: {
        OR: [{ NOT: { clickedAt: null } }, { status: "CLICKED" }],
        AND: [
          {
            OR: [
              { flowStep: { templateId: target.id } },
              ...(template.stage != null
                ? [{ flowStepId: null, stage: template.stage }]
                : []),
            ],
          },
        ],
      },
      select: { email: true },
    });
    queues.forEach((q) => {
      if (q.email) out.add(q.email.toLowerCase());
    });
    return out;
  }

  const recipients = await db.emailRecipient.findMany({
    where: {
      campaignId: target.id,
      OR: [{ clickCount: { gt: 0 } }, { NOT: { firstClickedAt: null } }],
    },
    select: { email: true },
  });
  recipients.forEach((r) => out.add(r.email.toLowerCase()));
  return out;
}

/**
 * Compute the email set for a single engagement rule.
 *
 * - "opened"     → openedEmails (received AND opened)
 * - "notOpened"  → receivedEmails − openedEmails (received AND NOT opened)
 * - "clicked"    → clickedEmails (received AND clicked)
 * - "notClicked" → receivedEmails − clickedEmails (received AND NOT clicked)
 */
async function resolveEngagementEmails(
  behavior: EngagementBehavior,
  target: { kind: "template" | "campaign"; id: string },
): Promise<Set<string>> {
  if (behavior === "opened") return resolveOpenedEmails(target);
  if (behavior === "clicked") return resolveClickedEmails(target);

  // notOpened / notClicked — need received minus the positive set.
  const [received, positive] = await Promise.all([
    resolveReceivedEmails(target),
    behavior === "notOpened"
      ? resolveOpenedEmails(target)
      : resolveClickedEmails(target),
  ]);
  const positiveLower = new Set(
    Array.from(positive).map((e) => e.toLowerCase()),
  );
  const out = new Set<string>();
  for (const email of received) {
    if (!positiveLower.has(email)) out.add(email);
  }
  return out;
}

/**
 * Walk the spec, find all engagement rules, pre-compute their email sets in
 * parallel, and return the EngagementContext map keyed by `${groupIdx}:${ruleIdx}`.
 */
async function buildEngagementContext(spec: AudienceFilterSpec): Promise<EngagementContext> {
  const tasks: { key: string; behavior: EngagementBehavior; target: { kind: "template" | "campaign"; id: string } }[] = [];

  spec.groups.forEach((group, gIdx) => {
    group.rules.forEach((rule, rIdx) => {
      if (!isEngagementField(rule.field)) return;
      const behavior = ENGAGEMENT_FIELD_TO_BEHAVIOR[rule.field];
      const target = parseEngagementValue(rule.value);
      if (!target) return; // invalid value — skip (rule will match nothing)
      tasks.push({ key: `${gIdx}:${rIdx}`, behavior, target });
    });
  });

  if (tasks.length === 0) {
    return { emailSets: new Map() };
  }

  const results = await Promise.all(
    tasks.map(async (t) => ({
      key: t.key,
      set: await resolveEngagementEmails(t.behavior, t.target),
    })),
  );

  const emailSets = new Map<string, Set<string>>();
  results.forEach((r) => emailSets.set(r.key, r.set));
  return { emailSets };
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
 *
 * Engagement rules (e.g. `__emailOpened`) are pre-resolved to email sets
 * against EmailQueue / EmailRecipient tracking data, then injected as
 * `email: { in: [...] }` filters.
 */
export async function resolveAudienceEmails(spec: AudienceFilterSpec): Promise<string[]> {
  const emailSet = new Set<string>();
  const ctx = await buildEngagementContext(spec);

  if (spec.source === "users" || spec.source === "users_and_rsvps") {
    const userWhere = buildUserWhere(spec, ctx);
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
    const rsvpWhere = buildRsvpWhere(spec, ctx);
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
