"use client";

/**
 * FlowBuilderCanvas — the main visual editor for an EmailFlow.
 *
 * NEW MODEL (per-step audience + trigger + email):
 *   Each step is a self-contained email send:
 *     A. Audience — who receives this email (reusable EmailAudience)
 *     B. Trigger — entry event that fires this step (RSVP_GOING, etc.)
 *     C. Email content — template + subject A (+ optional subject B for A/B test)
 *     D. Delay — optional wait after trigger before sending
 *
 *   Up to 8 steps per flow. Steps are independent (not chained).
 *
 * Layout:
 *   - Top: flow name (editable), status pill, Save button.
 *   - Middle: horizontal scrollable row of step cards.
 *   - Right side: Sheet (520px) opens when a step is clicked, with the
 *     StepEditor inside (A/B/C/D sections).
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus, X, ArrowRight, Clock, Mail, Pencil, Loader2, Users, Zap,
  Copy, Trash2, FlaskConical, Send,
} from "lucide-react";

export type FlowTemplate = {
  id: string;
  name: string;
  subject: string;
  stage: number | null;
  isDefault?: boolean;
  isActive?: boolean;
};

export type FlowAudience = {
  id: string;
  name: string;
  isTest: boolean;
  kind?: "STATIC" | "DYNAMIC";
  emails: string[];
};

export type FlowStep = {
  id?: string;
  position: number;
  audienceId: string | null;
  triggerKind: string | null;
  triggerEventId: string | null;
  templateId: string | null;
  subjectVariantA: string | null;
  subjectVariantB: string | null;
  delayValue: number;
  delayUnit: "MINUTES" | "HOURS" | "DAYS";
};

export type FlowData = {
  id?: string;
  name: string;
  description?: string | null;
  status: string;
  steps: FlowStep[];
};

const TRIGGER_KINDS = [
  { value: "RSVP_GOING", label: "RSVP created (registered)", hint: "Fires when someone RSVPs 'Going' to an event" },
  { value: "DOOR_CHECKED_IN", label: "Door checked-in", hint: "Fires when attendee checks in at the door" },
  { value: "MARKED_ATTENDED", label: "Marked as attended", hint: "Fires when admin marks attendee as attended" },
  { value: "MARKED_NO_SHOW", label: "Marked as no-show", hint: "Fires when admin marks attendee as no-show" },
  { value: "MANUAL", label: "Manual (admin sends)", hint: "Only fires when admin clicks 'Send to audience'" },
];

const STATUSES = [
  { value: "DRAFT", label: "Draft", color: "bg-neutral-200 text-neutral-700" },
  { value: "ACTIVE", label: "Active", color: "bg-green-100 text-green-700" },
  { value: "PAUSED", label: "Paused", color: "bg-amber-100 text-amber-700" },
  { value: "ARCHIVED", label: "Archived", color: "bg-neutral-100 text-neutral-500 line-through" },
];

const MAX_STEPS = 8;

export function FlowBuilderCanvas({
  flow,
  templates,
  audiences,
  events,
  onChange,
  onSave,
  saving,
}: {
  flow: FlowData;
  templates: FlowTemplate[];
  audiences: FlowAudience[];
  events: { id: string; title: string; slug: string; startsAt: string }[];
  onChange: (f: FlowData) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [editingStep, setEditingStep] = useState<number | null>(null);

  const editingStepData = editingStep !== null ? flow.steps.find((s) => s.position === editingStep) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={flow.name}
            onChange={(e) => onChange({ ...flow, name: e.target.value })}
            placeholder="Flow name"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-lg font-bold"
          />
          <select
            value={flow.status}
            onChange={(e) => onChange({ ...flow, status: e.target.value })}
            className={`rounded-full px-3 py-1 text-xs font-semibold border ${STATUSES.find((s) => s.value === flow.status)?.color ?? "bg-neutral-100"}`}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded bg-[#FF005A] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>
        {flow.description !== undefined && (
          <input
            type="text"
            value={flow.description ?? ""}
            onChange={(e) => onChange({ ...flow, description: e.target.value || null })}
            placeholder="Description (optional)"
            className="mt-2 w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
          />
        )}
      </div>

      {/* Canvas — step cards */}
      <div className="flex-1 overflow-x-auto bg-neutral-50 p-6">
        <div className="flex items-stretch gap-2">
          {flow.steps.map((step, i) => (
            <div key={step.position} className="flex items-center gap-2">
              <StepCard
                step={step}
                template={templates.find((t) => t.id === step.templateId)}
                audience={audiences.find((a) => a.id === step.audienceId)}
                events={events}
                flowId={flow.id ?? ""}
                flowStatus={flow.status}
                onClick={() => setEditingStep(step.position)}
                onDelete={() => {
                  onChange({
                    ...flow,
                    steps: flow.steps
                      .filter((s) => s.position !== step.position)
                      .map((s, idx) => ({ ...s, position: idx + 1 })),
                  });
                }}
              />
              {i < flow.steps.length - 1 && (
                <ArrowRight className="h-5 w-5 shrink-0 text-neutral-400" />
              )}
            </div>
          ))}

          {flow.steps.length < MAX_STEPS && (
            <button
              onClick={() => {
                const newPosition = flow.steps.length + 1;
                onChange({
                  ...flow,
                  steps: [
                    ...flow.steps,
                    {
                      position: newPosition,
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
                });
              }}
              className="flex h-[280px] w-[180px] shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-[#FF005A] hover:text-[#FF005A]"
            >
              <div className="text-center">
                <Plus className="mx-auto mb-2 h-8 w-8" />
                <div className="text-sm font-semibold">Add step</div>
                <div className="text-xs">Max {MAX_STEPS}</div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Step editor sheet */}
      {editingStep !== null && editingStepData && (
        <StepEditorSheet
          step={editingStepData}
          templates={templates}
          audiences={audiences}
          events={events}
          onChange={(s) => {
            onChange({
              ...flow,
              steps: flow.steps.map((st) => (st.position === s.position ? s : st)),
            });
          }}
          onClose={() => setEditingStep(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Card (canvas)
// ─────────────────────────────────────────────────────────────────────────────

function StepCard({
  step,
  template,
  audience,
  events,
  flowId,
  flowStatus,
  onClick,
  onDelete,
}: {
  step: FlowStep;
  template?: FlowTemplate;
  audience?: FlowAudience;
  events: { id: string; title: string; slug: string; startsAt: string }[];
  flowId: string;
  flowStatus: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  const triggerLabel = TRIGGER_KINDS.find((t) => t.value === step.triggerKind)?.label ?? step.triggerKind ?? "—";
  const [sending, setSending] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);

  const canSend = !!(step.id && step.templateId && step.audienceId && flowStatus === "ACTIVE");

  const handleSendToAudience = async (eventId: string) => {
    if (!step.id) {
      toast.error("Save the flow first, then send.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/email-flows/${flowId}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.id, eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send to audience");
        return;
      }
      toast.success(`Scheduled ${data.created} email(s) · ${data.skipped} already queued`);
      setShowEventPicker(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to send to audience");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={onClick}
      className="relative flex h-[280px] w-[260px] cursor-pointer flex-col rounded-lg border border-neutral-200 bg-white p-3 shadow-sm hover:border-[#FF005A] hover:shadow-md"
    >
      {/* Header: position + edit + delete */}
      <div className="mb-2 flex items-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF005A] text-xs font-bold text-white">
          {step.position}
        </span>
        <button className="ml-auto text-neutral-400 hover:text-[#FF005A]">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="ml-1 text-neutral-400 hover:text-red-500"
          title="Delete step"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* A. Audience */}
      <div className="mb-2">
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          <Users className="h-3 w-3" /> A · Audience
        </div>
        <div className="text-xs font-medium text-neutral-800 truncate">
          {audience ? (
            <span className="inline-flex items-center gap-1">
              {audience.name}
              {audience.isTest && (
                <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">TEST</span>
              )}
            </span>
          ) : (
            <span className="italic text-neutral-400">Everyone (no filter)</span>
          )}
        </div>
        {audience && (
          <div className="text-[10px] text-neutral-500 truncate">
            {audience.emails.length} email{audience.emails.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* B. Trigger */}
      <div className="mb-2">
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          <Zap className="h-3 w-3" /> B · Trigger
        </div>
        <div className="text-xs font-medium text-neutral-800 truncate">
          {triggerLabel}
        </div>
      </div>

      {/* C. Email */}
      <div className="mb-2 flex-1 overflow-hidden">
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          <Mail className="h-3 w-3" /> C · Email
        </div>
        {template ? (
          <>
            <div className="text-xs font-semibold text-neutral-700 truncate">{template.name}</div>
            <div className="text-[10px] leading-tight text-neutral-500 line-clamp-2">
              <span className="font-semibold text-neutral-600">A:</span> {step.subjectVariantA || template.subject}
            </div>
            {step.subjectVariantB && (
              <div className="text-[10px] leading-tight text-neutral-500 line-clamp-2">
                <span className="font-semibold text-neutral-600">B:</span> {step.subjectVariantB}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-neutral-400">
            <Clock className="mb-1 h-5 w-5" />
            Wait-only
            <div className="text-[10px]">No email sent</div>
          </div>
        )}
      </div>

      {/* D. Delay chip */}
      <div className="inline-flex items-center gap-1 self-start rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
        <Clock className="h-3 w-3" />
        {step.delayValue > 0
          ? `${step.delayValue}${step.delayUnit[0].toLowerCase()} after trigger`
          : "Immediate"}
      </div>

      {/* Send to audience button — fires this step immediately to all audience members */}
      <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => {
            if (!step.id) {
              toast.error("Save the flow first, then send.");
              return;
            }
            if (flowStatus !== "ACTIVE") {
              toast.error(`Flow is ${flowStatus} — set it to Active to enable sending.`);
              return;
            }
            if (!step.templateId || !step.audienceId) {
              toast.error("Step needs an audience + template before sending.");
              return;
            }
            setShowEventPicker((v) => !v);
          }}
          disabled={sending}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
            canSend
              ? "bg-[#FF005A] text-white hover:bg-[#d8004d]"
              : "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
          }`}
          title={canSend ? "Send this step now to every member of the audience" : "Requires: saved step + audience + template + Active flow"}
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send to audience
        </button>
      </div>

      {/* Event picker popover — required because the trigger API needs an eventId to anchor RSVPs */}
      {showEventPicker && canSend && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-[260px] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Pick an event to anchor the send
          </div>
          <div className="text-[10px] text-neutral-500 mb-2">
            Each audience member gets (or reuses) an RSVP to this event — that's how the queue tracks them.
          </div>
          <select
            defaultValue={events[0]?.id ?? ""}
            className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
            id={`event-picker-${step.id}`}
          >
            {events.length === 0 ? (
              <option value="">(no events — create one first)</option>
            ) : (
              events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} — {new Date(ev.startsAt).toLocaleDateString()}
                </option>
              ))
            )}
          </select>
          <div className="mt-2 flex justify-end gap-1">
            <button
              onClick={() => setShowEventPicker(false)}
              className="rounded px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const sel = document.getElementById(`event-picker-${step.id}`) as HTMLSelectElement | null;
                const eventId = sel?.value;
                if (eventId) handleSendToAudience(eventId);
              }}
              disabled={events.length === 0}
              className="rounded bg-[#FF005A] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
            >
              Confirm send
            </button>
          </div>
        </div>
      )}

      {/* A/B badge */}
      {step.subjectVariantB && (
        <div className="absolute right-2 top-2 rounded bg-[#00E6FF] px-1.5 py-0.5 text-[9px] font-bold text-black">
          A/B
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Editor Sheet
// ─────────────────────────────────────────────────────────────────────────────

function StepEditorSheet({
  step,
  templates,
  audiences,
  events,
  onChange,
  onClose,
}: {
  step: FlowStep;
  templates: FlowTemplate[];
  audiences: FlowAudience[];
  events: { id: string; title: string; slug: string; startsAt: string }[];
  onChange: (s: FlowStep) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed right-0 top-0 z-50 h-full w-[520px] overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
          <h3 className="text-lg font-bold">Step {step.position} editor</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* ── A. Audience ── */}
          <section className="rounded-lg border border-neutral-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF005A] text-xs font-bold text-white">A</span>
              <h4 className="text-sm font-bold text-neutral-800">Audience — who receives this email</h4>
            </div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Audience</label>
            <div className="flex gap-2">
              <select
                value={step.audienceId ?? ""}
                onChange={(e) => onChange({ ...step, audienceId: e.target.value || null })}
                className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">Everyone (no audience filter)</option>
                {audiences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.isTest ? " (Test)" : ""}{a.kind === "DYNAMIC" ? " (dynamic)" : ""} — {a.emails.length} email{a.emails.length === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              <a
                href="/admin/email/flows"
                onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("navigate-to-audiences-tab")); }}
                className="inline-flex items-center gap-1 rounded border border-neutral-300 px-2 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                title="Open the Audiences tab to create or manage audiences"
              >
                <Plus className="h-3 w-3" /> New
              </a>
            </div>
            <p className="mt-1 text-[10px] text-neutral-500">
              Only recipients whose email is in this audience will receive this step. Click &ldquo;New&rdquo; to create a new audience (STATIC or DYNAMIC filter) — opens in the Audiences tab.
            </p>
            {step.audienceId && (() => {
              const a = audiences.find((x) => x.id === step.audienceId);
              return a ? (
                <div className="mt-2 rounded bg-neutral-50 p-2 text-[10px] text-neutral-600">
                  <div className="font-semibold mb-1">
                    {a.emails.length} email(s) in &ldquo;{a.name}&rdquo;{a.kind === "DYNAMIC" ? " (dynamic — resolved live)" : ""}
                  </div>
                  {a.emails.length > 0 ? (
                    <div className="truncate">{a.emails.join(", ")}</div>
                  ) : (
                    <div className="italic text-neutral-400">No emails resolved yet — DYNAMIC audiences are evaluated when the flow fires.</div>
                  )}
                </div>
              ) : null;
            })()}
          </section>

          {/* ── B. Trigger ── */}
          <section className="rounded-lg border border-neutral-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF005A] text-xs font-bold text-white">B</span>
              <h4 className="text-sm font-bold text-neutral-800">Trigger — when this step fires</h4>
            </div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Trigger event</label>
            <select
              value={step.triggerKind ?? ""}
              onChange={(e) => onChange({ ...step, triggerKind: e.target.value || null })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">— No trigger (manual only) —</option>
              {TRIGGER_KINDS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {step.triggerKind && (
              <p className="mt-1 text-[10px] text-neutral-500">
                {TRIGGER_KINDS.find((t) => t.value === step.triggerKind)?.hint}
              </p>
            )}

            <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-700">
              Event filter (optional)
            </label>
            <select
              value={step.triggerEventId ?? ""}
              onChange={(e) => onChange({ ...step, triggerEventId: e.target.value || null })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">All events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-neutral-500">
              Limit this step to fire only for a specific event. Leave on &ldquo;All events&rdquo; for general flows.
            </p>
          </section>

          {/* ── C. Email content ── */}
          <section className="rounded-lg border border-neutral-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF005A] text-xs font-bold text-white">C</span>
              <h4 className="text-sm font-bold text-neutral-800">Email content — template + subject</h4>
            </div>

            <label className="mb-1 block text-xs font-semibold text-neutral-700">Email template</label>
            <select
              value={step.templateId ?? ""}
              onChange={(e) => onChange({ ...step, templateId: e.target.value || null })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">— Wait-only step (no email) —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.stage ? `Stage ${t.stage}: ` : ""}{t.name} — {t.subject}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-neutral-500">
              The template provides the HTML body. You can override the subject below. Manage templates in the Templates tab.
            </p>

            {/* Subject A */}
            {step.templateId && (
              <>
                <div className="mt-4 rounded border border-[#00E6FF]/40 bg-[#00E6FF]/[0.04] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700">
                      Subject A <span className="text-neutral-400">(default)</span>
                    </label>
                    <span className="rounded bg-[#00E6FF] px-1.5 py-0.5 text-[9px] font-bold text-black">A</span>
                  </div>
                  <input
                    type="text"
                    value={step.subjectVariantA ?? ""}
                    onChange={(e) => onChange({ ...step, subjectVariantA: e.target.value || null })}
                    placeholder="Use template's default subject"
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </div>

                {/* Subject B (A/B test) */}
                <div className="mt-2 rounded border border-[#FF005A]/30 bg-[#FF005A]/[0.04] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700">
                      Subject B <span className="text-neutral-400">(A/B test variant)</span>
                    </label>
                    <span className="rounded bg-[#FF005A] px-1.5 py-0.5 text-[9px] font-bold text-white">B</span>
                  </div>
                  {step.subjectVariantB ? (
                    <input
                      type="text"
                      value={step.subjectVariantB}
                      onChange={(e) => onChange({ ...step, subjectVariantB: e.target.value || null })}
                      placeholder="Subject B variant"
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        // Auto-create variant B from A (or template default)
                        const template = templates.find((t) => t.id === step.templateId);
                        const baseSubject = step.subjectVariantA || template?.subject || "";
                        onChange({ ...step, subjectVariantB: baseSubject });
                      }}
                      className="inline-flex items-center gap-1.5 rounded border border-dashed border-[#FF005A]/50 px-3 py-1.5 text-xs font-semibold text-[#FF005A] hover:bg-[#FF005A]/[0.06]"
                    >
                      <FlaskConical className="h-3 w-3" />
                      Auto-create variant B
                    </button>
                  )}
                  {step.subjectVariantB && (
                    <p className="mt-1 text-[10px] text-neutral-500">
                      Recipients are split 50/50 between A and B. The report shows metrics per variant.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ── D. Delay ── */}
          <section className="rounded-lg border border-neutral-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF005A] text-xs font-bold text-white">D</span>
              <h4 className="text-sm font-bold text-neutral-800">Delay — wait before sending</h4>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={step.delayValue}
                onChange={(e) => onChange({ ...step, delayValue: parseInt(e.target.value) || 0 })}
                className="w-20 rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <select
                value={step.delayUnit}
                onChange={(e) => onChange({ ...step, delayUnit: e.target.value as "MINUTES" | "HOURS" | "DAYS" })}
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="MINUTES">minutes</option>
                <option value="HOURS">hours</option>
                <option value="DAYS">days</option>
              </select>
              <span className="self-center text-xs text-neutral-500">after trigger fires</span>
            </div>
            <p className="mt-1 text-[10px] text-neutral-500">
              Use 0 for immediate send. Delay is measured from when the trigger event occurs.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
