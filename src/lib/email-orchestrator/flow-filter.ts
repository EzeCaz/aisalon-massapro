/**
 * Filter evaluator for EmailFlowStep.filterJson.
 *
 * Supports nested AND/OR/NOT with leaf predicates on User + EventRsvp
 * fields. Leaf predicates can target:
 *   - User: company, companyUrl, interestedIn, profileCategories,
 *           appliedFor, invitedToSpeak, role, title, email
 *   - EventRsvp: status, checkedInAt, attendedAt, doorCheckedAt, noShow
 *
 * The filter is re-evaluated at each step's send time. If a user no
 * longer matches, the run is halted with reason "filter_failed".
 */

import type { Prisma } from "@prisma/client";

export type Filter =
  | { op: "AND"; children: Filter[] }
  | { op: "OR"; children: Filter[] }
  | { op: "NOT"; child: Filter }
  | { field: FilterField; op: LeafOp; value?: string | string[] };

export type FilterField =
  | "company"
  | "companyUrl"
  | "interestedIn"
  | "profileCategories"
  | "appliedFor"
  | "invitedToSpeak"
  | "role"
  | "email"
  | "rsvpStatus"
  | "checkedInAt"
  | "attendedAt"
  | "doorCheckedAt"
  | "noShow";

export type LeafOp =
  | "EQ"
  | "NEQ"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "IN"
  | "NOT_IN"
  | "CONTAINS_ANY"
  | "CONTAINS_ALL"
  | "IS_NULL"
  | "NOT_NULL";

export type FilterContext = {
  user: {
    company?: string | null;
    companyUrl?: string | null;
    interestedIn?: string | null;
    profileCategories?: string | null;
    appliedFor?: string | null;
    invitedToSpeak?: string | null;
    role: string;
    email: string;
  };
  rsvp: {
    status: string;
    checkedInAt?: Date | null;
    attendedAt?: Date | null;
    doorCheckedAt?: Date | null;
    noShow: boolean;
  };
};

/** Parse a JSON filter string. Returns null if empty/invalid. */
export function parseFilter(json: string | null | undefined): Filter | null {
  if (!json || !json.trim()) return null;
  try {
    return JSON.parse(json) as Filter;
  } catch {
    console.error("[flow-filter] invalid filterJson:", json);
    return null;
  }
}

/** Evaluate a filter against a context. Returns true if it matches. */
export function evaluateFilter(filter: Filter | null, ctx: FilterContext): boolean {
  if (!filter) return true; // no filter = always passes

  switch (filter.op) {
    case "AND":
      return filter.children.every((c) => evaluateFilter(c, ctx));
    case "OR":
      return filter.children.some((c) => evaluateFilter(c, ctx));
    case "NOT":
      return !evaluateFilter(filter.child, ctx);
    default:
      return evaluateLeaf(filter, ctx);
  }
}

function evaluateLeaf(filter: Extract<Filter, { field: FilterField }>, ctx: FilterContext): boolean {
  const value = resolveField(filter.field, ctx);
  const target = filter.value;

  switch (filter.op) {
    case "IS_NULL":
      return value == null || value === "";
    case "NOT_NULL":
      return value != null && value !== "";
    case "EQ":
      return normalize(value) === normalize(target);
    case "NEQ":
      return normalize(value) !== normalize(target);
    case "CONTAINS":
      return typeof value === "string" && typeof target === "string"
        ? value.toLowerCase().includes(target.toLowerCase())
        : false;
    case "NOT_CONTAINS":
      return typeof value === "string" && typeof target === "string"
        ? !value.toLowerCase().includes(target.toLowerCase())
        : true;
    case "IN":
      return Array.isArray(target) && target.map(normalize).includes(normalize(value));
    case "NOT_IN":
      return Array.isArray(target) && !target.map(normalize).includes(normalize(value));
    case "CONTAINS_ANY": {
      // For comma-separated fields (interestedIn, profileCategories).
      // Target is an array; field value is "a, b, c" → split.
      if (typeof value !== "string" || !Array.isArray(target)) return false;
      const parts = value.split(",").map((p) => p.trim().toLowerCase());
      return target.some((t) => parts.includes(String(t).toLowerCase()));
    }
    case "CONTAINS_ALL": {
      if (typeof value !== "string" || !Array.isArray(target)) return false;
      const parts = value.split(",").map((p) => p.trim().toLowerCase());
      return target.every((t) => parts.includes(String(t).toLowerCase()));
    }
    default:
      return false;
  }
}

function resolveField(field: FilterField, ctx: FilterContext): string | null | undefined {
  switch (field) {
    case "company":
      return ctx.user.company;
    case "companyUrl":
      return ctx.user.companyUrl;
    case "interestedIn":
      return ctx.user.interestedIn;
    case "profileCategories":
      return ctx.user.profileCategories;
    case "appliedFor":
      return ctx.user.appliedFor;
    case "invitedToSpeak":
      return ctx.user.invitedToSpeak;
    case "role":
      return ctx.user.role;
    case "email":
      return ctx.user.email;
    case "rsvpStatus":
      return ctx.rsvp.status;
    case "checkedInAt":
      return ctx.rsvp.checkedInAt ? "1" : null;
    case "attendedAt":
      return ctx.rsvp.attendedAt ? "1" : null;
    case "doorCheckedAt":
      return ctx.rsvp.doorCheckedAt ? "1" : null;
    case "noShow":
      return ctx.rsvp.noShow ? "1" : null;
    default:
      return null;
  }
}

function normalize(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(normalize).join(",");
  return String(v).toLowerCase().trim();
}

/**
 * Build the FilterContext from a User + EventRsvp pair.
 * Falls back gracefully if user is null (e.g. imported RSVPs without
 * an account) — user fields default to empty strings.
 */
export function buildFilterContext(
  user: {
    company?: string | null;
    companyUrl?: string | null;
    interestedIn?: string | null;
    profileCategories?: string | null;
    appliedFor?: string | null;
    invitedToSpeak?: string | null;
    role: string;
    email: string;
  } | null,
  rsvp: {
    status: string;
    email: string;
    checkedInAt?: Date | null;
    attendedAt?: Date | null;
    doorCheckedAt?: Date | null;
    noShow?: boolean;
  },
): FilterContext {
  return {
    user: user ?? {
      role: "MEMBER",
      email: rsvp.email,
    },
    rsvp: {
      status: rsvp.status,
      checkedInAt: rsvp.checkedInAt ?? null,
      attendedAt: rsvp.attendedAt ?? null,
      doorCheckedAt: rsvp.doorCheckedAt ?? null,
      noShow: rsvp.noShow ?? false,
    },
  };
}
