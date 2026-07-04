"use client";

/**
 * FilterBuilder — visual editor for EmailFlowStep.filterJson.
 *
 * Renders a nested AND/OR/NOT tree with leaf predicates. Each leaf has
 * a field picker, operator picker, and value input. Supports comma-
 * separated fields (interestedIn, profileCategories) via CONTAINS_ANY
 * / CONTAINS_ALL operators.
 *
 * The tree serializes to/from the Filter type defined in
 * `@/lib/email-orchestrator/flow-filter`.
 */

import { Plus, X, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Filter, FilterField, LeafOp } from "@/lib/email-orchestrator/flow-filter";

const FIELDS: { value: FilterField; label: string; group: "User" | "RSVP" }[] = [
  { value: "company", label: "Company", group: "User" },
  { value: "companyUrl", label: "Company URL", group: "User" },
  { value: "interestedIn", label: "Interested In", group: "User" },
  { value: "profileCategories", label: "Profile Categories", group: "User" },
  { value: "appliedFor", label: "Applied For", group: "User" },
  { value: "invitedToSpeak", label: "Invited To Speak", group: "User" },
  { value: "role", label: "Role", group: "User" },
  { value: "email", label: "Email", group: "User" },
  { value: "rsvpStatus", label: "RSVP Status", group: "RSVP" },
  { value: "checkedInAt", label: "Checked In", group: "RSVP" },
  { value: "attendedAt", label: "Attended", group: "RSVP" },
  { value: "doorCheckedAt", label: "Door Checked", group: "RSVP" },
  { value: "noShow", label: "No-Show", group: "RSVP" },
];

const LEAF_OPS: { value: LeafOp; label: string }[] = [
  { value: "EQ", label: "equals" },
  { value: "NEQ", label: "not equals" },
  { value: "CONTAINS", label: "contains" },
  { value: "NOT_CONTAINS", label: "does not contain" },
  { value: "IN", label: "is in list" },
  { value: "NOT_IN", label: "is not in list" },
  { value: "CONTAINS_ANY", label: "contains any of" },
  { value: "CONTAINS_ALL", label: "contains all of" },
  { value: "IS_NULL", label: "is empty" },
  { value: "NOT_NULL", label: "is not empty" },
];

const NULL_OPS: LeafOp[] = ["IS_NULL", "NOT_NULL"];
const LIST_OPS: LeafOp[] = ["IN", "NOT_IN", "CONTAINS_ANY", "CONTAINS_ALL"];

export function FilterBuilder({
  value,
  onChange,
}: {
  value: Filter | null;
  onChange: (f: Filter | null) => void;
}) {
  if (!value) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
        No filter — all recipients pass this step.{" "}
        <button
          type="button"
          onClick={() => onChange({ op: "AND", children: [] })}
          className="inline-flex items-center gap-1 text-[#FF005A] hover:underline"
        >
          <Plus className="h-3 w-3" /> Add first condition
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FilterNode node={value} onChange={(n) => onChange(n)} onDelete={() => onChange(null)} />
    </div>
  );
}

function FilterNode({
  node,
  onChange,
  onDelete,
}: {
  node: Filter;
  onChange: (n: Filter) => void;
  onDelete: () => void;
}) {
  // Composite nodes (AND/OR/NOT)
  if (node.op === "AND" || node.op === "OR") {
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <select
            value={node.op}
            onChange={(e) => {
              const newOp = e.target.value as "AND" | "OR";
              onChange({ ...node, op: newOp });
            }}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold"
          >
            <option value="AND">ALL of (AND)</option>
            <option value="OR">ANY of (OR)</option>
          </select>
          <button
            type="button"
            onClick={() => onChange({ op: "AND", children: [...node.children, { field: "company", op: "EQ", value: "" }] })}
            className="inline-flex items-center gap-1 rounded bg-[#FF005A] px-2 py-1 text-xs font-semibold text-white hover:bg-[#d8004d]"
          >
            <Plus className="h-3 w-3" /> Add condition
          </button>
          <button
            type="button"
            onClick={() => onChange({ op: "AND", children: [...node.children, { op: "AND", children: [] }] })}
            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            <Plus className="h-3 w-3" /> Add group
          </button>
          <button type="button" onClick={onDelete} className="ml-auto text-neutral-400 hover:text-red-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-3 space-y-2 border-l-2 border-neutral-200 pl-3">
          {node.children.length === 0 && (
            <div className="text-xs italic text-neutral-400">No conditions yet.</div>
          )}
          {node.children.map((child, i) => (
            <FilterNode
              key={i}
              node={child}
              onChange={(n) => {
                const next = [...node.children];
                next[i] = n;
                onChange({ ...node, children: next });
              }}
              onDelete={() => {
                const next = node.children.filter((_, j) => j !== i);
                onChange({ ...node, children: next });
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (node.op === "NOT") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-amber-700">NOT (invert)</span>
          <button type="button" onClick={onDelete} className="ml-auto text-neutral-400 hover:text-red-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <FilterNode node={node.child} onChange={(n) => onChange({ ...node, child: n })} onDelete={() => onChange({ ...node, child: { op: "AND", children: [] } })} />
      </div>
    );
  }

  // Leaf node
  return <LeafNode node={node} onChange={onChange} onDelete={onDelete} />;
}

function LeafNode({
  node,
  onChange,
  onDelete,
}: {
  node: Extract<Filter, { field: FilterField }>;
  onChange: (n: Filter) => void;
  onDelete: () => void;
}) {
  const [valueStr, setValueStr] = useState(
    Array.isArray(node.value) ? node.value.join(", ") : (node.value ?? "")
  );

  const isNullOp = NULL_OPS.includes(node.op);
  const isListOp = LIST_OPS.includes(node.op);
  const fieldDef = FIELDS.find((f) => f.value === node.field);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-2">
      <select
        value={node.field}
        onChange={(e) => onChange({ ...node, field: e.target.value as FilterField })}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.group} → {f.label}
          </option>
        ))}
      </select>

      <select
        value={node.op}
        onChange={(e) => onChange({ ...node, op: e.target.value as LeafOp })}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {LEAF_OPS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {!isNullOp && (
        <input
          type="text"
          value={valueStr}
          onChange={(e) => setValueStr(e.target.value)}
          onBlur={() => {
            const v = valueStr.trim();
            if (isListOp) {
              const arr = v.split(",").map((s) => s.trim()).filter(Boolean);
              onChange({ ...node, value: arr });
            } else {
              onChange({ ...node, value: v });
            }
          }}
          placeholder={isListOp ? "value1, value2, ..." : "value"}
          className="min-w-[140px] flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
        />
      )}

      {fieldDef?.group === "RSVP" && node.field !== "rsvpStatus" && (
        <span className="text-[10px] text-neutral-400">(true/false)</span>
      )}

      <button type="button" onClick={onDelete} className="ml-auto text-neutral-400 hover:text-red-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
