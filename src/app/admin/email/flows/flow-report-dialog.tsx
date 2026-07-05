"use client";

/**
 * FlowReportDialog — per-flow report with breakdown by step → template →
 * subject variant A/B.
 *
 * Shows:
 *   - Flow-level summary (sent, opened, clicked, rates)
 *   - Per-step table: step #, audience, template, subject A/B, sent, opened,
 *     clicked, open rate, click rate — split by variant A and B
 *   - Recent queue items list
 */

import { useEffect, useState } from "react";
import { Loader2, X, RefreshCw, Send, Eye, MousePointerClick, MailX, Clock } from "lucide-react";

type ReportData = {
  flow: { id: string; name: string; status: string; description: string | null };
  summary: {
    sent: number;
    opened: number;
    clicked: number;
    failed: number;
    pending: number;
    skipped: number;
    total: number;
    openRate: number;
    clickRate: number;
  };
  steps: Array<{
    step: {
      id: string;
      position: number;
      audienceName: string;
      isTestAudience: boolean;
      triggerKind: string;
      templateName: string;
      templateStage: number | null;
      subjectA: string;
      subjectB: string | null;
    };
    stats: {
      sent: number;
      opened: number;
      clicked: number;
      failed: number;
      pending: number;
      skipped: number;
      total: number;
      openRate: number;
      clickRate: number;
    };
    byVariant: {
      A: VariantStats;
      B: VariantStats;
    };
  }>;
  recentQueue: Array<{
    id: string;
    email: string;
    status: string;
    subjectVariant: string;
    sentAt: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    scheduledFor: string;
    errorMessage: string | null;
  }>;
  totalCount: number;
};

type VariantStats = {
  sent: number;
  opened: number;
  clicked: number;
  failed: number;
  pending: number;
  skipped: number;
  total: number;
  openRate: number;
  clickRate: number;
};

