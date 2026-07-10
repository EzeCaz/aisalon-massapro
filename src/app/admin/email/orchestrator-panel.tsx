"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Play,
  Loader2,
  RefreshCw,
  FlaskConical,
  Trash2,
  Mail,
  MailOpen,
  MousePointerClick,
  Ban,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  PauseCircle,
  PlayCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
} from "lucide-react";
import { STAGES, statusLabel } from "@/lib/email-orchestrator/stages";

// ----------------------------------------------------------------------------
// Sort + filter helpers
// ----------------------------------------------------------------------------

type SortKey =
  | "stage"
  | "recipient"
  | "event"
  | "variant"
  | "status"
  | "scheduled"
  | "sent"
  | "logs";

type SortDir = "asc" | "desc";

const STATUS_RANK: Record<string, number> = {
  PENDING: 1,
  QUEUED: 2,
  SENT: 3,
  OPENED: 4,
  CLICKED: 5,
  FAILED: 6,
  SKIPPED: 7,
};

function getItemValue(item: QueueItem, key: SortKey): string | number {
  switch (key) {
    case "stage":
      return item.stage;
    case "recipient":
      return (item.rsvp.name || "").toLowerCase() + item.email.toLowerCase();
    case "event":
      return (item.event?.title || "").toLowerCase();
    case "variant":
      return item.subjectVariant || "";
    case "status":
      return STATUS_RANK[item.status] ?? 99;
    case "scheduled":
      return item.scheduledFor;
    case "sent":
      return item.sentAt || "";
    case "logs":
      return item._count?.trackingLogs ?? 0;
  }
}

function compareItems(a: QueueItem, b: QueueItem, key: SortKey, dir: SortDir): number {
  const va = getItemValue(a, key);
  const vb = getItemValue(b, key);
  let cmp: number;
  if (typeof va === "number" && typeof vb === "number") {
    cmp = va - vb;
  } else {
    cmp = String(va).localeCompare(String(vb));
  }
  return dir === "asc" ? cmp : -cmp;
}

// ----------------------------------------------------------------------------
// Types — mirror server-side EmailQueue serialization.
// ----------------------------------------------------------------------------

type QueueItem = {
  id: string;
  rsvpId: string;
  eventId: string;
  userId: string | null;
  email: string;
  stage: number;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  subject: string | null;
  htmlBody: string | null;
  subjectVariant: string | null;
  audienceId: string | null;
  flowStepId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  event: { id: string; title: string; slug: string; startsAt: string };
  rsvp: {
    id: string;
    name: string | null;
    email: string;
    doorCheckedAt: string | null;
    checkInCode: string | null;
  };
  _count: { trackingLogs: number };
};

type Summary = Record<string, number>;

type QueueResponse = {
  items: QueueItem[];
  summary: Summary;
  events: { id: string; title: string; slug: string; startsAt: string }[];
  totalMatching?: number;  // total rows matching current filters (independent of pagination)
  hasMore?: boolean;       // true when more rows are available beyond the current page
};

// ----------------------------------------------------------------------------
// Main panel
// ----------------------------------------------------------------------------

