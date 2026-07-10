"use client";

/**
 * AudiencesClient — admin UI for managing email audiences.
 *
 * Supports two audience kinds:
 *   - STATIC: an explicit list of email addresses (paste / type)
 *   - DYNAMIC: a filter spec (source + AND/OR groups + rules) that resolves
 *     to a live email list at query time. New users/RSVPs that match the
 *     filter are picked up automatically — no need to re-save.
 *
 * Layout:
 *   - Left: list of audiences (Test + custom). Click to edit.
 *   - Right: editor for the selected audience.
 *
 * Live preview: for DYNAMIC audiences, a "Preview" button calls
 * POST /api/email-audiences/preview with the current filter spec and shows
 * the resolved email list + count.
 *
 * The component is embedded as a tab on the /admin/email/flows page.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, Save, Users, Filter, Eye, X, Copy,
  AlertCircle, ListChecks,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the API responses.
// ─────────────────────────────────────────────────────────────────────────────

type FilterOp =
  | "equals" | "not_equals" | "contains" | "not_contains"
  | "starts_with" | "ends_with" | "in" | "not_in"
  | "is_set" | "is_not_set" | "before" | "after";

type FilterRule = { field: string; op: FilterOp; value: string };
type FilterGroup = { combinator: "AND" | "OR"; rules: FilterRule[] };
type FilterSpec = {
  source: "users" | "rsvps" | "users_and_rsvps";
  combinator: "AND" | "OR";
  groups: FilterGroup[];
};

type Audience = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  kind: "STATIC" | "DYNAMIC";
  isTest: boolean;
  emails: string[];
  emailCount?: number;
  emailPreview?: string[];
  filters: FilterSpec | null;
  flowStepsCount: number;
  createdAt: string;
  updatedAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Field catalogue — duplicated from audience-filter.ts (server side) to keep
// the client self-contained. The `eventId` field is upgraded to an `enum`
// whose options are injected at runtime from the live events list (so the
// user can filter by event NAME while the underlying filter still stores
// the event ID).
// ─────────────────────────────────────────────────────────────────────────────

type FieldDef = {
  field: string;
  label: string;
  type: "string" | "enum" | "boolean" | "date" | "engagement";
  options?: { value: string; label: string }[];
};

// Email-target option for engagement rules, returned by
// GET /api/email-audiences/email-options.
type EmailOption = {
  value: string;        // "template:<id>" | "campaign:<id>"
  label: string;
  group: string;        // "Templates ..." | "Campaigns ..."
  kind: "template" | "campaign";
};

// Engagement virtual fields — server-side these are intercepted by
// audience-filter.ts and resolved against EmailQueue / EmailRecipient
// tracking data. The value is a composite `kind:id` string picked from
// the EmailOption dropdown.
const ENGAGEMENT_FIELDS: FieldDef[] = [
  { field: "__emailOpened",     label: "✉️  Opened a specific email",        type: "engagement" },
  { field: "__emailNotOpened",  label: "📭  Did NOT open a specific email",  type: "engagement" },
  { field: "__emailClicked",    label: "🖱️  Clicked in a specific email",    type: "engagement" },
  { field: "__emailNotClicked", label: "🚫  Did NOT click in a specific email", type: "engagement" },
];

const USER_FIELDS: FieldDef[] = [
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
  // Engagement virtual fields — see comment block above.
  ...ENGAGEMENT_FIELDS,
];

/**
 * Build the RSVP field catalogue. The `eventId` field is rendered as an
 * `enum` dropdown populated with the live events list — the user picks an
 * event by NAME, but the underlying value stored in the filter spec is the
 * event ID (which is what the server-side resolver applies to
 * EventRsvp.eventId).
 *
 * If the events list is empty (e.g. no events in DB), the field falls back
 * to a free-text string input so admins can still paste an event ID.
 */
