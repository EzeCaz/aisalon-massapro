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
} from "lucide-react";
import { STAGES, statusLabel } from "@/lib/email-orchestrator/stages";

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
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [seeding, setSeeding] = useStateWithLabel(false);
  const [clearing, setClearing] = useStateWithLabel(false);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [stageFilter, setStageFilter] = React.useState<string>("ALL");
  const [eventFilter, setEventFilter] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");

  // Selected queue item (for detail dialog)
  const [selected, setSelected] = React.useState<QueueItem | null>(null);

  // ── Refresh ──
  const refresh = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (stageFilter !== "ALL") params.set("stage", stageFilter);
      if (eventFilter !== "ALL") params.set("eventId", eventFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "100");
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
    } catch (e) {
      console.error(e);
      toast.error("Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, stageFilter, eventFilter, search]);

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
      const r = data.result;
      toast.success(
        `Worker: ${r.sent} sent · ${r.skipped} skipped · ${r.failed} failed · ${r.created} new`,
      );
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Worker error");
    } finally {
      setRunning(false);
    }
  };

  // ── Seed ──
  const handleSeed = async () => {
    if (
      !confirm(
        "This will create 6 demo users + 1 demo event + 6 RSVPs + 5 templates. Continue?",
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
        `Seeded: ${data.result.templates.created} templates, ${data.result.users.created} users, ${data.result.rsvps.created} RSVPs`,
      );
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Seed error");
    } finally {
      setSeeding(false);
    }
  };

  // ── Clear ──
  const handleClear = async () => {
    if (
      !confirm(
        "This will DELETE all demo data (templates, users, RSVPs, events, queue, logs). Continue?",
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
      {/* ── Top controls ── */}
      <div className="flex flex-wrap items-center gap-2">
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
          Seed demo data
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
          Clear demo data
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
            <thead className="bg-black/[0.03] text-black/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Stage</th>
                <th className="text-left font-semibold px-3 py-2">Recipient</th>
                <th className="text-left font-semibold px-3 py-2">Event</th>
                <th className="text-left font-semibold px-3 py-2">Status</th>
                <th className="text-left font-semibold px-3 py-2">Scheduled</th>
                <th className="text-left font-semibold px-3 py-2">Sent</th>
                <th className="text-left font-semibold px-3 py-2">Logs</th>
                <th className="text-right font-semibold px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-black/40 text-sm"
                  >
                    No queue items. Click <strong>Seed demo data</strong> to
                    populate, then <strong>Run worker</strong> to send.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-black/5 hover:bg-black/[0.02] cursor-pointer"
                    onClick={() => setSelected(item)}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-black/60">
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
                    <td className="px-3 py-2 text-xs text-black/60">
                      {formatDate(item.scheduledFor)}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/60">
                      {item.sentAt ? formatDate(item.sentAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/60">
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
                <div className="text-xs text-black/40 italic">
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
