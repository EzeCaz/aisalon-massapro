"use client";

/**
 * BranchRulesEditor — visual editor for EmailFlowStep.branchRulesJson.
 *
 * Each branch rule is a row: [condition] → [action: HALT/GOTO/CONTINUE]
 * + optional target step position (required for GOTO).
 *
 * Rules are evaluated in order. First match wins. The editor shows a
 * hint about this so users understand the precedence.
 */

import { Plus, X, ArrowRight, Ban, SkipForward } from "lucide-react";
import type { BranchRule, BranchAction, BranchRuleEntry } from "@/lib/email-orchestrator/flow-branches";

const RULES: { value: BranchRule; label: string; description: string }[] = [
  { value: "OPENED", label: "If opened", description: "Recipient opened the email" },
  { value: "NOT_OPENED", label: "If not opened", description: "Recipient did NOT open the email" },
  { value: "CLICKED", label: "If clicked", description: "Recipient clicked a link in the email" },
  { value: "NOT_CLICKED", label: "If not clicked", description: "Recipient did NOT click any link" },
  { value: "RSVP_CANCELLED", label: "If RSVP cancelled", description: "Recipient changed RSVP to NOT_GOING" },
  { value: "DOOR_CHECKED_IN", label: "If door checked-in", description: "Recipient was checked in at the door" },
  { value: "MARKED_ATTENDED", label: "If attended", description: "Recipient was marked as attended" },
  { value: "MARKED_NO_SHOW", label: "If no-show", description: "Recipient was marked as no-show" },
];

const ACTIONS: { value: BranchAction; label: string; icon: typeof Ban }[] = [
  { value: "HALT", label: "Halt the flow", icon: Ban },
  { value: "GOTO", label: "Jump to step", icon: ArrowRight },
  { value: "CONTINUE", label: "Continue to next step", icon: SkipForward },
];

export function BranchRulesEditor({
  value,
  onChange,
  maxStepPosition,
}: {
  value: BranchRuleEntry[];
  onChange: (rules: BranchRuleEntry[]) => void;
  /** The max step position available in this flow (for GOTO dropdown). */
  maxStepPosition: number;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
        Rules are evaluated in order. The first matching rule wins. If no rules match, the flow continues to the next step.
      </div>

      {value.length === 0 && (
        <div className="rounded-md border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
          No branch rules. The flow will always advance to the next step after the configured delay.
        </div>
      )}

      {value.map((rule, i) => (
        <BranchRuleRow
          key={i}
          rule={rule}
          maxStepPosition={maxStepPosition}
          onChange={(r) => {
            const next = [...value];
            next[i] = r;
            onChange(next);
          }}
          onDelete={() => {
            onChange(value.filter((_, j) => j !== i));
          }}
        />
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { rule: "OPENED", action: "HALT" }])}
        className="inline-flex items-center gap-1 rounded bg-[#FF005A] px-2 py-1 text-xs font-semibold text-white hover:bg-[#d8004d]"
      >
        <Plus className="h-3 w-3" /> Add branch rule
      </button>
    </div>
  );
}

function BranchRuleRow({
  rule,
  maxStepPosition,
  onChange,
  onDelete,
}: {
  rule: BranchRuleEntry;
  maxStepPosition: number;
  onChange: (r: BranchRuleEntry) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-2">
      <select
        value={rule.rule}
        onChange={(e) => onChange({ ...rule, rule: e.target.value as BranchRule })}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {RULES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label} — {r.description}
          </option>
        ))}
      </select>

      <span className="text-neutral-400">→</span>

      <select
        value={rule.action}
        onChange={(e) => onChange({ ...rule, action: e.target.value as BranchAction })}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {ACTIONS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>

      {rule.action === "GOTO" && (
        <select
          value={rule.targetStepPosition ?? 2}
          onChange={(e) => onChange({ ...rule, targetStepPosition: parseInt(e.target.value) })}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        >
          {Array.from({ length: maxStepPosition }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Step {n}
            </option>
          ))}
        </select>
      )}

      <button type="button" onClick={onDelete} className="ml-auto text-neutral-400 hover:text-red-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