function buildRsvpFields(events: { id: string; title: string; startsAt?: string }[]): FieldDef[] {
  const eventOptions = events
    .slice()
    .sort((a, b) => {
      // Sort by start date desc (most recent first); fall back to title.
      if (a.startsAt && b.startsAt) {
        return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
      }
      return a.title.localeCompare(b.title);
    })
    .map((e) => ({
      value: e.id,
      label: e.title + (e.startsAt ? `  ·  ${new Date(e.startsAt).toLocaleDateString()}` : ""),
    }));

  return [
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
    eventOptions.length > 0
      ? { field: "eventId", label: "Event", type: "enum" as const, options: eventOptions }
      : { field: "eventId", label: "Event ID", type: "string" as const },
    { field: "doorCheckedAt", label: "Door checked-in at", type: "date" },
    { field: "attendedAt", label: "Attended at", type: "date" },
    { field: "noShow", label: "No-show", type: "boolean" },
    { field: "createdAt", label: "RSVP created at", type: "date" },
    // Engagement virtual fields — see comment block above.
    ...ENGAGEMENT_FIELDS,
  ];
}

const ALL_OPS: { value: FilterOp; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "in", label: "is any of (comma-separated)" },
  { value: "not_in", label: "is none of (comma-separated)" },
  { value: "is_set", label: "is set (not empty)" },
  { value: "is_not_set", label: "is empty" },
  { value: "before", label: "is before (date)" },
  { value: "after", label: "is after (date)" },
];

function opsForField(field: FieldDef): FilterOp[] {
  switch (field.type) {
    case "boolean":
      return ["equals"];
    case "enum":
      return ["equals", "not_equals", "in", "not_in"];
    case "date":
      return ["before", "after", "is_set", "is_not_set"];
    case "engagement":
      // Engagement rules use a single op — the field name itself encodes the
      // behavior (Opened / NotOpened / Clicked / NotClicked). The value is a
      // `kind:id` composite picked from the email-options dropdown.
      return ["equals"];
    default:
      return ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "in", "not_in", "is_set", "is_not_set"];
  }
}

