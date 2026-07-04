"use client";

/**
 * FlowBuilderCanvas — the main visual editor for an EmailFlow.
 *
 * Layout:
 *   - Top: flow name (editable), trigger selector, status pill, Save/Publish buttons.
 *   - Middle: horizontal scrollable row of step cards connected by arrows.
 *     Each step card shows: position badge, name, template thumbnail,
 *     delay chip, branch chips.
 *   - Right side: Sheet (480px) opens when a step is clicked, with the
 *     StepEditor inside.
 *
 * The component is a controlled component — the parent owns the flow
 * state and passes it down via `flow` + `onChange`. Save is the parent's
 * responsibility.
 */

import { useState } from "react";
import {
  Plus, X, ArrowRight, Clock, Ban, SkipForward, Mail, Pencil, Loader2,
} from "lucide-react";
import type { BranchRuleEntry } from "@/lib/email-orchestrator/flow-branches";
import type { Filter } from "@/lib/email-orchestrator/flow-filter";
import { BranchRulesEditor } from "./branch-rules-editor";
import { FilterBuilder } from "./filter-builder";

export type FlowTemplate = {
  id: string;
  name: string;
  subject: string;
  stage: number;
};

export type FlowStep = {
  id?: string;
  position: number;
  templateId: string | null;
  subjectOverride: string | null;
  delayValue: number;
  delayUnit: "MINUTES" | "HOURS" | "DAYS";
  branchRulesJson: string | null;
  filterJson: string | null;
};

export type FlowData = {
  id?: string;
  name: string;
  description?: string | null;
  triggerKind: string;
  triggerEventId?: string | null;
  status: string;
  branchEvaluationDelayHours: number;
  steps: FlowStep[];
};

const TRIGGER_KINDS = [
  { value: "RSVP_GOING", label: "RSVP created (registered)" },
  { value: "DOOR_CHECKED_IN", label: "Door checked-in" },
  { value: "MARKED_ATTENDED", label: "Marked as attended" },
  { value: "MARKED_NO_SHOW", label: "Marked as no-show" },
  { value: "MANUAL", label: "Manual (admin adds)" },
];

const STATUSES = [
  { value: "DRAFT", label: "Draft", color: "bg-neutral-200 text-neutral-700" },
  { value: "ACTIVE", label: "Active", color: "bg-green-100 text-green-700" },
  { value: "PAUSED", label: "Paused", color: "bg-amber-100 text-amber-700" },
  { value: "ARCHIVED", label: "Archived", color: "bg-neutral-100 text-neutral-500 line-through" },
];