export function FlowReportDialog({
  flowId,
  onClose,
}: {
  flowId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/email-flows/${flowId}/report`, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load report");
      const json = await r.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">
              {data?.flow.name ?? "Flow"} — Report
            </h2>
            <p className="text-xs text-neutral-500">
              Breakdown by step → template → subject variant (A/B)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              <Loader2 className="h-6 w-6 animate-spin" /> Loading report…
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Flow-level summary cards */}
              <div>
                <h3 className="mb-2 text-sm font-bold text-neutral-700">Flow summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  <SummaryCard icon={Send} label="Sent" value={data.summary.sent} color="text-blue-600" />
                  <SummaryCard icon={Eye} label="Opened" value={data.summary.opened} color="text-emerald-600" sub={data.summary.sent > 0 ? `${data.summary.openRate}%` : ""} />
                  <SummaryCard icon={MousePointerClick} label="Clicked" value={data.summary.clicked} color="text-fuchsia-600" sub={data.summary.sent > 0 ? `${data.summary.clickRate}%` : ""} />
                  <SummaryCard icon={MailX} label="Failed" value={data.summary.failed} color="text-red-600" />
                  <SummaryCard icon={Clock} label="Pending" value={data.summary.pending} color="text-amber-600" />
                  <SummaryCard icon={Send} label="Total queue" value={data.summary.total} color="text-neutral-700" />
                  <SummaryCard icon={MailX} label="Skipped" value={data.summary.skipped} color="text-zinc-500" />
                </div>
              </div>

              {/* Per-step breakdown table */}
              <div>
                <h3 className="mb-2 text-sm font-bold text-neutral-700">Per-step breakdown (by template + subject variant)</h3>
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">#</th>
                        <th className="px-3 py-2 text-left font-semibold">Step</th>
                        <th className="px-3 py-2 text-left font-semibold">Variant</th>
                        <th className="px-3 py-2 text-left font-semibold">Subject</th>
                        <th className="px-3 py-2 text-right font-semibold">Sent</th>
                        <th className="px-3 py-2 text-right font-semibold">Opened</th>
                        <th className="px-3 py-2 text-right font-semibold">Open %</th>
                        <th className="px-3 py-2 text-right font-semibold">Clicked</th>
                        <th className="px-3 py-2 text-right font-semibold">Click %</th>
                        <th className="px-3 py-2 text-right font-semibold">Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.steps.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                            No steps in this flow yet.
                          </td>
                        </tr>
                      ) : (
                        data.steps.map((s) => (
                          <StepRow key={s.step.id} stepData={s} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] text-neutral-500">
                  Each step shows two rows (A and B) when an A/B test is configured, or one row (A) otherwise.
                  &ldquo;—&rdquo; means the variant has no sends yet.
                </p>
              </div>

              {/* Recent queue items */}
              <div>
                <h3 className="mb-2 text-sm font-bold text-neutral-700">
                  Recent sends ({data.recentQueue.length} of {data.totalCount})
                </h3>
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Email</th>
                        <th className="px-3 py-2 text-left font-semibold">Variant</th>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">Sent</th>
                        <th className="px-3 py-2 text-left font-semibold">Opened</th>
                        <th className="px-3 py-2 text-left font-semibold">Clicked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentQueue.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                            No queue items yet. Click &ldquo;Send to audience&rdquo; in the orchestrator or trigger the flow.
                          </td>
                        </tr>
                      ) : (
                        data.recentQueue.map((q) => (
                          <tr key={q.id} className="border-t border-neutral-100">
                            <td className="px-3 py-2 font-mono text-[11px]">{q.email}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${q.subjectVariant === "B" ? "bg-[#FF005A]/10 text-[#FF005A]" : "bg-[#00E6FF]/10 text-black"}`}>
                                {q.subjectVariant}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <StatusPill status={q.status} />
                            </td>
                            <td className="px-3 py-2 text-neutral-600">{q.sentAt ? formatDate(q.sentAt) : "—"}</td>
                            <td className="px-3 py-2 text-neutral-600">{q.openedAt ? formatDate(q.openedAt) : "—"}</td>
                            <td className="px-3 py-2 text-neutral-600">{q.clickedAt ? formatDate(q.clickedAt) : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StepRow — renders 1 or 2 rows (A and/or B) per step
// ─────────────────────────────────────────────────────────────────────────────

function StepRow({ stepData }: { stepData: ReportData["steps"][number] }) {
  const { step, stats, byVariant } = stepData;
  const hasB = step.subjectB !== null;
  const variantBLabel = step.subjectB ?? "";
  const variantALabel = step.subjectA ?? "—";

  return (
    <>
      {/* Step header row (spans all columns) */}
      <tr className="border-t-2 border-neutral-200 bg-neutral-50/50">
        <td className="px-3 py-2 font-bold text-neutral-700" rowSpan={hasB ? 3 : 2}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF005A] text-xs font-bold text-white">
            {step.position}
          </span>
        </td>
        <td className="px-3 py-2 text-neutral-700" rowSpan={hasB ? 3 : 2}>
          <div className="font-semibold">{step.templateName}</div>
          <div className="text-[10px] text-neutral-500">
            {step.triggerKind === "—" ? "Manual" : step.triggerKind.replace(/_/g, " ").toLowerCase()}
          </div>
          <div className="text-[10px] text-neutral-500">
            👥 {step.audienceName}
            {step.isTestAudience && (
              <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">TEST</span>
            )}
          </div>
          <div className="mt-1 text-[10px] font-semibold text-neutral-600">
            Total: {stats.sent} sent · {stats.opened} opened ({stats.openRate}%) · {stats.clicked} clicked ({stats.clickRate}%)
          </div>
        </td>
        <td className="px-3 py-2">
          <span className="rounded bg-[#00E6FF] px-1.5 py-0.5 text-[10px] font-bold text-black">A</span>
        </td>
        <td className="px-3 py-2 text-[11px] text-neutral-700 max-w-[280px] truncate" title={variantALabel}>
          {variantALabel}
        </td>
        <td className="px-3 py-2 text-right font-mono">{byVariant.A.sent}</td>
        <td className="px-3 py-2 text-right font-mono">{byVariant.A.opened}</td>
        <td className="px-3 py-2 text-right font-mono text-emerald-600">{byVariant.A.openRate}%</td>
        <td className="px-3 py-2 text-right font-mono">{byVariant.A.clicked}</td>
        <td className="px-3 py-2 text-right font-mono text-fuchsia-600">{byVariant.A.clickRate}%</td>
        <td className="px-3 py-2 text-right font-mono text-red-600">{byVariant.A.failed}</td>
      </tr>
      {hasB && (
        <tr className="bg-neutral-50/50">
          <td className="px-3 py-2">
            <span className="rounded bg-[#FF005A] px-1.5 py-0.5 text-[10px] font-bold text-white">B</span>
          </td>
          <td className="px-3 py-2 text-[11px] text-neutral-700 max-w-[280px] truncate" title={variantBLabel}>
            {variantBLabel}
          </td>
          <td className="px-3 py-2 text-right font-mono">{byVariant.B.sent}</td>
          <td className="px-3 py-2 text-right font-mono">{byVariant.B.opened}</td>
          <td className="px-3 py-2 text-right font-mono text-emerald-600">{byVariant.B.openRate}%</td>
          <td className="px-3 py-2 text-right font-mono">{byVariant.B.clicked}</td>
          <td className="px-3 py-2 text-right font-mono text-fuchsia-600">{byVariant.B.clickRate}%</td>
          <td className="px-3 py-2 text-right font-mono text-red-600">{byVariant.B.failed}</td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <div className={`text-xl font-extrabold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-500">{sub} of sent</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    SENT: "bg-blue-100 text-blue-800",
    OPENED: "bg-emerald-100 text-emerald-800",
    CLICKED: "bg-fuchsia-100 text-fuchsia-800",
    SKIPPED: "bg-zinc-100 text-zinc-700",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${colors[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}
