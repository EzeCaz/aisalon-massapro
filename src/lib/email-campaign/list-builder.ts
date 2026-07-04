/**
 * Email Campaign library — list builder.
 *
 * Resolves a campaign's `listSource` + `listConfigJson` into a concrete
 * list of recipients (email + name + optional userId). Used by:
 *   - the admin "preview list" endpoint (count + sample before send)
 *   - the send worker (creates EmailRecipient rows)
 *
 * List sources:
 *   "all_members"    — Users with at least one MemberTag, role MEMBER
 *   "non_members"    — Users without any MemberTag (DB) + any external
 *                       emails supplied in listConfig.externalEmails
 *   "event_rsvp"     — EventRsvp rows for a specific event, filtered
 *                       by status (GOING / MAYBE / WAITLIST etc.)
 *   "manual_upload"  — Admin-pasted list of emails (one-off)
 *   "specific_users" — Admin-picked User IDs
 *
 * All list builders DEDUPLICATE by email (case-insensitive) and return
 * recipients in a stable order (email asc).
 */

import { db } from "@/lib/db";

export type Recipient = {
  email: string;
  name: string | null;
  userId: string | null;
};

export type ListSource =
  | "all_members"
  | "non_members"
  | "event_rsvp"
  | "manual_upload"
  | "specific_users";

export type ListConfig = {
  eventId?: string;
  rsvpStatuses?: string[];
  emails?: string[];
  externalEmails?: string[];
  userIds?: string[];
  tags?: string[];
  appliedFor?: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(e.trim());
}

export async function buildRecipientList(
  source: ListSource,
  config: ListConfig
): Promise<Recipient[]> {
  let recipients: Recipient[] = [];

  switch (source) {
    case "all_members":
      recipients = await loadAllMembers(config);
      break;
    case "non_members":
      recipients = await loadNonMembers(config);
      break;
    case "event_rsvp":
      recipients = await loadEventRsvp(config);
      break;
    case "manual_upload":
      recipients = await loadManualUpload(config);
      break;
    case "specific_users":
      recipients = await loadSpecificUsers(config);
      break;
  }

  const seen = new Set<string>();
  const deduped: Recipient[] = [];
  for (const r of recipients) {
    const e = normalizeEmail(r.email);
    if (seen.has(e)) continue;
    if (!isValidEmail(e)) continue;
    seen.add(e);
    deduped.push({ ...r, email: e });
  }

  deduped.sort((a, b) => a.email.localeCompare(b.email));
  return deduped;
}

async function loadAllMembers(config: ListConfig): Promise<Recipient[]> {
  const where: any = { role: "MEMBER", tags: { some: {} } };
  if (config.tags && config.tags.length > 0) {
    where.tags = { some: { label: { in: config.tags } } };
  }
  if (config.appliedFor && config.appliedFor.length > 0) {
    where.appliedFor = { in: config.appliedFor };
  }
  const users = await db.user.findMany({
    where,
    select: { id: true, email: true, name: true },
  });
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    userId: u.id,
  }));
}

async function loadNonMembers(config: ListConfig): Promise<Recipient[]> {
  const where: any = { tags: { none: {} } };
  if (config.appliedFor && config.appliedFor.length > 0) {
    where.appliedFor = { in: config.appliedFor };
  }
  const users = await db.user.findMany({
    where,
    select: { id: true, email: true, name: true },
  });
  const fromDb: Recipient[] = users.map((u) => ({
    email: u.email,
    name: u.name,
    userId: u.id,
  }));

  const external: Recipient[] = (config.externalEmails ?? []).map((e) => ({
    email: e,
    name: null,
    userId: null,
  }));

  return [...fromDb, ...external];
}

async function loadEventRsvp(config: ListConfig): Promise<Recipient[]> {
  if (!config.eventId) return [];
  const statuses =
    config.rsvpStatuses && config.rsvpStatuses.length > 0
      ? config.rsvpStatuses
      : ["GOING", "MAYBE", "WAITLIST"];
  const rsvps = await db.eventRsvp.findMany({
    where: { eventId: config.eventId, status: { in: statuses } },
    select: { email: true, name: true, userId: true },
  });
  return rsvps.map((r) => ({
    email: r.email,
    name: r.name,
    userId: r.userId,
  }));
}

function loadManualUpload(config: ListConfig): Promise<Recipient[]> {
  const raw = config.emails ?? [];
  const out: Recipient[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
    if (m) {
      out.push({ name: m[1].trim() || null, email: m[2].trim(), userId: null });
      continue;
    }
    out.push({ name: null, email: trimmed, userId: null });
  }
  return Promise.resolve(out);
}

async function loadSpecificUsers(config: ListConfig): Promise<Recipient[]> {
  const ids = config.userIds ?? [];
  if (ids.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, name: true },
  });
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    userId: u.id,
  }));
}

export async function previewRecipientList(
  source: ListSource,
  config: ListConfig,
  sampleSize = 10
): Promise<{ total: number; sample: Recipient[] }> {
  const list = await buildRecipientList(source, config);
  return { total: list.length, sample: list.slice(0, sampleSize) };
}