function fieldsForSource(
  source: FilterSpec["source"],
  events: { id: string; title: string; startsAt?: string }[],
): FieldDef[] {
  if (source === "users") return USER_FIELDS;
  const rsvpFields = buildRsvpFields(events);
  if (source === "rsvps") return rsvpFields;
  // users_and_rsvps — union, dedup by field name. RSVP fields come second so
  // their richer `eventId` enum definition (with event options) wins over the
  // (non-existent) user-side `eventId` definition.
  const seen = new Set<string>();
  const merged: FieldDef[] = [];
  for (const f of [...USER_FIELDS, ...rsvpFields]) {
    if (!seen.has(f.field)) {
      seen.add(f.field);
      merged.push(f);
    }
  }
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function AudiencesClient({
  initialAudiences,
  onAudiencesChange,
  events = [],
}: {
  initialAudiences: Audience[];
  onAudiencesChange?: (audiences: Audience[]) => void;
  /**
   * Live events list (id + title + startsAt). Used to populate the `Event`
   * filter dropdown in the dynamic audience editor. If absent, the eventId
   * field falls back to a free-text input.
   */
  events?: { id: string; title: string; startsAt?: string }[];
}) {
  const [audiences, setAudiences] = React.useState<Audience[]>(initialAudiences);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialAudiences[0]?.id ?? null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Refresh list from server (used after create/update/delete).
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/email-audiences");
      if (!r.ok) throw new Error("Failed to load audiences");
      const data = await r.json();
      setAudiences(data.audiences || []);
      onAudiencesChange?.(data.audiences || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audiences");
    } finally {
      setLoading(false);
    }
  }, [onAudiencesChange]);

  const selected = audiences.find((a) => a.id === selectedId) ?? null;

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/email-audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Untitled audience ${audiences.length + 1}`,
          kind: "STATIC",
          emails: ["example@example.com"],
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to create audience");
      }
      const data = await r.json();
      await refresh();
      setSelectedId(data.audience.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create audience");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this audience? Flow steps using it will lose the audience reference.")) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/email-audiences/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to delete");
      }
      if (selectedId === id) setSelectedId(null);
      await refresh();
      toast.success("Audience deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete audience");
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (a: Audience) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: `${a.name} (copy)`,
        kind: a.kind,
        description: a.description,
      };
      if (a.kind === "STATIC") body.emails = a.emails;
      else body.filters = a.filters;
      const r = await fetch("/api/email-audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to duplicate");
      }
      const data = await r.json();
      await refresh();
      setSelectedId(data.audience.id);
      toast.success("Audience duplicated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate audience");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Left sidebar — audience list */}
      <div className="flex w-72 shrink-0 flex-col">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="mb-3 inline-flex items-center justify-center gap-2 rounded bg-[#FF005A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New audience
        </button>

        <div className="flex-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
          {loading && audiences.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : audiences.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <Users className="mb-2 h-12 w-12 text-neutral-300" />
              <p className="text-sm font-semibold text-neutral-700">No audiences</p>
              <p className="text-xs text-neutral-500">Create one to get started.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {audiences.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelectedId(a.id)}
                    className={`flex w-full flex-col items-start gap-1 px-3 py-3 text-left hover:bg-neutral-50 ${
                      selectedId === a.id ? "border-l-2 border-[#FF005A] bg-[#FF005A]/[0.04]" : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="flex-1 truncate text-sm font-semibold text-neutral-900">{a.name}</span>
                      {a.isTest && (
                        <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">TEST</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        a.kind === "DYNAMIC" ? "bg-[#00E6FF]/30 text-black" : "bg-neutral-200 text-neutral-700"
                      }`}>
                        {a.kind}
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {a.kind === "STATIC"
                        ? `${a.emails.length} email${a.emails.length === 1 ? "" : "s"}`
                        : a.emailCount !== undefined
                          ? <>
                              <span className="font-semibold text-[#FF005A]">{a.emailCount} email{a.emailCount === 1 ? "" : "s"}</span>
                              {a.emailPreview && a.emailPreview.length > 0 && (
                                <span className="text-neutral-400"> · {a.emailPreview[0]}{a.emailCount > 1 ? ` +${a.emailCount - 1}` : ""}</span>
                              )}
                            </>
                          : a.filters && a.filters.groups.length > 0
                            ? `${a.filters.groups.length} group${a.filters.groups.length === 1 ? "" : "s"} · ${a.filters.source}`
                            : "no filters"}
                      {" · "}{a.flowStepsCount} flow step{a.flowStepsCount === 1 ? "" : "s"}
                    </div>
                  </button>
                  <div className="flex justify-end gap-2 px-3 pb-2">
                    <button
                      onClick={() => handleDuplicate(a)}
                      className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-[#FF005A]"
                    >
                      <Copy className="h-3 w-3" /> Duplicate
                    </button>
                    {!a.isTest && (
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right — editor */}
      <div className="flex-1 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {error && (
          <div className="m-4 flex items-center gap-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {selected ? (
          <AudienceEditor
            key={selected.id}
            audience={selected}
            events={events}
            onSaved={() => refresh()}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Users className="mb-2 h-16 w-16 text-neutral-200" />
            <p className="text-lg font-semibold text-neutral-700">No audience selected</p>
            <p className="text-sm text-neutral-500">Pick an audience on the left, or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audience editor
// ─────────────────────────────────────────────────────────────────────────────

function AudienceEditor({
  audience,
  events = [],
  onSaved,
}: {
  audience: Audience;
  events?: { id: string; title: string; startsAt?: string }[];
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(audience.name);
  const [description, setDescription] = React.useState(audience.description ?? "");
  const [kind, setKind] = React.useState<"STATIC" | "DYNAMIC">(audience.kind);
  const [emailsText, setEmailsText] = React.useState(audience.emails.join("\n"));
  const [filters, setFilters] = React.useState<FilterSpec>(
    audience.filters ?? {
      source: "users",
      combinator: "AND",
      groups: [{ combinator: "AND", rules: [{ field: "email", op: "contains", value: "" }] }],
    },
  );
  const [saving, setSaving] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewEmails, setPreviewEmails] = React.useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // Reset state when audience changes (different ID).
  React.useEffect(() => {
    setName(audience.name);
    setDescription(audience.description ?? "");
    setKind(audience.kind);
    setEmailsText(audience.emails.join("\n"));
    if (audience.filters) setFilters(audience.filters);
  }, [audience.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        description: description || null,
        kind,
      };
      if (kind === "STATIC") {
        const emails = emailsText
          .split(/[\n,]/)
          .map((e) => e.trim())
          .filter((e) => e && e.includes("@"));
        body.emails = emails;
      } else {
        body.filters = filters;
      }
      const r = await fetch(`/api/email-audiences/${audience.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to save");
      }
      toast.success("Audience saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save audience");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      if (kind === "STATIC") {
        const emails = emailsText
          .split(/[\n,]/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e && e.includes("@"));
        setPreviewEmails(emails);
      } else {
        const r = await fetch("/api/email-audiences/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters }),
        });
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || "Preview failed");
        }
        const data = await r.json();
        setPreviewEmails(data.emails || []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
      setPreviewEmails([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Audience name"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-lg font-bold"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "STATIC" | "DYNAMIC")}
            disabled={audience.isTest}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm font-semibold"
            title={audience.isTest ? "Built-in Test audience is always STATIC" : ""}
          >
            <option value="STATIC">STATIC (list of emails)</option>
            <option value="DYNAMIC">DYNAMIC (filter spec)</option>
          </select>
          <button
            onClick={handlePreview}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded bg-[#FF005A] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="mt-2 w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
        />
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto p-6">
        {kind === "STATIC" ? (
          <StaticEditor emailsText={emailsText} setEmailsText={setEmailsText} />
        ) : (
          <DynamicEditor filters={filters} setFilters={setFilters} events={events} />
        )}
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <PreviewDialog
          emails={previewEmails}
          loading={previewLoading}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Static editor
// ─────────────────────────────────────────────────────────────────────────────

function StaticEditor({
  emailsText,
  setEmailsText,
}: {
  emailsText: string;
  setEmailsText: (s: string) => void;
}) {
  const count = emailsText.split(/[\n,]/).map((e) => e.trim()).filter((e) => e && e.includes("@")).length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-neutral-500" />
        <h3 className="text-sm font-bold text-neutral-800">Email addresses</h3>
        <span className="text-xs text-neutral-500">({count} valid email{count === 1 ? "" : "s"})</span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        One email per line (or comma-separated). Emails are normalized to lowercase and de-duplicated on save.
      </p>
      <textarea
        value={emailsText}
        onChange={(e) => setEmailsText(e.target.value)}
        rows={18}
        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
        placeholder={"eze@massapro.com\nezeszna@gmail.com\neze@hi4.ai"}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic editor — filter builder
// ─────────────────────────────────────────────────────────────────────────────

function DynamicEditor({
  filters,
  setFilters,
  events = [],
}: {
  filters: FilterSpec;
  setFilters: (f: FilterSpec) => void;
  events?: { id: string; title: string; startsAt?: string }[];
}) {
  const fields = fieldsForSource(filters.source, events);

  // Load email-target options for engagement rules (templates + campaigns).
  // Fetched once on mount, passed down to every FilterGroupEditor.
  const [emailOptions, setEmailOptions] = React.useState<EmailOption[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/email-audiences/email-options");
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data.options)) {
          setEmailOptions(data.options);
        }
      } catch {
        // silent — engagement rules just won't show options if fetch fails.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateGroup = (idx: number, updater: (g: FilterGroup) => FilterGroup) => {
    setFilters({
      ...filters,
      groups: filters.groups.map((g, i) => (i === idx ? updater(g) : g)),
    });
  };

  const addGroup = () => {
    setFilters({
      ...filters,
      groups: [
        ...filters.groups,
        { combinator: "AND", rules: [{ field: fields[0].field, op: "equals", value: "" }] },
      ],
    });
  };

  const removeGroup = (idx: number) => {
    if (filters.groups.length === 1) {
      toast.error("At least one group is required");
      return;
    }
    setFilters({ ...filters, groups: filters.groups.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-5">
      {/* Source + combinator */}
      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#FF005A]" />
          <h3 className="text-sm font-bold text-neutral-800">Filter source & combination</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Source</label>
            <select
              value={filters.source}
              onChange={(e) => {
                const newSource = e.target.value as FilterSpec["source"];
                const newFields = fieldsForSource(newSource, events);
                setFilters({
                  ...filters,
                  source: newSource,
                  // Reset rules whose field isn't in the new source's field list
                  groups: filters.groups.map((g) => ({
                    ...g,
                    rules: g.rules
                      .filter((r) => newFields.some((f) => f.field === r.field))
                      .concat(
                        // If all rules were filtered out, add a placeholder
                        g.rules.filter((r) => newFields.some((f) => f.field === r.field)).length === 0
                          ? [{ field: newFields[0].field, op: "equals", value: "" }]
                          : [],
                      ),
                  })),
                });
              }}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="users">Users (members)</option>
              <option value="rsvps">RSVPs (registrations)</option>
              <option value="users_and_rsvps">Both (union, de-duplicated)</option>
            </select>
            <p className="mt-1 text-[10px] text-neutral-500">
              Where to pull emails from. &ldquo;Both&rdquo; merges User.email + UserEmail.email + EventRsvp.email.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Combine groups with</label>
            <select
              value={filters.combinator}
              onChange={(e) => setFilters({ ...filters, combinator: e.target.value as "AND" | "OR" })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="AND">AND (must match ALL groups)</option>
              <option value="OR">OR (must match ANY group)</option>
            </select>
            <p className="mt-1 text-[10px] text-neutral-500">
              How groups combine. Inside a group, rules combine by the group&rsquo;s own combinator.
            </p>
          </div>
        </div>
      </section>

      {/* Filter groups */}
      {filters.groups.map((group, gIdx) => (
        <FilterGroupEditor
          key={gIdx}
          group={group}
          fields={fields}
          emailOptions={emailOptions}
          onChange={(g) => updateGroup(gIdx, () => g)}
          onRemove={() => removeGroup(gIdx)}
          canRemove={filters.groups.length > 1}
          groupNumber={gIdx + 1}
        />
      ))}

      <button
        onClick={addGroup}
        className="inline-flex items-center gap-1.5 rounded border border-dashed border-neutral-400 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:border-[#FF005A] hover:text-[#FF005A]"
      >
        <Plus className="h-4 w-4" /> Add group
      </button>
    </div>
  );
}

function FilterGroupEditor({
  group,
  fields,
  emailOptions = [],
  onChange,
  onRemove,
  canRemove,
  groupNumber,
}: {
  group: FilterGroup;
  fields: FieldDef[];
  emailOptions?: EmailOption[];
  onChange: (g: FilterGroup) => void;
  onRemove: () => void;
  canRemove: boolean;
  groupNumber: number;
}) {
  const updateRule = (idx: number, patch: Partial<FilterRule>) => {
    onChange({
      ...group,
      rules: group.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    });
  };
  const addRule = () => {
    onChange({
      ...group,
      rules: [...group.rules, { field: fields[0].field, op: "equals", value: "" }],
    });
  };
  const removeRule = (idx: number) => {
    if (group.rules.length === 1) {
      toast.error("A group must have at least one rule");
      return;
    }
    onChange({ ...group, rules: group.rules.filter((_, i) => i !== idx) });
  };

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-white">
          {groupNumber}
        </span>
        <h4 className="text-sm font-bold text-neutral-800">Group</h4>
        <select
          value={group.combinator}
          onChange={(e) => onChange({ ...group, combinator: e.target.value as "AND" | "OR" })}
          className="ml-2 rounded border border-neutral-300 px-2 py-0.5 text-xs font-semibold"
        >
          <option value="AND">Match ALL rules (AND)</option>
          <option value="OR">Match ANY rule (OR)</option>
        </select>
        {canRemove && (
          <button
            onClick={onRemove}
            className="ml-auto inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" /> Remove group
          </button>
        )}
      </div>

      <div className="space-y-2">
        {group.rules.map((rule, rIdx) => {
          const field = fields.find((f) => f.field === rule.field);
          const ops = field ? opsForField(field) : [];
          const isUnary = rule.op === "is_set" || rule.op === "is_not_set";
          return (
            <div key={rIdx} className="flex items-start gap-2">
              <select
                value={rule.field}
                onChange={(e) => {
                  const newField = fields.find((f) => f.field === e.target.value);
                  const newOps = newField ? opsForField(newField) : [];
                  updateRule(rIdx, {
                    field: e.target.value,
                    op: newOps[0],
                    value: newField?.type === "boolean" ? "true" : "",
                  });
                }}
                className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {/* Group user/rsvp fields first, engagement fields last under a separate header */}
                <optgroup label="Profile / RSVP fields">
                  {fields.filter((f) => f.type !== "engagement").map((f) => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </optgroup>
                {fields.some((f) => f.type === "engagement") && (
                  <optgroup label="Email engagement (open / click)">
                    {fields.filter((f) => f.type === "engagement").map((f) => (
                      <option key={f.field} value={f.field}>{f.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <select
                value={rule.op}
                onChange={(e) => updateRule(rIdx, { op: e.target.value as FilterOp, value: isUnary ? "" : rule.value })}
                className="w-40 rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {ops.map((op) => (
                  <option key={op} value={op}>{ALL_OPS.find((o) => o.value === op)?.label ?? op}</option>
                ))}
              </select>
              {!isUnary && (
                <>
                  {field?.type === "engagement" ? (
                    <select
                      value={rule.value}
                      onChange={(e) => updateRule(rIdx, { value: e.target.value })}
                      className="flex-1 rounded border border-[#FF005A]/40 bg-[#FF005A]/[0.04] px-2 py-1 text-sm"
                      disabled={emailOptions.length === 0}
                    >
                      <option value="">— select email —</option>
                      {/* Group options by their `group` field (Templates, Campaigns) */}
                      {Object.entries(
                        emailOptions.reduce<Record<string, EmailOption[]>>((acc, o) => {
                          (acc[o.group] ??= []).push(o);
                          return acc;
                        }, {}),
                      ).map(([groupName, opts]) => (
                        <optgroup key={groupName} label={groupName}>
                          {opts.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : field?.type === "enum" && field.options ? (
                    <select
                      value={rule.value}
                      onChange={(e) => updateRule(rIdx, { value: e.target.value })}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="">— select —</option>
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : field?.type === "boolean" ? (
                    <select
                      value={rule.value || "true"}
                      onChange={(e) => updateRule(rIdx, { value: e.target.value })}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : field?.type === "date" ? (
                    <input
                      type="datetime-local"
                      value={rule.value}
                      onChange={(e) => updateRule(rIdx, { value: e.target.value })}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => updateRule(rIdx, { value: e.target.value })}
                      placeholder="value"
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                  )}
                </>
              )}
              <button
                onClick={() => removeRule(rIdx)}
                className="text-neutral-400 hover:text-red-500"
                title="Remove rule"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={addRule}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#FF005A] hover:underline"
      >
        <Plus className="h-3 w-3" /> Add rule
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview dialog
// ─────────────────────────────────────────────────────────────────────────────

function PreviewDialog({
  emails,
  loading,
  onClose,
}: {
  emails: string[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-[520px] overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
          <h3 className="text-lg font-bold">
            Preview {loading ? "" : `(${emails.length} email${emails.length === 1 ? "" : "s"})`}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Resolving emails…
            </div>
          ) : emails.length === 0 ? (
            <div className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
              No emails match the current filter.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
              {emails.map((e) => (
                <li key={e} className="px-3 py-1.5 font-mono text-xs text-neutral-700">{e}</li>
              ))}
            </ul>
          )}
          {!loading && emails.length > 0 && (
            <p className="mt-4 text-[10px] text-neutral-500">
              Note: this is a live snapshot. The actual audience is re-resolved each time a flow step fires,
              so new matching users/RSVPs are picked up automatically.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