export function FlowBuilderCanvas({
  flow,
  templates,
  events,
  onChange,
  onSave,
  saving,
}: {
  flow: FlowData;
  templates: FlowTemplate[];
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
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUSES.find((s) => s.value === flow.status)?.color}`}>
            {STATUSES.find((s) => s.value === flow.status)?.label}
          </span>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded bg-[#FF005A] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d8004d] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs">
            <span className="mb-1 block font-semibold text-neutral-700">Trigger</span>
            <select
              value={flow.triggerKind}
              onChange={(e) => onChange({ ...flow, triggerKind: e.target.value })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {TRIGGER_KINDS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="mb-1 block font-semibold text-neutral-700">Event</span>
            <select
              value={flow.triggerEventId ?? ""}
              onChange={(e) => onChange({ ...flow, triggerEventId: e.target.value || null })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">All events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="mb-1 block font-semibold text-neutral-700">Branch eval delay (hours)</span>
            <input
              type="number"
              min={0}
              value={flow.branchEvaluationDelayHours}
              onChange={(e) => onChange({ ...flow, branchEvaluationDelayHours: parseInt(e.target.value) || 0 })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      {/* Canvas — step cards */}
      <div className="flex-1 overflow-x-auto bg-neutral-50 p-6">
        <div className="flex items-stretch gap-2">
          {flow.steps.map((step, i) => (
            <div key={step.position} className="flex items-center gap-2">
              <StepCard
                step={step}
                template={templates.find((t) => t.id === step.templateId)}
                onClick={() => setEditingStep(step.position)}
              />
              {i < flow.steps.length - 1 && (
                <ArrowRight className="h-5 w-5 shrink-0 text-neutral-400" />
              )}
            </div>
          ))}

          {flow.steps.length < 5 && (
            <button
              onClick={() => {
                const newPosition = flow.steps.length + 1;
                onChange({
                  ...flow,
                  steps: [
                    ...flow.steps,
                    {
                      position: newPosition,
                      templateId: null,
                      subjectOverride: null,
                      delayValue: 0,
                      delayUnit: "HOURS",
                      branchRulesJson: null,
                      filterJson: null,
                    },
                  ],
                });
              }}
              className="flex h-[280px] w-[180px] shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-[#FF005A] hover:text-[#FF005A]"
            >
              <div className="text-center">
                <Plus className="mx-auto mb-2 h-8 w-8" />
                <div className="text-sm font-semibold">Add step</div>
                <div className="text-xs">Max 5</div>
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
          maxStepPosition={flow.steps.length}
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

function StepCard({
  step,
  template,
  onClick,
}: {
  step: FlowStep;
  template?: FlowTemplate;
  onClick: () => void;
}) {
  const branches: BranchRuleEntry[] = step.branchRulesJson
    ? (() => {
        try {
          return JSON.parse(step.branchRulesJson) as BranchRuleEntry[];
        } catch {
          return [];
        }
      })()
    : [];

  return (
    <div
      onClick={onClick}
      className="flex h-[280px] w-[220px] cursor-pointer flex-col rounded-lg border border-neutral-200 bg-white p-3 shadow-sm hover:border-[#FF005A] hover:shadow-md"
    >
      {/* Header: position + edit */}
      <div className="mb-2 flex items-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF005A] text-xs font-bold text-white">
          {step.position}
        </span>
        <button className="ml-auto text-neutral-400 hover:text-[#FF005A]">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Template name or "wait-only" */}
      <div className="mb-2 flex-1 overflow-hidden">
        {template ? (
          <>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-neutral-700">
              <Mail className="h-3 w-3" /> {template.name}
            </div>
            <div className="text-[10px] leading-tight text-neutral-500 line-clamp-3">
              {step.subjectOverride || template.subject}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-neutral-400">
            <Clock className="mb-1 h-6 w-6" />
            Wait-only step
            <div className="text-[10px]">No email sent</div>
          </div>
        )}
      </div>

      {/* Delay chip */}
      <div className="mb-2 inline-flex items-center gap-1 self-start rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
        <Clock className="h-3 w-3" />
        {step.delayValue > 0 ? `${step.delayValue}${step.delayUnit[0].toLowerCase()} after prev` : "Immediate"}
      </div>

      {/* Branch chips */}
      <div className="space-y-1">
        {branches.length === 0 ? (
          <div className="text-[10px] italic text-neutral-400">No branches</div>
        ) : (
          branches.map((b, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px] text-neutral-700">
              {b.action === "HALT" ? <Ban className="h-3 w-3 text-red-500" /> : b.action === "GOTO" ? <ArrowRight className="h-3 w-3 text-blue-500" /> : <SkipForward className="h-3 w-3 text-green-500" />}
              <span>
                {b.rule.replace(/_/g, " ").toLowerCase()} →{" "}
                {b.action === "GOTO" ? `step ${b.targetStepPosition}` : b.action.toLowerCase()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StepEditorSheet({
  step,
  templates,
  maxStepPosition,
  onChange,
  onClose,
}: {
  step: FlowStep;
  templates: FlowTemplate[];
  maxStepPosition: number;
  onChange: (s: FlowStep) => void;
  onClose: () => void;
}) {
  const branches: BranchRuleEntry[] = step.branchRulesJson
    ? (() => {
        try {
          return JSON.parse(step.branchRulesJson) as BranchRuleEntry[];
        } catch {
          return [];
        }
      })()
    : [];

  const filter: Filter | null = step.filterJson
    ? (() => {
        try {
          return JSON.parse(step.filterJson) as Filter;
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
          <h3 className="text-lg font-bold">Step {step.position} editor</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Template */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Email template</label>
            <select
              value={step.templateId ?? ""}
              onChange={(e) => onChange({ ...step, templateId: e.target.value || null })}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">— Wait-only step (no email) —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  Stage {t.stage}: {t.name} — {t.subject}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-neutral-500">
              Wait-only steps don't send an email — they're useful for delays between sends.
            </p>
          </div>

          {/* Subject override */}
          {step.templateId && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-700">Subject override (optional)</label>
              <input
                type="text"
                value={step.subjectOverride ?? ""}
                onChange={(e) => onChange({ ...step, subjectOverride: e.target.value || null })}
                placeholder="Use template's default subject"
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          )}

          {/* Delay */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">Delay before this step fires</label>
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
              <span className="self-center text-xs text-neutral-500">
                {step.position === 1 ? "after trigger" : "after previous step sends"}
              </span>
            </div>
          </div>

          {/* Branch rules */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">
              Branch rules — what happens after this step fires
            </label>
            <p className="mb-2 text-[10px] text-neutral-500">
              Evaluated {`{branchEvaluationDelayHours}h`} after the email is sent. First matching rule wins.
            </p>
            <BranchRulesEditor
              value={branches}
              maxStepPosition={maxStepPosition}
              onChange={(rules) => onChange({ ...step, branchRulesJson: JSON.stringify(rules) })}
            />
          </div>

          {/* Audience filter */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">
              Audience filter — who receives this step
            </label>
            <p className="mb-2 text-[10px] text-neutral-500">
              Re-evaluated at send time. If a recipient no longer matches, they're skipped.
            </p>
            <FilterBuilder
              value={filter}
              onChange={(f) => onChange({ ...step, filterJson: f ? JSON.stringify(f) : null })}
            />
          </div>
        </div>
      </div>
    </>
  );
}
