"use client";

/**
 * ReportClient — unified Email Report page.
 *
 * Renders a single filterable, sortable, multi-selectable table that blends:
 *   - Campaign rows (type "campaign")
 *   - Flow-linked campaign rows (type "flow")
 *   - Manual queue-send rows (type "manual")
 *
 * Features (per the user's spec):
 *   A) Type column — flow / campaign / manual
 *   B) Filter + sort on every column (click a header to sort, type to filter)
 *   C) One-click filter chips for Flows / Campaigns at the top — each opens
 *      a multi-select dropdown with search + select-all/unselect-all
 *   D) Preview-email eye button on each row — opens a modal rendering the
 *      email HTML as it was sent (bodyHtmlSnapshot for campaigns,
 *      htmlBody for manual queue items)
 *   E) Audience column with the audience name
 *   F) Checkbox on the left of each row (with select-all in the header) +
 *      batch action bar: "Duplicate" or "Send to another audience"
 *
 * The data is fetched from /api/admin/email/report/list (server-side join
 * across EmailCampaign + EmailQueue + EmailRecipient). Batch actions
 * delegate to /api/admin/email/report/batch-action.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Eye,
  RefreshCw,
  Loader2,
  Copy,
  Send,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
  Users,
  CheckCheck,
  Square,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ReportRow = {
  id: string;
  type: "campaign" | "flow" | "manual";
  name: string;
  subject: string;
  status: string;
  audienceName: string;
  audienceId: string | null;
  flowId: string | null;
  flowName: string | null;
  templateId: string | null;
  templateName: string | null;
  recipients: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
  bodyHtml: string | null;
  listSource: string | null;
  creatorEmail: string | null;
};

type AudienceInfo = {
  id: string;
  name: string;
  slug: string | null;
  kind: string;
  isTest: boolean;
  flowStepsCount: number;
};

type ReportListResponse = {
  rows: ReportRow[];
  flows: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
};

type SortKey =
  | "type"
  | "name"
  | "subject"
  | "status"
  | "audienceName"
  | "flowName"
  | "templateName"
  | "recipients"
  | "sentCount"
  | "openedCount"
  | "clickedCount"
  | "failedCount"
  | "sentAt"
  | "createdAt";

type SortDir = "asc" | "desc";

// ── Main component ───────────────────────────────────────────────────────────

export function ReportClient({ audiences }: { audiences: AudienceInfo[] }) {
  const [data, setData] = React.useState<ReportListResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<Set<string>>(new Set()); // empty = all
  const [statusFilter, setStatusFilter] = React.useState<Set<string>>(new Set());
  const [flowFilter, setFlowFilter] = React.useState<Set<string>>(new Set());
  const [campaignFilter, setCampaignFilter] = React.useState<Set<string>>(new Set());

  // Sort
  const [sortKey, setSortKey] = React.useState<SortKey>("sentAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  // Selection (batch actions)
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Preview modal
  const [previewRow, setPreviewRow] = React.useState<ReportRow | null>(null);

  // Batch action modal
  const [batchActionOpen, setBatchActionOpen] = React.useState<null | "duplicate" | "send_to_audience">(null);
  const [batchAudienceId, setBatchAudienceId] = React.useState<string>("");
  const [batchWorking, setBatchWorking] = React.useState(false);

  // ── Data fetch ────────────────────────────────────────────────────────────
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email/report/list", { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed to load report (${res.status})`);
      }
      const json = (await res.json()) as ReportListResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived: filtered + sorted rows ───────────────────────────────────────
  const rows = data?.rows ?? [];

  const filteredRows = React.useMemo(() => {
    let r = rows;
    // Search filter (matches name, subject, audience, flow, template)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((row) =>
        row.name.toLowerCase().includes(q) ||
        row.subject.toLowerCase().includes(q) ||
        row.audienceName.toLowerCase().includes(q) ||
        (row.flowName ?? "").toLowerCase().includes(q) ||
        (row.templateName ?? "").toLowerCase().includes(q) ||
        (row.creatorEmail ?? "").toLowerCase().includes(q)
      );
    }
    // Type filter
    if (typeFilter.size > 0) {
      r = r.filter((row) => typeFilter.has(row.type));
    }
    // Status filter
    if (statusFilter.size > 0) {
      r = r.filter((row) => statusFilter.has(row.status));
    }
    // Flow filter (only flow-type rows match)
    if (flowFilter.size > 0) {
      r = r.filter((row) => row.flowId && flowFilter.has(row.flowId));
    }
    // Campaign filter (only campaign-type rows match by campaign id)
    if (campaignFilter.size > 0) {
      r = r.filter((row) =>
        row.type === "campaign" && campaignFilter.has(row.id.replace(/^campaign:/, ""))
      );
    }
    // Sort
    r = [...r].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // nulls/undefineds always sort last regardless of dir
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, search, typeFilter, statusFilter, flowFilter, campaignFilter, sortKey, sortDir]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allVisibleIds = filteredRows.map((r) => r.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someSelected = allVisibleIds.some((id) => selected.has(id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of allVisibleIds) next.delete(id);
      } else {
        for (const id of allVisibleIds) next.add(id);
      }
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // ── Sort handler ──────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc"); // default to desc on first click (most-recent-first)
    }
  };

  // ── Batch action submit ───────────────────────────────────────────────────
  const submitBatchAction = async () => {
    if (selected.size === 0) return;
    if (batchActionOpen === "send_to_audience" && !batchAudienceId) {
      toast.error("Please pick an audience to send to.");
      return;
    }
    setBatchWorking(true);
    try {
      const res = await fetch("/api/admin/email/report/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: batchActionOpen,
          rowIds: Array.from(selected),
          audienceId: batchActionOpen === "send_to_audience" ? batchAudienceId : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Batch action failed");
        return;
      }
      const verb = batchActionOpen === "duplicate" ? "duplicated" : "sent";
      toast.success(
        `${d.duplicated} campaign${d.duplicated === 1 ? "" : "s"} ${verb}` +
        (d.sent ? ` · ${d.sent} sent to audience` : "") +
        (d.skipped ? ` · ${d.skipped} manual row${d.skipped === 1 ? "" : "s"} skipped` : "") +
        (d.errors?.length ? ` · ${d.errors.length} error${d.errors.length === 1 ? "" : "s"}` : "")
      );
      // Surface per-row errors as a separate toast for visibility.
      if (d.errors?.length > 0) {
        toast.error(d.errors.slice(0, 3).join("\n"));
      }
      setBatchActionOpen(null);
      setBatchAudienceId("");
      clearSelection();
      await fetchData();
    } catch {
      toast.error("Batch action failed (network error)");
    } finally {
      setBatchWorking(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-12 text-center text-sm text-black/70">
        <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
        Loading report…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-semibold mb-1">Failed to load report</p>
        <p className="text-xs">{error}</p>
        <Button onClick={fetchData} variant="outline" size="sm" className="mt-3">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top toolbar: search + refresh + one-click type filter chips ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, subject, audience, flow, template…"
            className="pl-8"
          />
        </div>

        {/* One-click type filter chips (clear-on-second-click pattern) */}
        <TypeFilterChip
          label="Flows"
          active={typeFilter.has("flow")}
          onClick={() => {
            setTypeFilter((prev) => {
              const next = new Set(prev);
              if (next.has("flow")) next.delete("flow");
              else next.add("flow");
              return next;
            });
          }}
          color="bg-[#FF005A]"
        />
        <TypeFilterChip
          label="Campaigns"
          active={typeFilter.has("campaign")}
          onClick={() => {
            setTypeFilter((prev) => {
              const next = new Set(prev);
              if (next.has("campaign")) next.delete("campaign");
              else next.add("campaign");
              return next;
            });
          }}
          color="bg-[#004F98]"
        />
        <TypeFilterChip
          label="Manual"
          active={typeFilter.has("manual")}
          onClick={() => {
            setTypeFilter((prev) => {
              const next = new Set(prev);
              if (next.has("manual")) next.delete("manual");
              else next.add("manual");
              return next;
            });
          }}
          color="bg-[#820A7D]"
        />

        {(typeFilter.size > 0 || statusFilter.size > 0 || flowFilter.size > 0 || campaignFilter.size > 0) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypeFilter(new Set());
              setStatusFilter(new Set());
              setFlowFilter(new Set());
              setCampaignFilter(new Set());
            }}
            className="h-9 text-xs"
          >
            <X className="h-3 w-3 mr-1" /> Clear filters
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="h-9 ml-auto"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* ── Multi-select filters for Flows + Campaigns ── */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Flows"
          icon={<Filter className="h-3 w-3" />}
          options={data?.flows ?? []}
          selected={flowFilter}
          onChange={setFlowFilter}
          color="#FF005A"
        />
        <MultiSelectFilter
          label="Campaigns"
          icon={<Filter className="h-3 w-3" />}
          options={data?.campaigns ?? []}
          selected={campaignFilter}
          onChange={setCampaignFilter}
          color="#004F98"
        />
        <MultiSelectFilter
          label="Status"
          icon={<Filter className="h-3 w-3" />}
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onChange={setStatusFilter}
          color="#007E72"
        />
      </div>

      {/* ── Batch action bar (only when rows are selected) ── */}
      {selected.size > 0 && (
        <div className="rounded-lg border border-[#FF005A]/30 bg-[#FF005A]/5 p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-black">
            {selected.size} row{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBatchActionOpen("duplicate")}
              className="h-8"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Duplicate
            </Button>
            <Button
              size="sm"
              onClick={() => setBatchActionOpen("send_to_audience")}
              className="h-8 bg-[#FF005A] hover:bg-[#d8004d] text-white"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send to another audience
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              className="h-8"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Main table ── */}
      <div className="rounded-lg border border-black/10 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/80">
              <tr>
                <th className="text-left font-medium px-3 py-2.5 w-[40px]">
                  <CheckboxCell
                    checked={allSelected}
                    indeterminate={!allSelected && someSelected}
                    onClick={toggleSelectAll}
                    title="Select all visible rows"
                  />
                </th>
                <SortableTh label="Type" sortKey="type" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[80px]" />
                <SortableTh label="Name" sortKey="name" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[15%]" />
                <SortableTh label="Subject" sortKey="subject" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[18%]" />
                <SortableTh label="Status" sortKey="status" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[90px]" />
                <SortableTh label="Audience" sortKey="audienceName" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[14%]" />
                <SortableTh label="Flow" sortKey="flowName" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[10%] hidden lg:table-cell" />
                <SortableTh label="Template" sortKey="templateName" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[10%] hidden xl:table-cell" />
                <SortableTh label="Recipients" sortKey="recipients" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[80px] text-right" align="right" />
                <SortableTh label="Sent" sortKey="sentCount" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[70px] text-right" align="right" />
                <SortableTh label="Opened" sortKey="openedCount" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[70px] text-right" align="right" />
                <SortableTh label="Clicked" sortKey="clickedCount" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[70px] text-right" align="right" />
                <SortableTh label="Sent at" sortKey="sentAt" currentSort={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[110px] hidden md:table-cell" />
                <th className="text-right font-medium px-3 py-2.5 w-[60px]">Preview</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-12 text-center text-black/60">
                    {rows.length === 0
                      ? "No email activity yet."
                      : "No rows match the current filters."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isSelected = selected.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-black/5 hover:bg-black/[0.02] ${isSelected ? "bg-[#FF005A]/[0.04]" : ""}`}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <CheckboxCell
                          checked={isSelected}
                          onClick={() => toggleRow(row.id)}
                          title="Select row"
                        />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <TypeBadge type={row.type} />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-black align-top break-words whitespace-normal">
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5 text-black/70 align-top break-words whitespace-normal">
                        {row.subject}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <ReportStatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2.5 text-black/80 text-xs align-top break-words whitespace-normal">
                        {row.audienceName || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-black/80 text-xs align-top hidden lg:table-cell break-words whitespace-normal">
                        {row.flowName ? (
                          <a
                            href={`/admin/email/flows?flow=${row.flowId}`}
                            className="text-[#FF005A] hover:underline"
                          >
                            {row.flowName}
                          </a>
                        ) : (
                          <span className="text-black/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-black/80 text-xs align-top hidden xl:table-cell break-words whitespace-normal">
                        {row.templateName ? (
                          <Badge variant="outline" className="font-normal text-xs break-words whitespace-normal">
                            {row.templateName}
                          </Badge>
                        ) : (
                          <span className="text-black/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-black/80 align-top tabular-nums">
                        {row.recipients > 0 ? row.recipients : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-black/80 align-top tabular-nums">
                        {row.sentCount > 0 ? row.sentCount : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 align-top tabular-nums">
                        {row.openedCount > 0 ? row.openedCount : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-fuchsia-700 align-top tabular-nums">
                        {row.clickedCount > 0 ? row.clickedCount : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-black/80 text-xs align-top hidden md:table-cell break-words whitespace-normal">
                        {row.sentAt ? (
                          <span title={new Date(row.sentAt).toISOString()}>
                            {new Date(row.sentAt).toLocaleDateString()}{" "}
                            {new Date(row.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : (
                          <span className="text-black/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewRow(row)}
                          disabled={!row.bodyHtml}
                          className="h-7 px-2"
                          title={row.bodyHtml ? "Preview email" : "No email body available"}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row count footer */}
      <div className="text-xs text-black/60 flex items-center justify-between">
        <span>
          Showing <strong>{filteredRows.length}</strong> of <strong>{rows.length}</strong> rows
        </span>
        {selected.size > 0 && (
          <span>
            <strong>{selected.size}</strong> selected
          </span>
        )}
      </div>

      {/* ── Preview modal ── */}
      <PreviewDialog row={previewRow} onClose={() => setPreviewRow(null)} />

      {/* ── Batch action dialog ── */}
      <Dialog open={batchActionOpen !== null} onOpenChange={(o) => !o && setBatchActionOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {batchActionOpen === "duplicate" ? "Duplicate selected" : "Send to another audience"}
            </DialogTitle>
            <DialogDescription>
              {batchActionOpen === "duplicate"
                ? `Create a DRAFT copy of each selected campaign${selected.size > 1 ? " (" + selected.size + " rows)" : ""}. The new draft preserves the subject, body, template, and from/reply-to settings. You can edit + send it from the Campaigns tab.`
                : `Clone each selected campaign, swap its audience to the one you pick, then immediately send it. The original campaign is not modified. Manual rows will be skipped.`}
            </DialogDescription>
          </DialogHeader>

          {batchActionOpen === "send_to_audience" && (
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium text-black">Target audience</label>
              <Select value={batchAudienceId} onValueChange={setBatchAudienceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an audience to send to…" />
                </SelectTrigger>
                <SelectContent>
                  {audiences.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.isTest && " (test)"}
                      <span className="text-xs text-black/50 ml-2">
                        · {a.kind === "STATIC" ? "static" : "dynamic"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-black/60">
                <Users className="h-3 w-3 inline mr-1" />
                {audiences.length} audiences available in your scope.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchActionOpen(null)} disabled={batchWorking}>
              Cancel
            </Button>
            <Button
              onClick={submitBatchAction}
              disabled={batchWorking || (batchActionOpen === "send_to_audience" && !batchAudienceId)}
              className={
                batchActionOpen === "send_to_audience"
                  ? "bg-[#FF005A] hover:bg-[#d8004d] text-white"
                  : ""
              }
            >
              {batchWorking ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Working…
                </>
              ) : batchActionOpen === "duplicate" ? (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Duplicate {selected.size} row{selected.size === 1 ? "" : "s"}
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Send to audience
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { id: "DRAFT", name: "DRAFT" },
  { id: "SCHEDULED", name: "SCHEDULED" },
  { id: "SENDING", name: "SENDING" },
  { id: "SENT", name: "SENT" },
  { id: "FAILED", name: "FAILED" },
  { id: "PAUSED", name: "PAUSED" },
  { id: "PENDING", name: "PENDING" },
  { id: "OPENED", name: "OPENED" },
  { id: "CLICKED", name: "CLICKED" },
];

function TypeBadge({ type }: { type: ReportRow["type"] }) {
  const cfg = {
    flow: { label: "Flow", cls: "bg-[#FF005A]/15 text-[#FF005A]" },
    campaign: { label: "Campaign", cls: "bg-[#004F98]/15 text-[#004F98]" },
    manual: { label: "Manual", cls: "bg-[#820A7D]/15 text-[#820A7D]" },
  }[type];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  const color =
    status === "DRAFT"
      ? "bg-black/10 text-black/80"
      : status === "SCHEDULED"
      ? "bg-blue-100 text-blue-700"
      : status === "SENDING"
      ? "bg-yellow-100 text-yellow-800"
      : status === "SENT"
      ? "bg-[#007E72]/15 text-[#007E72]"
      : status === "FAILED"
      ? "bg-red-100 text-red-700"
      : status === "PAUSED"
      ? "bg-amber-100 text-amber-800"
      : status === "PENDING"
      ? "bg-amber-100 text-amber-800"
      : status === "OPENED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "CLICKED"
      ? "bg-fuchsia-100 text-fuchsia-700"
      : "bg-black/10 text-black/80";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${color}`}>
      {status}
    </span>
  );
}

