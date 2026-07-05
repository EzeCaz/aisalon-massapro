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
 * Embedded as a tab on the /admin/email/flows page.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, Save, Eye, X, Copy, Pencil,
  AlertCircle, FileText, BarChart3, Power,
} from "lucide-react";

// Full template type — fetched from /api/email-templates (not the
// minimal FlowTemplate shape used by the flow builder).
type Template = {
  id: string;
  stage: number | null;
  name: string;
  subject: string;
  htmlBody: string;
  stopIfNotOpenedHours: number | null;
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
          onClick={() => setCreating(true)}
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
  const [saving, setSaving] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !htmlBody.trim()) {
      toast.error("Name, subject, and HTML body are all required");
      return;
    }
    setSaving(true);
    try {
      const isCreate = !template;
      const url = isCreate
        ? "/api/email-templates"
        : `/api/email-templates/${template.id}`;
      const method = isCreate ? "POST" : "PATCH";
      const body: Record<string, unknown> = { name, subject, htmlBody, stopIfNotOpenedHours };
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
      setSaving(false);
    }
  };

  // Render a sample context for the preview iframe.
  const previewHtml = React.useMemo(() => {
    return htmlBody
      .replace(/{{firstName}}/g, "Eze")
      .replace(/{{name}}/g, "Eze")
      .replace(/{{eventTitle}}/g, "AI Salon TLV — July Demo Day")
      .replace(/{{eventDate}}/g, "Tue, Jul 15, 2026 · 6:00 PM")
      .replace(/{{eventVenue}}/g, "Massa TLV")
      .replace(/{{eventAddress}}/g, "Ahad Ha'am 34, Tel Aviv")
      .replace(/{{eventUrl}}/g, "https://aisalon.massapro.com/e/demo-day")
      .replace(/{{checkInCode}}/g, "ABCD-1234")
      .replace(/{{speakers}}/g, "Eze Schloss, Sarah Chen")
      .replace(/{{agenda}}/g, "• 6:00 PM — Doors open\n• 6:30 PM — Welcome\n• 7:00 PM — Demos\n• 8:30 PM — Networking");
  }, [htmlBody]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-[820px] flex-col bg-white shadow-2xl">
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
              Supports tokens: {"{{firstName}}"}, {"{{eventTitle}}"}, {"{{eventDate}}"}, {"{{eventVenue}}"}, {"{{checkInCode}}"}, {"{{speakers}}"}, {"{{agenda}}"}.
            </p>
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

          <div className="mb-3 flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-700">HTML body</label>
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <Eye className="h-3 w-3" /> {showPreview ? "Edit" : "Preview"}
            </button>
          </div>

          {showPreview ? (
            <div className="h-[420px] overflow-hidden rounded border border-neutral-300">
              <iframe
                srcDoc={previewHtml}
                className="h-full w-full bg-white"
                title="Email preview"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              rows={20}
              className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
              placeholder="<html>..."
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded bg-[#FF005A] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
