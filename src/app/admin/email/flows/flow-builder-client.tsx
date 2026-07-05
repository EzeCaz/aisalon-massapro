"use client";

/**
 * FlowBuilderClient — the main /admin/email/flows page.
 *
 * Layout:
 *   - Left sidebar (280px): list of flows, "New flow" button.
 *   - Right: FlowBuilderCanvas for the selected flow.
 *   - "Report" button opens the per-flow report dialog.
 *
 * Loads flows via /api/email-flows, saves via PATCH /api/email-flows/[id].
 * Loads audiences via /api/email-audiences.
 */

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, Workflow, AlertCircle, Copy, BarChart3 } from "lucide-react";
import {
  FlowBuilderCanvas,
  type FlowData,
  type FlowTemplate,
  type FlowAudience,
  type FlowStep,
} from "@/components/ais/flow-builder/flow-builder-canvas";
import { FlowReportDialog } from "./flow-report-dialog";

type FlowListItem = {
  id: string;
  name: string;
  status: string;
  steps?: Array<{ id: string; position: number; triggerKind: string | null }>;
  runStats?: Record<string, number>;
  _count?: { steps: number };
};

const STATUSES = [
  { value: "DRAFT", label: "Draft", color: "bg-neutral-200 text-neutral-700" },
  { value: "ACTIVE", label: "Active", color: "bg-green-100 text-green-700" },
  { value: "PAUSED", label: "Paused", color: "bg-amber-100 text-amber-700" },
  { value: "ARCHIVED", label: "Archived", color: "bg-neutral-100 text-neutral-500 line-through" },
];