function SortableTh({
  label,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  className,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
  align?: "right";
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`font-medium px-3 py-2.5 cursor-pointer select-none hover:bg-black/[0.04] ${className ?? ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        {isActive ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3 text-[#FF005A]" />
          ) : (
            <ChevronDown className="h-3 w-3 text-[#FF005A]" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-black/30" />
        )}
      </span>
    </th>
  );
}

function CheckboxCell({
  checked,
  indeterminate,
  onClick,
  title,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onClick: () => void;
  title?: string;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.dataset.indeterminate = indeterminate ? "true" : "false";
    }
  }, [indeterminate]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
        checked || indeterminate
          ? "bg-[#FF005A] border-[#FF005A] text-white"
          : "border-black/30 hover:border-[#FF005A]"
      }`}
      style={indeterminate ? { background: "#FF005A", borderColor: "#FF005A" } : undefined}
    >
      {indeterminate ? (
        <span className="block h-0.5 w-2 bg-white" />
      ) : checked ? (
        <CheckCheck className="h-3 w-3" />
      ) : null}
    </button>
  );
}

function TypeFilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border ${
        active
          ? `${color} text-white border-transparent`
          : "bg-white text-black/80 border-black/15 hover:border-black/30"
      }`}
    >
      {label}
      {active && <X className="h-3 w-3" />}
    </button>
  );
}

/**
 * MultiSelectFilter — a dropdown button that opens a panel with a list of
 * checkboxes + search + select-all/unselect-all. Used for the Flows,
 * Campaigns, and Status filters.
 *
 * Click outside to close. The button shows the count of selected items
 * next to the label.
 */
function MultiSelectFilter({
  label,
  icon,
  options,
  selected,
  onChange,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  options: { id: string; name: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  color: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filteredOptions = React.useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const allVisibleSelected = filteredOptions.length > 0 && filteredOptions.every((o) => selected.has(o.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const selectAll = () => {
    const next = new Set(selected);
    for (const o of filteredOptions) next.add(o.id);
    onChange(next);
  };

  const unselectAll = () => {
    const next = new Set(selected);
    for (const o of filteredOptions) next.delete(o.id);
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
          selected.size > 0
            ? "border-transparent text-white"
            : "bg-white border-black/15 text-black/80 hover:border-black/30"
        }`}
        style={selected.size > 0 ? { background: color } : undefined}
      >
        {icon}
        {label}
        {selected.size > 0 && (
          <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[0.6rem] font-bold">
            {selected.size}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 max-h-80 flex flex-col rounded-lg border border-black/15 bg-white shadow-xl">
          {/* Search box */}
          <div className="p-2 border-b border-black/10">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-black/40" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="h-8 pl-7 text-xs"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-[0.65rem]">
              <button
                onClick={selectAll}
                disabled={filteredOptions.length === 0 || allVisibleSelected}
                className="inline-flex items-center gap-1 text-[#FF005A] hover:underline disabled:opacity-30 disabled:no-underline"
              >
                <CheckCheck className="h-3 w-3" /> Select all
              </button>
              <button
                onClick={unselectAll}
                disabled={filteredOptions.length === 0 || !filteredOptions.some((o) => selected.has(o.id))}
                className="inline-flex items-center gap-1 text-black/60 hover:underline disabled:opacity-30 disabled:no-underline"
              >
                <Square className="h-3 w-3" /> Unselect all
              </button>
            </div>
          </div>
          {/* Options list */}
          <div className="flex-1 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-black/50">
                {options.length === 0 ? "No options." : "No matches."}
              </div>
            ) : (
              filteredOptions.map((o) => {
                const checked = selected.has(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-black/[0.03] ${
                      checked ? "bg-[#FF005A]/[0.04]" : ""
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                        checked ? "bg-[#FF005A] border-[#FF005A] text-white" : "border-black/30"
                      }`}
                    >
                      {checked && <CheckCheck className="h-3 w-3" />}
                    </span>
                    <span className="break-words whitespace-normal">{o.name}</span>
                  </button>
                );
              })
            )}
          </div>
          {/* Footer */}
          <div className="p-2 border-t border-black/10 flex items-center justify-between">
            <span className="text-[0.65rem] text-black/60">
              {selected.size} of {options.length} selected
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-[#FF005A] hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PreviewDialog — renders the email HTML in a sandboxed iframe so the
 * admin can see exactly what was sent. The iframe is sandboxed without
 * allow-scripts to prevent any embedded scripts from running.
 */
function PreviewDialog({
  row,
  onClose,
}: {
  row: ReportRow | null;
  onClose: () => void;
}) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Write the email HTML into the iframe via srcdoc (simplest + safest).
  React.useEffect(() => {
    if (row?.bodyHtml && iframeRef.current) {
      // iframe srcdoc handles the HTML directly. We add a tiny base style
      // reset so the email renders as it would in a real client.
      const styled = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;background:#fff;}img{max-width:100%;height:auto;}a{color:#FF005A;}</style></head><body>${row.bodyHtml}</body></html>`;
      iframeRef.current.srcdoc = styled;
    }
  }, [row]);

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="break-words whitespace-normal">
            {row?.name ?? "Email preview"}
          </DialogTitle>
          <DialogDescription className="break-words whitespace-normal">
            {row?.subject ?? ""}
            {row?.sentAt && (
              <span className="ml-2 text-xs text-black/60">
                · sent {new Date(row.sentAt).toLocaleString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 rounded-md border border-black/10 overflow-hidden bg-white">
          {row?.bodyHtml ? (
            <iframe
              ref={iframeRef}
              title="email preview"
              sandbox=""
              className="w-full h-full border-0"
            />
          ) : (
            <div className="p-8 text-center text-sm text-black/60">
              No email body available for this row.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