export function OrchestratorPanel() {
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [summary, setSummary] = React.useState<Summary>({});
  const [events, setEvents] = React.useState<
    QueueResponse["events"]
  >([]);
  const [totalMatching, setTotalMatching] = React.useState<number>(0);
  const [hasMore, setHasMore] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [seeding, setSeeding] = useStateWithLabel(false);
  const [clearing, setClearing] = useStateWithLabel(false);
  const [paused, setPaused] = React.useState<boolean | null>(null); // null = loading
  const [togglingPause, setTogglingPause] = React.useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [stageFilter, setStageFilter] = React.useState<string>("ALL");
  const [eventFilter, setEventFilter] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");

  // Sort + per-column text filters (client-side, on loaded items)
  const [sortKey, setSortKey] = React.useState<SortKey | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [colFilters, setColFilters] = React.useState<Partial<Record<SortKey, string>>>({});

  // Selected queue item (for detail dialog)
  const [selected, setSelected] = React.useState<QueueItem | null>(null);

  // Derived: sorted + filtered view of `items`
  const visibleItems = React.useMemo(() => {
    let out = items.slice();
    // Apply per-column text filters
    for (const [k, q] of Object.entries(colFilters)) {
      if (!q || !q.trim()) continue;
      const key = k as SortKey;
      const needle = q.trim().toLowerCase();
      out = out.filter((it) => String(getItemValue(it, key)).toLowerCase().includes(needle));
    }
    // Apply sort
    if (sortKey) {
      out.sort((a, b) => compareItems(a, b, sortKey, sortDir));
    }
    return out;
  }, [items, colFilters, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      // third click → clear sort
      setSortKey(null);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 inline text-[#FF005A]" />
      : <ArrowDown className="h-3 w-3 ml-1 inline text-[#FF005A]" />;
  };

  const ColFilterInput = ({ k, placeholder }: { k: SortKey; placeholder: string }) => (
    <input
      type="text"
      value={colFilters[k] ?? ""}
      onChange={(e) => setColFilters((prev) => ({ ...prev, [k]: e.target.value }))}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      className="mt-1 w-full rounded border border-black/10 bg-white px-1.5 py-0.5 text-[0.65rem] font-normal lowercase tracking-normal text-black/80 placeholder:text-black/30 focus:border-[#FF005A] focus:outline-none"
    />
  );

  // ── Refresh (resets to first page) ──
  // Page size is 200 — large enough to cover most events in one shot, but
  // not so large that the table becomes unscrollable. The "Load more" button
  // fetches the next 200 (cumulative) so admins can page through arbitrarily
  // large queues.
  const PAGE_SIZE = 200;
  const refresh = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (stageFilter !== "ALL") params.set("stage", stageFilter);
      if (eventFilter !== "ALL") params.set("eventId", eventFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", "0");
      const res = await fetch(
        `/api/email-orchestrator/queue?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        toast.error("Failed to load queue");
        return;
      }
      const data: QueueResponse = await res.json();
      setItems(data.items);
      setSummary(data.summary);
      setEvents(data.events);
      setTotalMatching(data.totalMatching ?? data.items.length);
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load queue");
    } finally {
      setLoading(false);
    }
    // Fetch the global pause flag in parallel (best-effort — never blocks UI)
    void (async () => {
      try {
        const r = await fetch("/api/admin/site-settings/email-pause", {
          cache: "no-store",
        });
        if (r.ok) {
          const d = await r.json();
          setPaused(Boolean(d.paused));
        }
      } catch {
        /* leave paused as-is on error */
      }
    })();
  }, [statusFilter, stageFilter, eventFilter, search]);

  // ── Load more (appends next page) ──
  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (stageFilter !== "ALL") params.set("stage", stageFilter);
      if (eventFilter !== "ALL") params.set("eventId", eventFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(items.length));
      const res = await fetch(
        `/api/email-orchestrator/queue?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        toast.error("Failed to load more");
        return;
      }
      const data: QueueResponse = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(Boolean(data.hasMore));
      // totalMatching is filter-dependent, not page-dependent — safe to refresh.
      if (typeof data.totalMatching === "number") setTotalMatching(data.totalMatching);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, statusFilter, stageFilter, eventFilter, search, items.length]);

  // ── Toggle email pause ──
  const handleTogglePause = async () => {
    if (paused === null) return;
    const next = !paused;
    setTogglingPause(true);
    try {
      const res = await fetch("/api/admin/site-settings/email-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
      if (!res.ok) {
        toast.error("Failed to toggle pause");
        return;
      }
      setPaused(next);
      toast.success(
        next
          ? "Email sends paused. Queue still records attempts for preview."
          : "Email sends resumed.",
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to toggle pause");
    } finally {
      setTogglingPause(false);
    }
  };

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Run worker ──
  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/email-orchestrator/run", {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Worker failed to run");
        return;
      }
      const data = await res.json();
      const legacy = data.result;
      const flow = data.flowResult;
      const totalSent = (legacy?.sent ?? 0) + (flow?.sent ?? 0);
      const totalFailed = (legacy?.failed ?? 0) + (flow?.failed ?? 0);
      toast.success(
        `Worker: ${totalSent} sent · ${totalFailed} failed · ${flow?.processed ?? 0} flow rows processed`,
      );
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Worker error");
    } finally {
      setRunning(false);
    }
  };

  // ── Seed (now only seeds templates + the built-in Test audience) ──
  const handleSeed = async () => {
    if (
      !confirm(
        "This will ensure the 5 stage templates + the built-in Test audience exist. No demo users or events are created. Continue?",
      )
    )
      return;
    setSeeding(true);
    try {
      const res = await fetch("/api/email-orchestrator/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      if (!res.ok) {
        toast.error("Seed failed");
        return;
      }
      const data = await res.json();
      toast.success(
        `Seeded: ${data.result.templates.created} templates created (${data.result.templates.existing} existing) · Test audience ${data.result.audience.created ? "created" : "exists"} (${data.result.audience.emailCount} emails)`,
      );
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Seed error");
    } finally {
      setSeeding(false);
    }
  };

  // ── Clear demo/test data ──
  const handleClear = async () => {
    if (
      !confirm(
        "This will DELETE all flow queue items, flow steps, flows, and stage templates. Real users, events, and RSVPs are preserved. The built-in Test audience is preserved. Continue?",
      )
    )
      return;
    setClearing(true);
    try {
      const res = await fetch("/api/email-orchestrator/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (!res.ok) {
        toast.error("Clear failed");
        return;
      }
      const data = await res.json();
      toast.success(`Cleared: ${JSON.stringify(data.result.deleted)}`);
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Clear error");
    } finally {
      setClearing(false);
    }
  };

  // ── Simulate ──
  const handleSimulate = async (
    item: QueueItem,
    action: "open" | "click",
  ) => {
    try {
      const res = await fetch("/api/email-orchestrator/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: item.id,
          action,
          targetUrl: "https://aisalon.massapro.com/events",
        }),
      });
      if (!res.ok) {
        toast.error(`Simulate ${action} failed`);
        return;
      }
      toast.success(`Simulated ${action} on stage ${item.stage}`);
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error(`Simulate error`);
    }
  };

  // ── Stat cards ──
  const stats = [
    { key: "total", label: "Total", icon: Mail, color: "text-black" },
    {
      key: "PENDING",
      label: "Pending",
      icon: Clock,
      color: "text-amber-600",
    },
    {
      key: "SENT",
      label: "Sent",
      icon: CheckCircle2,
      color: "text-blue-600",
    },
    {
      key: "OPENED",
      label: "Opened",
      icon: MailOpen,
      color: "text-emerald-600",
    },
    {
      key: "CLICKED",
      label: "Clicked",
      icon: MousePointerClick,
      color: "text-fuchsia-600",
    },
    {
      key: "SKIPPED",
      label: "Skipped",
      icon: Ban,
      color: "text-zinc-500",
    },
    {
      key: "FAILED",
      label: "Failed",
      icon: XCircle,
      color: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Pause banner (only shown when paused) ── */}
      {paused && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-3">
          <PauseCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong className="font-semibold">Email sending is paused.</strong>{" "}
            New <em>Run worker</em> calls and scheduled cron sends will record
            to the queue (so you can preview the HTML) but no real email will
            go out. Click <em>Resume sending</em> below to undo.
          </div>
        </div>
      )}

      {/* ── Top controls ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleTogglePause}
          disabled={togglingPause || paused === null}
          size="sm"
          variant={paused ? "default" : "outline"}
          className={
            paused
              ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
              : "text-amber-700 border-amber-300 hover:border-amber-400 hover:bg-amber-50"
          }
          title={
            paused
              ? "Email sends are currently blocked. Click to resume."
              : "Block all real email sends (queue still records attempts)"
          }
        >
          {togglingPause ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : paused ? (
            <PlayCircle className="h-4 w-4 mr-1.5" />
          ) : (
            <PauseCircle className="h-4 w-4 mr-1.5" />
          )}
          {paused ? "Resume sending" : "Pause sending"}
        </Button>
        <span className="h-5 w-px bg-black/10 mx-1" aria-hidden />
        <Button onClick={handleRun} disabled={running} size="sm">
          {running ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-1.5" />
          )}
          Run worker
        </Button>
        <Button
          onClick={refresh}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          Refresh
        </Button>
        <Button
          onClick={handleSeed}
          disabled={seeding}
          variant="outline"
          size="sm"
        >
          {seeding ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4 mr-1.5" />
          )}
          Seed templates + Test audience
        </Button>
        <Button
          onClick={handleClear}
          disabled={clearing}
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
        >
          {clearing ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 mr-1.5" />
          )}
          Clear flow data
        </Button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stats.map((s) => {
          const Icon = s.icon;
          const val = summary[s.key] ?? 0;
          return (
            <div
              key={s.key}
              className="rounded-lg border border-black/10 bg-white p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-black/50">
                  {s.label}
                </span>
                <Icon className={`h-3.5 w-3.5 ${s.color}`} />
              </div>
              <div className="text-2xl font-extrabold text-black">
                {val}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="OPENED">Opened</SelectItem>
            <SelectItem value="CLICKED">Clicked</SelectItem>
            <SelectItem value="SKIPPED">Skipped</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s.stage} value={String(s.stage)}>
                {s.stage}. {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue placeholder="Event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All events</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[200px] h-8 text-xs"
        />
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-black/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/80 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("stage")} className="inline-flex items-center hover:text-[#FF005A]">
                    Stage/Step <SortIcon k="stage" />
                  </button>
                  <ColFilterInput k="stage" placeholder="1–5" />
                </th>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("recipient")} className="inline-flex items-center hover:text-[#FF005A]">
                    Recipient <SortIcon k="recipient" />
                  </button>
                  <ColFilterInput k="recipient" placeholder="name or email" />
                </th>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("event")} className="inline-flex items-center hover:text-[#FF005A]">
                    Event <SortIcon k="event" />
                  </button>
                  <ColFilterInput k="event" placeholder="event title" />
                </th>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("variant")} className="inline-flex items-center hover:text-[#FF005A]">
                    Var <SortIcon k="variant" />
                  </button>
                  <ColFilterInput k="variant" placeholder="A or B" />
                </th>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("status")} className="inline-flex items-center hover:text-[#FF005A]">
                    Status <SortIcon k="status" />
                  </button>
                  <ColFilterInput k="status" placeholder="sent, pending…" />
                </th>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("scheduled")} className="inline-flex items-center hover:text-[#FF005A]">
                    Scheduled <SortIcon k="scheduled" />
                  </button>
                  <ColFilterInput k="scheduled" placeholder="yyyy-mm-dd" />
                </th>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("sent")} className="inline-flex items-center hover:text-[#FF005A]">
                    Sent <SortIcon k="sent" />
                  </button>
                  <ColFilterInput k="sent" placeholder="yyyy-mm-dd" />
                </th>
                <th className="text-left font-semibold px-3 py-2">
                  <button onClick={() => toggleSort("logs")} className="inline-flex items-center hover:text-[#FF005A]">
                    Logs <SortIcon k="logs" />
                  </button>
                  <ColFilterInput k="logs" placeholder="≥ N" />
                </th>
                <th className="text-right font-semibold px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-black/80 text-sm"
                  >
                    No queue items. Create a flow in the <a href="/admin/email/flows" className="text-[#FF005A] underline">Flow Builder</a>,
                    trigger it (e.g. RSVP to an event), then <strong>Run worker</strong> to send.
                  </td>
                </tr>
              ) : (
                visibleItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-black/5 hover:bg-black/[0.02] cursor-pointer"
                    onClick={() => setSelected(item)}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-black/80">
                        {item.stage}
                      </span>
                      <span className="ml-1.5 text-xs">
                        {STAGES[item.stage - 1]?.name ?? "?"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium text-black">
                        {item.rsvp.name || "(no name)"}
                      </div>
                      <div className="text-[0.7rem] text-black/50">
                        {item.email}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-black/70">
                      {item.event.title}
                    </td>
                    <td className="px-3 py-2">
                      {item.subjectVariant ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${
                            item.subjectVariant === "B"
                              ? "bg-[#FF005A]/10 text-[#FF005A]"
                              : "bg-[#00E6FF]/10 text-black"
                          }`}
                          title={`Subject variant ${item.subjectVariant}`}
                        >
                          {item.subjectVariant}
                        </span>
                      ) : (
                        <span className="text-[0.65rem] text-black/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} />
                      {item.rsvp.doorCheckedAt && (
                        <span
                          className="ml-1 text-[0.65rem] text-zinc-500"
                          title="RSVP was door-checked-in"
                        >
                          🚪
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/80">
                      {formatDate(item.scheduledFor)}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/80">
                      {item.sentAt ? formatDate(item.sentAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/80">
                      {item._count.trackingLogs}
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        {item.status === "SENT" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleSimulate(item, "open")}
                              title="Simulate open"
                            >
                              <MailOpen className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleSimulate(item, "click")}
                              title="Simulate click"
                            >
                              <MousePointerClick className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer ── */}
        {items.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-black/5 bg-black/[0.02] px-3 py-2 text-xs text-black/70">
            <div>
              Showing <strong className="text-black">{visibleItems.length}</strong>
              {visibleItems.length !== items.length && (
                <span className="text-black/50"> (of {items.length} loaded)</span>
              )}
              {" "}of <strong className="text-black">{totalMatching}</strong>{" "}
              {totalMatching === 1 ? "email" : "emails"}
              {hasMore && (
                <span className="ml-1 text-black/50">
                  · {totalMatching - items.length} more available
                </span>
              )}
              {(sortKey || Object.values(colFilters).some((v) => v && v.trim())) && (
                <button
                  onClick={() => { setSortKey(null); setSortDir("asc"); setColFilters({}); }}
                  className="ml-2 text-[#FF005A] hover:underline"
                >
                  Clear sort/filter
                </button>
              )}
            </div>
            {hasMore && (
              <Button
                size="sm"
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
                className="h-7"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    Load {Math.min(PAGE_SIZE, totalMatching - items.length)} more
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Detail dialog ── */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#FF005A]" />
              Queue item detail
            </DialogTitle>
            <DialogDescription>
              Stage {selected?.stage} ({STAGES[(selected?.stage ?? 1) - 1]?.name}) ·{" "}
              {selected?.email}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <DetailRow label="Status">
                  <StatusBadge status={selected.status} />
                </DetailRow>
                <DetailRow label="Event">
                  {selected.event.title}
                </DetailRow>
                <DetailRow label="RSVP name">
                  {selected.rsvp.name || "(no name)"}
                </DetailRow>
                <DetailRow label="Door checked-in">
                  {selected.rsvp.doorCheckedAt
                    ? formatDate(selected.rsvp.doorCheckedAt)
                    : "No"}
                </DetailRow>
                <DetailRow label="Scheduled for">
                  {formatDate(selected.scheduledFor)}
                </DetailRow>
                <DetailRow label="Sent at">
                  {selected.sentAt ? formatDate(selected.sentAt) : "—"}
                </DetailRow>
                <DetailRow label="Opened at">
                  {selected.openedAt ? formatDate(selected.openedAt) : "—"}
                </DetailRow>
                <DetailRow label="Clicked at">
                  {selected.clickedAt ? formatDate(selected.clickedAt) : "—"}
                </DetailRow>
                <DetailRow label="Check-in code">
                  <span className="font-mono">
                    {selected.rsvp.checkInCode || "(none)"}
                  </span>
                </DetailRow>
                <DetailRow label="Tracking logs">
                  {selected._count.trackingLogs}
                </DetailRow>
                {selected.errorMessage && (
                  <DetailRow label="Error" full>
                    <span className="text-red-600">
                      {selected.errorMessage}
                    </span>
                  </DetailRow>
                )}
                {selected.subject && (
                  <DetailRow label="Subject" full>
                    {selected.subject}
                  </DetailRow>
                )}
                <DetailRow label="Subject variant">
                  {selected.subjectVariant ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[0.65rem] font-bold ${
                        selected.subjectVariant === "B"
                          ? "bg-[#FF005A]/10 text-[#FF005A]"
                          : "bg-[#00E6FF]/10 text-black"
                      }`}
                    >
                      {selected.subjectVariant}
                    </span>
                  ) : (
                    "—"
                  )}
                </DetailRow>
                <DetailRow label="Audience">
                  {selected.audienceId ? (
                    <span className="font-mono text-[0.65rem]">{selected.audienceId}</span>
                  ) : (
                    "—"
                  )}
                </DetailRow>
              </div>

              {selected.htmlBody ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-2">
                    Email preview
                  </div>
                  <iframe
                    title="email-preview"
                    srcDoc={selected.htmlBody}
                    className="w-full h-[400px] rounded-lg border border-black/15 bg-white"
                    sandbox=""
                  />
                </div>
              ) : (
                <div className="text-xs text-black/80 italic">
                  No email sent yet — once this stage fires, the rendered HTML
                  will appear here.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800 border-amber-200",
    SENT: "bg-blue-100 text-blue-800 border-blue-200",
    OPENED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    CLICKED: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
    SKIPPED: "bg-zinc-100 text-zinc-700 border-zinc-200",
    FAILED: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge
      variant="outline"
      className={`text-[0.65rem] ${cls[status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
    >
      {statusLabel(status)}
    </Badge>
  );
}

function DetailRow({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-black/50 mb-0.5">
        {label}
      </div>
      <div className="text-sm text-black/80">{children}</div>
    </div>
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

// Tiny helper to make the seeding/clearing state more readable in JSX.
function useStateWithLabel(initial: boolean) {
  return React.useState(initial);
}
