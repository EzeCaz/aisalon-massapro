"use client";

/**
 * TemplatesClient — admin UI for managing EmailStageTemplate rows.
 *
 * Features:
 *   - List all templates (5 seeded defaults + admin-created custom templates).
 *   - Edit subject + HTML body inline (full editor dialog).
 *   - Duplicate any template (creates a copy with stage=null, name="X (copy)").
 *   - Delete custom templates (defaults can only be deactivated).
 *   - Per-template metrics dialog: sent/opened/clicked/failed + by-variant
 *     + by-flow breakdown + recent sends list.
 *   - Live preview of the rendered HTML (iframe srcdoc).
 *
 * TSK-0074 Phase 4 — template editor upgrade:
 *   - "New template" opens a choice dialog: start blank OR copy from an
 *     existing template (calls /duplicate, then opens the editor for the
 *     new copy).
 *   - Editor has a Logo URL field (with thumbnail preview) ABOVE the body.
 *   - Below the body WYSIWYG: a "Mobile overrides (CSS/HTML)" textarea for
 *     per-template mobile-only tweaks (wrapped in @media (max-width:600px)
 *     by the unified renderer).
 *   - Below the editor: a persistent preview pane with Desktop (600px) and
 *     Mobile (375px) tabs. The iframe srcdoc is produced by the SAME
 *     `renderUnifiedEmail` pipeline used at send time, so the preview
 *     matches production rendering 1:1 (logo top-right, mobile overrides
 *     applied, unsubscribe footer present, tokens substituted with sample
 *     values). Re-renders are debounced 300ms after edits.
 *
 * Embedded as a tab on the /admin/email/flows page.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, X, Copy, Pencil,
  AlertCircle, FileText, BarChart3, Power, Save as SaveIcon, FilePlus2,
  Upload, RotateCcw, Monitor, Smartphone,
} from "lucide-react";
import { RichTextEmailEditor } from "@/components/ais/rich-text-email-editor";
import {
  DEFAULT_BRAND_LOGO_URL,
  resolveLogoUrl,
  buildLogoBlock,
} from "@/lib/email-orchestrator/templates";
import { renderUnifiedEmail, type UnifiedRenderContext } from "@/lib/email/render-unified";

// Full template type — fetched from /api/email-templates (not the
// minimal FlowTemplate shape used by the flow builder).
type Template = {
  id: string;
  stage: number | null;
  name: string;
  subject: string;
  htmlBody: string;
  stopIfNotOpenedHours: number | null;
  // Feature 1: no-code variant
  noCodeSubject?: string | null;
  noCodeHtmlBody?: string | null;
  // Feature 2: logo override
  logoUrl?: string | null;
  // Feature 3: alt-subject re-send
  altSubject?: string | null;
  altNotOpenedHours?: number | null;
  // TSK-0074 Phase 4: mobile-only CSS/HTML overrides (wrapped in
  // @media (max-width:600px) by the unified renderer).
  mobileOverridesHtml?: string | null;
  isActive: boolean;
  isDefault?: boolean;
  flowStepsCount: number;
  updatedAt: string;
  updatedBy?: string | null;
};

type Props = {
  // Initial templates from the server (minimal shape — used only for first
  // paint; the client fetches the full list with htmlBody on mount).
  templates: Template[];
  // Notify parent of changes (so the Flows tab's template dropdown updates).
  onTemplatesChange: (t: { id: string; name: string; subject: string; stage: number | null; isDefault?: boolean; isActive?: boolean }[]) => void;
};

export function TemplatesClient({ templates, onTemplatesChange }: Props) {
  const [list, setList] = React.useState<Template[]>(templates);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<Template | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [metricsFor, setMetricsFor] = React.useState<Template | null>(null);
  // TSK-0074 Phase 4: "New template" choice dialog (start blank vs copy
  // from existing). When the user picks "copy from existing" + a source
  // template, we POST /api/email-templates/[id]/duplicate and open the
  // editor for the freshly-created copy.
  const [choiceOpen, setChoiceOpen] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);

  // Keep the latest onTemplatesChange callback in a ref so we don't have to
  // depend on its identity in the sync effect below. The parent passes an
  // inline arrow function on every render, which would otherwise cause an
  // infinite update loop (parent setState -> parent re-render -> new callback
  // identity -> effect re-fires -> parent setState -> ...).
  const onTemplatesChangeRef = React.useRef(onTemplatesChange);
  onTemplatesChangeRef.current = onTemplatesChange;

  // Track the last summary we pushed up so we only call onTemplatesChange
  // when the meaningful content actually changed (id + name + subject + stage
  // + isActive + isDefault + updatedAt).
  const lastSummaryRef = React.useRef<string>("");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/email-templates");
      if (!r.ok) throw new Error("Failed to load templates");
      const data = await r.json();
      const next = (data.templates || []) as Template[];
      setList(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch the full template list (with htmlBody) on mount.
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Push template list changes up to parent (so flow builder dropdown updates).
  // Only fires when the meaningful content actually changes — NOT when the
  // onTemplatesChange callback identity changes (which happens on every parent
  // re-render and would otherwise cause a Maximum update depth exceeded loop).
  React.useEffect(() => {
    const summary = list
      .map((t) => `${t.id}|${t.name}|${t.subject}|${t.stage ?? ""}|${t.isActive ? 1 : 0}|${t.isDefault ? 1 : 0}|${t.updatedAt}`)
      .join("||");
    if (summary === lastSummaryRef.current) return;
    lastSummaryRef.current = summary;
    onTemplatesChangeRef.current(list);
  }, [list]);

  const handleDuplicate = async (t: Template) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/email-templates/${t.id}/duplicate`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to duplicate");
      }
      toast.success("Template duplicated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate template");
    } finally {
      setLoading(false);
    }
  };

  // TSK-0074 Phase 4: duplicate-from-existing on "New template" →
  // POST /duplicate for the chosen source, then open the editor for
  // the freshly-created copy. The duplicate route copies ALL feature
  // fields (logo, mobile overrides, no-code variant, alt-subject) so
  // the admin can tweak the copy without rebuilding everything.
  const handleDuplicateToNew = async (sourceId: string) => {
    setDuplicating(true);
    try {
      const r = await fetch(`/api/email-templates/${sourceId}/duplicate`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to duplicate");
      }
      const data = await r.json();
      const copy: Template = data.template;
      await refresh();
      setChoiceOpen(false);
      toast.success("Created from copy — edit below", {
        description: copy.name,
      });
      setEditing(copy);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate template");
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async (t: Template) => {
    if (t.isDefault) {
      toast.error("Seeded templates cannot be deleted. Deactivate instead.");
      return;
    }
    if (!confirm(`Delete "${t.name}"? Flow steps using it will lose the template reference.`)) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/email-templates/${t.id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to delete");
      }
      toast.success("Template deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete template");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (t: Template) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/email-templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to toggle");
      }
      toast.success(t.isActive ? "Template deactivated" : "Template activated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle template");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Email templates</h2>
          <p className="text-sm text-neutral-500">
            Edit the 5 stage templates (Awareness, Reminder, Final Prep, Day-Of, Recap) or create custom templates.
            All templates are selectable in the flow step editor.
          </p>
        </div>
        <button
          onClick={() => setChoiceOpen(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded bg-[#FF005A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Stage</th>
              <th className="px-3 py-2.5 text-left font-semibold">Name</th>
              <th className="px-3 py-2.5 text-left font-semibold">Subject</th>
              <th className="px-3 py-2.5 text-right font-semibold">Flow steps</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              <th className="px-3 py-2.5 text-left font-semibold">Updated</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                  <FileText className="mx-auto mb-2 h-8 w-8 text-neutral-300" />
                  No templates yet. Create one to get started.
                </td>
              </tr>
            ) : (
              list.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-3 py-2.5">
                    {t.stage ? (
                      <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-bold text-neutral-700">
                        Stage {t.stage}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-[#00E6FF]/30 px-1.5 py-0.5 text-xs font-bold text-black">
                        Custom
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-neutral-900">
                    {t.name}
                    {t.isDefault && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">DEFAULT</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-700 max-w-md truncate">{t.subject}</td>
                  <td className="px-3 py-2.5 text-right text-neutral-700">{t.flowStepsCount}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleToggleActive(t)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.isActive
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {t.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-neutral-500">
                    {new Date(t.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setMetricsFor(t)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-[#FF005A]"
                        title="View metrics"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditing(t)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-[#FF005A]"
                        title="Edit template"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(t)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-[#FF005A]"
                        title="Duplicate"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {!t.isDefault && (
                        <button
                          onClick={() => handleDelete(t)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      )}

      {/* Editor dialog */}
      {editing && (
        <TemplateEditorDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}

      {/* New template — choice dialog (start blank vs copy from existing) */}
      {choiceOpen && (
        <NewTemplateChoiceDialog
          templates={list}
          duplicating={duplicating}
          onClose={() => !duplicating && setChoiceOpen(false)}
          onStartBlank={() => {
            setChoiceOpen(false);
            setCreating(true);
          }}
          onCopyFromExisting={(sourceId) => handleDuplicateToNew(sourceId)}
        />
      )}

      {/* New template dialog */}
      {creating && (
        <TemplateEditorDialog
          template={null}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); refresh(); }}
        />
      )}

      {/* Metrics dialog */}
      {metricsFor && (
        <TemplateMetricsDialog
          template={metricsFor}
          onClose={() => setMetricsFor(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New template — choice dialog (start blank vs copy from existing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NewTemplateChoiceDialog — TSK-0074 Phase 4.
 *
 * When the admin clicks "New template", we no longer drop them straight into
 * a blank editor. Instead, this modal asks: "Start from blank, or copy from
 * an existing template?".
 *
 *   - "Start from blank" → falls through to the existing empty-editor flow
 *     (TemplateEditorDialog with template=null).
 *   - "Copy from existing" → calls POST /api/email-templates/[id]/duplicate,
 *     which copies ALL feature fields (subject, body, logo, mobile overrides,
 *     no-code variant, alt-subject). The duplicate route already names the
 *     copy "<original> (copy)" and sets stage=null, isActive=true. We then
 *     close this dialog and open the editor for the new copy.
 *
 * The dropdown shows id + name + stage for every template in the system
 * (custom templates are tagged "Custom", seeded defaults tagged "Stage N").
 */
function NewTemplateChoiceDialog({
  templates,
  duplicating,
  onClose,
  onStartBlank,
  onCopyFromExisting,
}: {
  templates: Template[];
  duplicating: boolean;
  onClose: () => void;
  onStartBlank: () => void;
  onCopyFromExisting: (sourceId: string) => void;
}) {
  const [sourceId, setSourceId] = React.useState<string>(
    templates[0]?.id ?? "",
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-[560px] max-w-[95vw] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-bold">New template</h3>
          <button
            onClick={onClose}
            disabled={duplicating}
            className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="mb-5 text-sm text-neutral-600">
            Choose how to start. You can always tweak everything after.
          </p>

          {/* Option A: Start from blank */}
          <button
            type="button"
            onClick={onStartBlank}
            disabled={duplicating}
            className="group mb-3 flex w-full items-start gap-3 rounded-lg border border-neutral-300 bg-white p-4 text-left hover:border-[#FF005A] hover:bg-[#FFF1F5]/40 disabled:opacity-50"
          >
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#FF005A]/10 text-[#FF005A]">
              <FilePlus2 className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-neutral-900">Start from blank</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                Empty body, default logo, no mobile overrides. Best when you
                want to author from scratch.
              </div>
            </div>
          </button>

          {/* Option B: Copy from existing */}
          <div className="rounded-lg border border-neutral-300 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#00E6FF]/30 text-black">
                <Copy className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-neutral-900">
                  Copy from an existing template
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  Pre-fills the new template with the chosen template&rsquo;s
                  subject, body, logo, mobile overrides, no-code variant, and
                  alt-subject settings. The copy gets <code>stage=null</code>,
                  <code>isDefault=false</code>, and the name{" "}
                  <code>&ldquo;&lt;original&gt; (copy)&rdquo;</code>.
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-neutral-700">
                Source template
              </label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                disabled={duplicating || templates.length === 0}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                {templates.length === 0 ? (
                  <option value="">No templates available</option>
                ) : (
                  templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.stage ? `[Stage ${t.stage}] ` : "[Custom] "}
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={() => sourceId && onCopyFromExisting(sourceId)}
              disabled={duplicating || !sourceId}
              className="mt-3 inline-flex items-center gap-2 rounded bg-[#FF005A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
            >
              {duplicating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {duplicating ? "Duplicating…" : "Duplicate & edit"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button
            onClick={onClose}
            disabled={duplicating}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview context — sample values used by the Desktop/Mobile preview iframe.
// Same shape the orchestrator's buildContext() produces at send time, but
// filled with realistic placeholder data so the admin sees the email exactly
// as a recipient would (tokens substituted, logo top-right, footer present).
// ─────────────────────────────────────────────────────────────────────────────
// TSK-0074: exported so the CampaignComposer can reuse the same preview
// context (ensures the campaign preview and template preview show identical
// sample data).
export const PREVIEW_CTX: UnifiedRenderContext = {
  firstName: "Friend",
  name: "Friend",
  email: "test@example.com",
  chapterName: "Tel Aviv",
  eventTitle: "AI Salon Demo Event",
  eventDate: "Tue, Mar 12, 2025 · 6:00 PM",
  eventVenue: "Tel Aviv Innovation Lab",
  eventAddress: "Rothschild 1, Tel Aviv",
  eventUrl: "https://aisalon.massapro.com/e/demo",
  myCodeUrl: "https://aisalon.massapro.com/e/demo/my-code",
  checkInCode: "ABCD-1234",
  speakers: "Jane Doe, John Smith",
  agenda:
    "• 6:00 PM — Doors\n• 6:30 PM — Intro\n• 7:00 PM — Panel\n• 8:00 PM — Networking",
};

// ─────────────────────────────────────────────────────────────────────────────
// Template editor dialog (also handles "create new")
// ─────────────────────────────────────────────────────────────────────────────

function TemplateEditorDialog({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(template?.name ?? "");
  const [subject, setSubject] = React.useState(template?.subject ?? "");
  const [htmlBody, setHtmlBody] = React.useState(template?.htmlBody ?? "");
  const [stopIfNotOpenedHours, setStopIfNotOpenedHours] = React.useState<number | null>(template?.stopIfNotOpenedHours ?? null);
  // Feature 1: no-code variant
  const [noCodeSubject, setNoCodeSubject] = React.useState<string>(template?.noCodeSubject ?? "");
  const [noCodeHtmlBody, setNoCodeHtmlBody] = React.useState<string>(template?.noCodeHtmlBody ?? "");
  const [showNoCodeEditor, setShowNoCodeEditor] = React.useState(false);
  // Feature 2: logo override
  const [logoUrl, setLogoUrl] = React.useState<string>(template?.logoUrl ?? "");
  // Feature 3: alt-subject re-send
  const [altSubject, setAltSubject] = React.useState<string>(template?.altSubject ?? "");
  const [altNotOpenedHours, setAltNotOpenedHours] = React.useState<number | null>(template?.altNotOpenedHours ?? null);
  // TSK-0074 Phase 4: mobile-only CSS/HTML overrides (wrapped in
  // @media (max-width:600px) by the unified renderer).
  const [mobileOverridesHtml, setMobileOverridesHtml] = React.useState<string>(template?.mobileOverridesHtml ?? "");

  const [saving, setSaving] = React.useState(false);
  const [savingAs, setSavingAs] = React.useState(false);
  // TSK-0074 Phase 4: persistent preview pane BELOW the editor with
  // Desktop (600px) / Mobile (375px) tabs. Replaces the old toggle that
  // hid the editor while previewing.
  const [previewTab, setPreviewTab] = React.useState<"desktop" | "mobile">("desktop");

  // Save (in-place) or Create (new template).
  // `mode: "save"` → PATCH existing; `mode: "saveAs"` → POST new with prompted name.
  const handleSave = async (mode: "save" | "saveAs") => {
    if (!name.trim() || !subject.trim() || !htmlBody.trim()) {
      toast.error("Name, subject, and HTML body are all required");
      return;
    }
    const isSaveAs = mode === "saveAs";
    if (isSaveAs) {
      const newName = window.prompt("Save as new template — enter a name:", `${name} (copy)`);
      if (!newName?.trim()) return;
      setName(newName.trim());
    }
    const target = isSaveAs ? null : template;
    const setting = isSaveAs ? setSavingAs : setSaving;
    setting(true);
    try {
      const isCreate = !target;
      const url = isCreate
        ? "/api/email-templates"
        : `/api/email-templates/${target.id}`;
      const method = isCreate ? "POST" : "PATCH";
      const body: Record<string, unknown> = {
        // Always send `name` so that renaming an existing template via PATCH
        // actually persists. The API validates non-empty for both POST and PATCH.
        name,
        subject,
        htmlBody,
        stopIfNotOpenedHours,
        noCodeSubject: noCodeSubject.trim() || null,
        noCodeHtmlBody: noCodeHtmlBody.trim() || null,
        logoUrl: logoUrl.trim() || null,
        altSubject: altSubject.trim() || null,
        altNotOpenedHours,
        // TSK-0074 Phase 4: mobile-only overrides (sent as null when empty
        // so the API can clear the field on PATCH).
        mobileOverridesHtml: mobileOverridesHtml.trim() || null,
      };
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Save failed");
      }
      toast.success(isCreate ? "Template created" : "Template saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setting(false);
    }
  };

  // ─── Preview rendering ───────────────────────────────────────────────────
  //
  // TSK-0074 Phase 4: the preview iframe srcdoc is produced by the SAME
  // `renderUnifiedEmail` pipeline used at send time, so what the admin sees
  // here matches production rendering 1:1:
  //   - tokens substituted with sample values (PREVIEW_CTX)
  //   - brand logo injected top-right via `buildLogoBlock(logoUrl)` (which
  //     falls back to EMAIL_BRAND_LOGO_URL → DEFAULT_BRAND_LOGO_URL when
  //     the per-template override is empty)
  //   - mobile overrides wrapped in `@media (max-width:600px)` and injected
  //     after <head> (so they apply when the iframe is sized at the mobile
  //     width of 375px, and are no-ops at the desktop width of 600px)
  //   - unsubscribe footer with `unsubscribeUrl: "#"` (matches production —
  //     the real URL is per-recipient, but the footer text is identical)
  //
  // We DON'T pass clickWrapFn or (campaignId, trackToken, baseUrl) → the
  // renderer skips click-wrapping (links stay as raw hrefs, which is fine
  // for preview). No tracking pixel either (no openPixelUrl).
  //
  // Re-renders are debounced 300ms after edits to bodyHtml /
  // mobileOverridesHtml / logoUrl — avoids re-running the full pipeline on
  // every keystroke.
  const [debouncedBody, setDebouncedBody] = React.useState(htmlBody);
  const [debouncedMobile, setDebouncedMobile] = React.useState(mobileOverridesHtml);
  const [debouncedLogo, setDebouncedLogo] = React.useState(logoUrl);

  React.useEffect(() => {
    const h = window.setTimeout(() => setDebouncedBody(htmlBody), 300);
    return () => window.clearTimeout(h);
  }, [htmlBody]);
  React.useEffect(() => {
    const h = window.setTimeout(() => setDebouncedMobile(mobileOverridesHtml), 300);
    return () => window.clearTimeout(h);
  }, [mobileOverridesHtml]);
  React.useEffect(() => {
    const h = window.setTimeout(() => setDebouncedLogo(logoUrl), 300);
    return () => window.clearTimeout(h);
  }, [logoUrl]);

  const previewSrcDoc = React.useMemo(() => {
    // Don't run the pipeline on empty bodies — render a friendly placeholder
    // instead so the iframe never shows a blank white box on a fresh new
    // template.
    if (!debouncedBody.trim()) {
      return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;padding:32px;color:#999;font-size:14px;text-align:center;">Start typing in the editor above to see a live preview here.</body></html>`;
    }
    return renderUnifiedEmail({
      html: debouncedBody,
      ctx: PREVIEW_CTX,
      logoHtml: buildLogoBlock(debouncedLogo || null),
      mobileOverridesHtml: debouncedMobile || undefined,
      unsubscribeUrl: "#",
      chapterName: PREVIEW_CTX.chapterName,
    });
  }, [debouncedBody, debouncedMobile, debouncedLogo]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-[900px] max-w-[95vw] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-bold">
            {template ? "Edit template" : "New template"}
            {template?.isDefault && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">DEFAULT</span>
            )}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Template name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Awareness, TLV promo — early bird"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Subject line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="You're in! Here's what to expect at {{eventTitle}}"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-neutral-500">
              Supports tokens: {"{{firstName}}"}, {"{{eventTitle}}"}, {"{{eventDate}}"}, {"{{eventVenue}}"}, {"{{eventUrl}}"}, {"{{myCodeUrl}}"}, {"{{checkInCode}}"}, {"{{speakers}}"}, {"{{agenda}}"}.
            </p>
          </div>

          {/* Feature 3: Alt-subject re-send */}
          <div className="mb-4 rounded border border-purple-200 bg-purple-50/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-purple-900">
                Alternative subject (re-send if not opened)
              </label>
              <span className="text-[10px] text-purple-700">Feature · re-engagement</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <input
                  type="text"
                  value={altSubject}
                  onChange={(e) => setAltSubject(e.target.value)}
                  placeholder="Don't miss {{eventTitle}} — opens in 10 days"
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <input
                  type="number"
                  min={1}
                  value={altNotOpenedHours ?? ""}
                  onChange={(e) => setAltNotOpenedHours(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="hours"
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs"
                />
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-purple-800">
              If set: when this email isn&rsquo;t opened within <strong>N hours</strong> of being sent, the worker
              re-sends the same body with this alternative subject line. One re-send per recipient per stage.
            </p>
          </div>

          {/* Feature 1: No-check-in-code variant */}
          <div className="mb-4 rounded border border-amber-200 bg-amber-50/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-amber-900">
                No check-in code variant (stages 3 &amp; 4)
              </label>
              <button
                type="button"
                onClick={() => setShowNoCodeEditor((v) => !v)}
                className="rounded border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
              >
                {showNoCodeEditor ? "Hide" : "Edit"} variant
              </button>
            </div>
            <input
              type="text"
              value={noCodeSubject}
              onChange={(e) => setNoCodeSubject(e.target.value)}
              placeholder="Alt subject when user has no code (e.g. Action needed: generate your check-in code)"
              className="mb-2 w-full rounded border border-neutral-300 px-2 py-1.5 text-xs"
            />
            {showNoCodeEditor && (
              <div className="mt-2">
                <RichTextEmailEditor
                  value={noCodeHtmlBody}
                  onChange={setNoCodeHtmlBody}
                  height={300}
                />
                <p className="mt-1 text-[10px] text-amber-800">
                  Used when <code>rsvp.checkInCode IS NULL</code>. Should prompt the user to open the event page
                  and tap &ldquo;I&rsquo;m here — Check in&rdquo;. The body should explain the code is personal &amp; non-transferrable.
                </p>
              </div>
            )}
            {!showNoCodeEditor && (
              <p className="text-[10px] text-amber-800">
                {noCodeHtmlBody
                  ? `Variant body set (${noCodeHtmlBody.length} chars). Click "Edit variant" to modify.`
                  : "No variant set — the standard body will be sent even when the user has no check-in code (the {{checkInCode}} token renders as empty)."}
              </p>
            )}
          </div>

          <div className="mb-4 flex items-center gap-3">
            <label className="text-xs font-semibold text-neutral-700">Stop if not opened (hours)</label>
            <input
              type="number"
              min={0}
              value={stopIfNotOpenedHours ?? ""}
              onChange={(e) => setStopIfNotOpenedHours(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="optional"
              className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <span className="text-[10px] text-neutral-500">
              Halts the orchestrator chain if this stage isn&rsquo;t opened in time. Leave empty for no halt.
            </span>
          </div>

          {/* Feature 2: Logo override with visual preview + upload */}
          <LogoEditorField value={logoUrl} onChange={setLogoUrl} />

          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Email body (WYSIWYG)</label>
            <RichTextEmailEditor value={htmlBody} onChange={setHtmlBody} height={420} />
          </div>

          {/* TSK-0074 Phase 4: Mobile overrides (CSS/HTML) */}
          <div className="mb-4 rounded border border-cyan-200 bg-cyan-50/30 p-3">
            <label className="mb-1 block text-xs font-semibold text-cyan-900">
              Mobile overrides (CSS/HTML)
            </label>
            <textarea
              value={mobileOverridesHtml}
              onChange={(e) => setMobileOverridesHtml(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={`h1 { font-size: 24px !important; line-height: 1.3 !important; }\n.hero { padding: 12px !important; }\n.btn { display: block !important; width: 100% !important; }`}
              className="w-full rounded border border-neutral-300 bg-white p-2 font-mono text-xs leading-relaxed"
            />
            <p className="mt-1 text-[10px] text-cyan-800">
              These rules only apply on screens ≤600px wide (mobile). Wrapped
              automatically inside a <code>@media (max-width: 600px)</code>{" "}
              block by the unified renderer. The Mobile preview tab below shows
              them in action.
            </p>
          </div>

          {/* TSK-0074 Phase 4: Desktop / Mobile preview pane (always visible
              below the editor). srcdoc is rendered via the same pipeline as
              production sends. */}
          <div className="rounded border border-neutral-300 bg-neutral-50">
            <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewTab("desktop")}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${
                    previewTab === "desktop"
                      ? "bg-[#FF005A] text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("mobile")}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${
                    previewTab === "mobile"
                      ? "bg-[#FF005A] text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile
                </button>
              </div>
              <span className="text-[10px] text-neutral-500">
                Rendered via <code>renderUnifiedEmail</code> · matches production sends
              </span>
            </div>
            <div className="flex justify-center bg-[repeating-conic-gradient(#f5f5f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] p-4">
              <iframe
                srcDoc={previewSrcDoc}
                title="Email preview"
                sandbox="allow-same-origin"
                style={{
                  width: previewTab === "desktop" ? 600 : 375,
                  maxWidth: "100%",
                  height: 520,
                  background: "#ffffff",
                  border: "1px solid #e5e5e5",
                  borderRadius: 4,
                }}
              />
            </div>
            <div className="border-t border-neutral-200 bg-white px-3 py-1.5 text-center text-[10px] text-neutral-500">
              {previewTab === "desktop"
                ? "Desktop · 600px wide (typical webmail / Gmail desktop)"
                : "Mobile · 375px wide (iPhone SE / 12 mini viewport)"}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          {/* Save As (new template) — visible always, prompts for new name */}
          <button
            onClick={() => handleSave("saveAs")}
            disabled={saving || savingAs}
            className="inline-flex items-center gap-2 rounded border border-[#FF005A] px-3 py-1.5 text-sm font-semibold text-[#FF005A] hover:bg-[#FFF1F5] disabled:opacity-50"
            title="Save a copy as a new template"
          >
            {savingAs ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            Save as new
          </button>
          {/* Save (in-place if editing, Create if new) */}
          <button
            onClick={() => handleSave("save")}
            disabled={saving || savingAs}
            className="inline-flex items-center gap-2 rounded bg-[#FF005A] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}
            {template ? "Save changes" : "Create template"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template metrics dialog
// ─────────────────────────────────────────────────────────────────────────────

type MetricsData = {
  template: {
    id: string;
    name: string;
    subject: string;
    stage: number | null;
    isDefault: boolean;
    isActive: boolean;
  };
  metrics: {
    sent: number;
    opened: number;
    clicked: number;
    failed: number;
    pending: number;
    openRate: number;
    clickRate: number;
  };
  byVariant: {
    A: { sent: number; opened: number; clicked: number; failed: number; pending: number; openRate: number; clickRate: number };
    B: { sent: number; opened: number; clicked: number; failed: number; pending: number; openRate: number; clickRate: number };
  };
  byFlow: Array<{
    flowId: string;
    flowName: string;
    sent: number;
    opened: number;
    clicked: number;
    failed: number;
    pending: number;
    openRate: number;
    clickRate: number;
  }>;
  recentSends: Array<{
    id: string;
    email: string;
    status: string;
    subjectVariant: string | null;
    sentAt: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    flowName: string;
    stepPosition: number | null;
  }>;
};

function TemplateMetricsDialog({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<MetricsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/email-templates/${template.id}/metrics`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load metrics");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [template.id]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-[760px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold">{template.name} — metrics</h3>
            <p className="text-xs text-neutral-500">{template.subject}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Summary cards */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Overall</h4>
                <div className="grid grid-cols-5 gap-2">
                  <MetricCard label="Sent" value={data.metrics.sent} color="bg-blue-50 text-blue-700" />
                  <MetricCard label="Opened" value={data.metrics.opened} color="bg-green-50 text-green-700" sub={`${data.metrics.openRate.toFixed(1)}%`} />
                  <MetricCard label="Clicked" value={data.metrics.clicked} color="bg-purple-50 text-purple-700" sub={`${data.metrics.clickRate.toFixed(1)}%`} />
                  <MetricCard label="Failed" value={data.metrics.failed} color="bg-red-50 text-red-700" />
                  <MetricCard label="Pending" value={data.metrics.pending} color="bg-amber-50 text-amber-700" />
                </div>
              </section>

              {/* A/B variant breakdown */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">By subject variant</h4>
                <div className="overflow-hidden rounded border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Variant</th>
                        <th className="px-3 py-2 text-right font-semibold">Sent</th>
                        <th className="px-3 py-2 text-right font-semibold">Opened</th>
                        <th className="px-3 py-2 text-right font-semibold">Open %</th>
                        <th className="px-3 py-2 text-right font-semibold">Clicked</th>
                        <th className="px-3 py-2 text-right font-semibold">Click %</th>
                        <th className="px-3 py-2 text-right font-semibold">Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-neutral-100">
                        <td className="px-3 py-2"><span className="rounded bg-[#00E6FF] px-1.5 py-0.5 text-[10px] font-bold text-black">A</span></td>
                        <td className="px-3 py-2 text-right">{data.byVariant.A.sent}</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.A.opened}</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.A.openRate.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.A.clicked}</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.A.clickRate.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.A.failed}</td>
                      </tr>
                      <tr className="border-t border-neutral-100">
                        <td className="px-3 py-2"><span className="rounded bg-[#FF005A] px-1.5 py-0.5 text-[10px] font-bold text-white">B</span></td>
                        <td className="px-3 py-2 text-right">{data.byVariant.B.sent}</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.B.opened}</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.B.openRate.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.B.clicked}</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.B.clickRate.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{data.byVariant.B.failed}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {data.byVariant.B.sent === 0 && (
                  <p className="mt-2 text-[10px] text-neutral-500">No A/B test — variant B was never used in any step with this template.</p>
                )}
              </section>

              {/* Per-flow breakdown */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">By flow</h4>
                {data.byFlow.length === 0 ? (
                  <p className="rounded border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-500">
                    This template hasn&rsquo;t been used in any flows yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded border border-neutral-200">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Flow</th>
                          <th className="px-3 py-2 text-right font-semibold">Sent</th>
                          <th className="px-3 py-2 text-right font-semibold">Opened</th>
                          <th className="px-3 py-2 text-right font-semibold">Open %</th>
                          <th className="px-3 py-2 text-right font-semibold">Clicked</th>
                          <th className="px-3 py-2 text-right font-semibold">Failed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byFlow.map((f) => (
                          <tr key={f.flowId} className="border-t border-neutral-100">
                            <td className="px-3 py-2 font-medium text-neutral-900">{f.flowName}</td>
                            <td className="px-3 py-2 text-right">{f.sent}</td>
                            <td className="px-3 py-2 text-right">{f.opened}</td>
                            <td className="px-3 py-2 text-right">{f.openRate.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right">{f.clicked}</td>
                            <td className="px-3 py-2 text-right">{f.failed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Recent sends */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Recent sends (last 25)</h4>
                {data.recentSends.length === 0 ? (
                  <p className="rounded border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-500">
                    No sends yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded border border-neutral-200">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">Email</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Flow</th>
                          <th className="px-2 py-1.5 text-center font-semibold">Var</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Sent</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Opened</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentSends.map((s) => (
                          <tr key={s.id} className="border-t border-neutral-100">
                            <td className="px-2 py-1.5 font-mono text-[10px] text-neutral-700">{s.email}</td>
                            <td className="px-2 py-1.5 text-neutral-700">{s.flowName}{s.stepPosition ? ` · step ${s.stepPosition}` : ""}</td>
                            <td className="px-2 py-1.5 text-center">
                              {s.subjectVariant && (
                                <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                                  s.subjectVariant === "A" ? "bg-[#00E6FF] text-black" : "bg-[#FF005A] text-white"
                                }`}>{s.subjectVariant}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                s.status === "SENT" || s.status === "OPENED" || s.status === "CLICKED"
                                  ? "bg-green-100 text-green-700"
                                  : s.status === "FAILED"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                              }`}>{s.status}</span>
                            </td>
                            <td className="px-2 py-1.5 text-neutral-500">{s.sentAt ? new Date(s.sentAt).toLocaleString() : "—"}</td>
                            <td className="px-2 py-1.5 text-neutral-500">{s.openedAt ? new Date(s.openedAt).toLocaleString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: number;
  color: string;
  sub?: string;
}) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-[10px] opacity-70">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Logo editor field — visual preview + upload + URL override
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LogoEditorField — replaces the old plain text-input for the per-template
 * brand logo override. Lets the admin:
 *   1. SEE the current logo (both at actual email-render size 24px tall AND
 *      an enlarged preview so they can tell what the source image looks like)
 *   2. UPLOAD a new logo image directly from the editor (POSTs the file to
 *      /api/email-templates/upload-image, which stores it in Vercel Blob
 *      under email-assets/ and returns the public URL)
 *   3. PASTE a custom URL by hand (advanced — e.g. for images hosted elsewhere)
 *   4. RESET to the default logo (clears the override)
 *
 * The "resolved URL" (the one that will actually be injected at render time)
 * is computed via `resolveLogoUrl()` — per-template override → env var →
 * hardcoded DEFAULT_BRAND_LOGO_URL. The preview reflects that resolved URL,
 * so what you see here is exactly what shows up in the sent email.
 */
export function LogoEditorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Reset the broken-image flag whenever the URL changes so the preview
  // retries loading.
  React.useEffect(() => {
    setImgError(false);
  }, [value]);

  // The URL that will actually be used at render time.
  const resolvedUrl = resolveLogoUrl(value);
  const isOverride =
    value.trim().length > 0 && value.trim() !== DEFAULT_BRAND_LOGO_URL;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/email-templates/upload-image", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? `Upload failed (${r.status})`);
      }
      const data = await r.json();
      if (!data.url) throw new Error("Upload succeeded but no URL returned");
      onChange(data.url);
      toast.success("Logo uploaded", { description: file.name });
    } catch (e) {
      toast.error("Upload failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mb-4 rounded border border-cyan-200 bg-cyan-50/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-semibold text-cyan-900">
          Brand logo (top-right of every email)
        </label>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            isOverride
              ? "bg-[#FF005A]/10 text-[#FF005A]"
              : "bg-neutral-200 text-neutral-600"
          }`}
        >
          {isOverride ? "CUSTOM OVERRIDE" : "DEFAULT"}
        </span>
      </div>

      {/* Image preview — actual email size + enlarged */}
      <div className="mb-3 flex items-center gap-4 rounded border border-cyan-100 bg-white p-3">
        {/* Actual email render size (24px tall, 120px wide) — exactly what
            shows up in the sent email. */}
        <div className="flex flex-col items-center gap-1">
          {imgError ? (
            <div
              className="flex items-center justify-center text-[9px] text-red-500"
              style={{ height: "24px", width: "120px" }}
            >
              failed to load
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedUrl}
              alt="Logo at email size"
              height={24}
              width={120}
              style={{ height: "24px", width: "120px", objectFit: "contain" }}
              onError={() => setImgError(true)}
            />
          )}
          <span className="text-[9px] text-neutral-500">Actual email size</span>
        </div>

        <div className="h-12 w-px bg-neutral-200" />

        {/* Enlarged preview so the source image is actually visible.
            Scaled up proportionally (4x the email height). */}
        <div className="flex flex-col items-center gap-1">
          {imgError ? (
            <div
              className="flex items-center justify-center text-[9px] text-red-500"
              style={{ height: "96px", width: "200px" }}
            >
              failed to load
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedUrl}
              alt="Logo enlarged"
              style={{ height: "96px", width: "auto", maxWidth: "240px", objectFit: "contain" }}
              onError={() => setImgError(true)}
            />
          )}
          <span className="text-[9px] text-neutral-500">Enlarged (4×)</span>
        </div>

        <div className="flex-1" />

        {/* Upload + Reset buttons */}
        <div className="flex flex-col items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              // reset input value so re-uploading the same file fires onChange
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded bg-[#FF005A] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Upload new logo
          </button>
          {isOverride && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={uploading}
              className="inline-flex items-center gap-1 text-[10px] text-neutral-500 underline hover:text-neutral-800"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </button>
          )}
        </div>
      </div>

      {/* URL text input — for manual entry / advanced use */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Custom URL — leave empty to use the default AI Salon mark"
        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs font-mono"
      />
      <p className="mt-1 text-[10px] text-cyan-800">
        The logo is injected at the top-right of every email at render time
        (24px tall, 120px wide). Upload a new image above, paste a custom URL,
        or leave empty to use the default. The default can also be overridden
        globally via the <code>EMAIL_BRAND_LOGO_URL</code> env var.
      </p>
    </div>
  );
}