export function FlowBuilderClient({
  templates,
  events,
  initialAudiences,
}: {
  templates: FlowTemplate[];
  events: { id: string; title: string; slug: string; startsAt: string }[];
  initialAudiences: FlowAudience[];
}) {
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [audiences, setAudiences] = useState<FlowAudience[]>(initialAudiences);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportFlowId, setReportFlowId] = useState<string | null>(null);

  // Load flow list.
  const loadFlows = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/email-flows");
      if (!r.ok) throw new Error("Failed to load flows");
      const data = await r.json();
      setFlows(data.flows || []);
      if (!selectedId && data.flows.length > 0) {
        setSelectedId(data.flows[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load flows");
    } finally {
      setLoadingList(false);
    }
  }, [selectedId]);

  // Refresh audiences (after creating/editing audiences elsewhere).
  const refreshAudiences = useCallback(async () => {
    try {
      const r = await fetch("/api/email-audiences");
      if (r.ok) {
        const data = await r.json();
        setAudiences(data.audiences || []);
      }
    } catch (e) {
      console.error("Failed to load audiences", e);
    }
  }, []);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  // Load selected flow.
  useEffect(() => {
    if (!selectedId) {
      setFlow(null);
      return;
    }
    setLoadingFlow(true);
    fetch(`/api/email-flows/${selectedId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.flow) {
          setFlow({
            id: data.flow.id,
            name: data.flow.name,
            description: data.flow.description,
            status: data.flow.status,
            steps: (data.flow.steps || []).map((s: Record<string, unknown>) => ({
              id: s.id as string,
              position: s.position as number,
              audienceId: (s.audienceId as string | null) ?? null,
              triggerKind: (s.triggerKind as string | null) ?? null,
              triggerEventId: (s.triggerEventId as string | null) ?? null,
              templateId: (s.templateId as string | null) ?? null,
              subjectVariantA: (s.subjectVariantA as string | null) ?? null,
              subjectVariantB: (s.subjectVariantB as string | null) ?? null,
              delayValue: (s.delayValue as number) ?? 0,
              delayUnit: (s.delayUnit as "MINUTES" | "HOURS" | "DAYS") ?? "MINUTES",
            })),
          });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load flow"))
      .finally(() => setLoadingFlow(false));
  }, [selectedId]);

  // Save flow.
  const handleSave = async () => {
    if (!flow || !flow.id) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/email-flows/${flow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: flow.name,
          description: flow.description,
          status: flow.status,
          steps: flow.steps.map((s) => ({
            position: s.position,
            audienceId: s.audienceId,
            triggerKind: s.triggerKind,
            triggerEventId: s.triggerEventId,
            templateId: s.templateId,
            subjectVariantA: s.subjectVariantA,
            subjectVariantB: s.subjectVariantB,
            delayValue: s.delayValue,
            delayUnit: s.delayUnit,
          })),
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Save failed");
      }
      // Refresh list (run stats may have changed).
      loadFlows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Create new flow.
  const handleNewFlow = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/email-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Untitled flow",
          status: "DRAFT",
          steps: [
            {
              position: 1,
              audienceId: null,
              triggerKind: "RSVP_GOING",
              triggerEventId: null,
              templateId: null,
              subjectVariantA: null,
              subjectVariantB: null,
              delayValue: 0,
              delayUnit: "MINUTES",
            },
          ],
        }),
      });
      if (!r.ok) throw new Error("Failed to create flow");
      const data = await r.json();
      await loadFlows();
      setSelectedId(data.flow.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  // Duplicate flow.
  const handleDuplicate = async (id: string) => {
    const f = flows.find((x) => x.id === id);
    if (!f) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/email-flows/${id}`);
      const data = await r.json();
      const source = data.flow;
      const createR = await fetch("/api/email-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${source.name} (copy)`,
          description: source.description,
          status: "DRAFT",
          steps: source.steps.map((s: Record<string, unknown>) => ({
            position: s.position as number,
            audienceId: (s.audienceId as string | null) ?? null,
            triggerKind: (s.triggerKind as string | null) ?? null,
            triggerEventId: (s.triggerEventId as string | null) ?? null,
            templateId: (s.templateId as string | null) ?? null,
            subjectVariantA: (s.subjectVariantA as string | null) ?? null,
            subjectVariantB: (s.subjectVariantB as string | null) ?? null,
            delayValue: (s.delayValue as number) ?? 0,
            delayUnit: (s.delayUnit as string) ?? "MINUTES",
          })),
        }),
      });
      if (!createR.ok) throw new Error("Failed to duplicate");
      const newFlow = await createR.json();
      await loadFlows();
      setSelectedId(newFlow.flow.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Left sidebar — flow list */}
      <div className="flex w-72 shrink-0 flex-col">
        <button
          onClick={handleNewFlow}
          disabled={saving}
          className="mb-3 inline-flex items-center justify-center gap-2 rounded bg-[#FF005A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New flow
        </button>

        <div className="flex-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
          {loadingList ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : flows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <Workflow className="mb-2 h-12 w-12 text-neutral-300" />
              <p className="text-sm font-semibold text-neutral-700">No flows yet</p>
              <p className="text-xs text-neutral-500">Build your first automated email sequence.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {flows.map((f) => {
                const stepCount = f._count?.steps ?? f.steps?.length ?? 0;
                const totalSends = f.runStats?.total ?? 0;
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => setSelectedId(f.id)}
                      className={`flex w-full flex-col items-start gap-1 px-3 py-3 text-left hover:bg-neutral-50 ${
                        selectedId === f.id ? "border-l-2 border-[#FF005A] bg-[#FF005A]/[0.04]" : "border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="flex-1 truncate text-sm font-semibold text-neutral-900">{f.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUSES.find((s) => s.value === f.status)?.color ?? "bg-neutral-100"}`}>
                          {STATUSES.find((s) => s.value === f.status)?.label ?? f.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        {stepCount} step{stepCount === 1 ? "" : "s"} · {totalSends} send{totalSends === 1 ? "" : "s"}
                      </div>
                    </button>
                    <div className="flex justify-end gap-2 px-3 pb-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setReportFlowId(f.id); }}
                        className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-[#FF005A]"
                      >
                        <BarChart3 className="h-3 w-3" /> Report
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(f.id); }}
                        className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-[#FF005A]"
                      >
                        <Copy className="h-3 w-3" /> Duplicate
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Right — canvas */}
      <div className="flex-1 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {error && (
          <div className="m-4 flex items-center gap-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {loadingFlow ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            <Loader2 className="h-6 w-6 animate-spin" /> Loading flow…
          </div>
        ) : flow ? (
          <FlowBuilderCanvas
            flow={flow}
            templates={templates}
            audiences={audiences}
            events={events}
            onChange={setFlow}
            onSave={handleSave}
            saving={saving}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Workflow className="mb-2 h-16 w-16 text-neutral-200" />
            <p className="text-lg font-semibold text-neutral-700">No flow selected</p>
            <p className="text-sm text-neutral-500">Pick a flow on the left, or create a new one.</p>
          </div>
        )}
      </div>

      {/* Report dialog */}
      {reportFlowId && (
        <FlowReportDialog
          flowId={reportFlowId}
          onClose={() => setReportFlowId(null)}
        />
      )}
    </div>
  );
}
