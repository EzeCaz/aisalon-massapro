"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  Users,
  MousePointerClick,
  UserPlus,
  Calendar,
  TrendingUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Ticket,
  CheckCircle2,
  DoorOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  AnalyticsFilterBar,
  AnalyticsPanel,
  AnalyticsDataTable,
  AnalyticsBarChart,
  AnalyticsPieChart,
  applyFilters,
  groupLongTail,
  formatDateTime,
  useAnalyticsState,
  type ColumnDef,
  type ViewMode,
} from "@/components/ais/analytics-shell";

/**
 * AdminAnalyticsClient — fetches /api/admin/analytics and renders:
 *   - Summary cards (total visits / signups / RSVPs / active referrers)
 *   - 30-day visits + signups trend chart (SVG)
 *   - Top referrers table (with view-mode toggle + sort + filter + UTM columns)
 *   - Recent visits feed (with UTM columns + master filter)
 *   - Recent signups feed (with UTM columns)
 *   - Top landing pages
 *   - Event registrations / check-ins / attended (Task 3-H)
 *   - Members "I am interested in…" with long-tail grouping (Task 3-G)
 *
 * Every panel uses the same AnalyticsShell so the user gets consistent:
 *   A. Pie/Table/Chart toggle
 *   B. A-Z/Z-A sort
 *   C. Per-column filter
 *   D. Master filter that re-computes the entire dashboard
 *   E. UTM columns + UTM filters
 *   F. Filter style matching the dashboard report
 */

type Summary = {
  totalVisits: number;
  totalNewVisitors: number;
  totalSignups: number;
  totalRsvps: number;
  activeReferrers: number;
};

type TopReferrer = {
  userId: string;
  name: string | null;
  email: string;
  utmUid: string;
  visits: number;
  newVisitors: number;
  signups: number;
  rsvps: number;
  lastVisitAt: string | null;
};

type RecentVisit = {
  id: string;
  createdAt: string;
  landingPath: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  utmUid: string;
  isNewVisitor: boolean;
  referrer: {
    name: string | null;
    email: string;
    utmUid: string;
  };
};

type RecentSignup = {
  id: string;
  convertedAt: string;
  utmUid: string;
  referredUser: { name: string | null; email: string };
  referrer: { name: string | null; email: string; utmUid: string };
};

type EventRegistration = {
  rsvpId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  attendeeName: string | null;
  attendeeEmail: string;
  status: string;
  registeredAt: string;
  checkedInAt: string | null;
  doorCheckedAt: string | null;
  approvedAt: string | null;
  attended: boolean;
  referrer: {
    id: string;
    name: string | null;
    email: string;
    utmUid: string | null;
  } | null;
};

type AnalyticsResponse = {
  summary: Summary;
  topReferrers: TopReferrer[];
  recentVisits: RecentVisit[];
  recentSignups: RecentSignup[];
  visitsByDay: { day: string; visits: number; signups: number }[];
  topLandingPages: { path: string; visits: number }[];
  eventRegistrations: EventRegistration[];
  interestedInRows: { label: string; count: number }[];
};

export function AdminAnalyticsClient() {
  const [data, setData] = React.useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AnalyticsResponse;
      setData(json);
    } catch (e) {
      toast.error((e as Error).message || "Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-black/40">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading analytics…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-center py-20 text-black/40">
        No analytics data available.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-md bg-black text-white px-3 py-1.5 text-xs font-semibold hover:bg-black/90 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Total visits"
          value={data.summary.totalVisits}
          color="#004F98"
        />
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="New visitors"
          value={data.summary.totalNewVisitors}
          color="#007E72"
        />
        <SummaryCard
          icon={<UserPlus className="h-4 w-4" />}
          label="Signups"
          value={data.summary.totalSignups}
          color="#FF005A"
        />
        <SummaryCard
          icon={<Ticket className="h-4 w-4" />}
          label="Referral RSVPs"
          value={data.summary.totalRsvps}
          color="#820A7D"
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Active referrers"
          value={data.summary.activeReferrers}
          color="#FFAC30"
        />
      </div>

      {/* 30-day trend */}
      <TrendChart visitsByDay={data.visitsByDay} />

      {/* Top referrers (with view toggle + sort + filter + UTM) */}
      <TopReferrersPanel rows={data.topReferrers} />

      {/* Recent visits (with UTM columns + master filter) */}
      <RecentVisitsPanel rows={data.recentVisits} />

      {/* Recent signups (with UTM columns) */}
      <RecentSignupsPanel rows={data.recentSignups} />

      {/* Event registrations / check-ins / attended (Task 3-H) */}
      <EventRegistrationsPanel rows={data.eventRegistrations} />

      {/* Members "I am interested in…" with long-tail grouping (Task 3-G) */}
      <InterestedInPanel rows={data.interestedInRows} />

      {/* Top landing pages */}
      <TopLandingPagesPanel rows={data.topLandingPages} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary card                                                        */
/* ------------------------------------------------------------------ */

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div
        className="inline-flex items-center justify-center w-8 h-8 rounded-full mb-1.5"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="text-2xl font-extrabold text-black leading-tight">
        {value.toLocaleString()}
      </div>
      <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-black/50 mt-0.5">
        {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 30-day trend chart (SVG)                                            */
/* ------------------------------------------------------------------ */

function TrendChart({
  visitsByDay,
}: {
  visitsByDay: { day: string; visits: number; signups: number }[];
}) {
  if (visitsByDay.length === 0) return null;
  const W = 800;
  const H = 200;
  const padX = 40;
  const padY = 20;
  const max = Math.max(...visitsByDay.map((d) => Math.max(d.visits, d.signups)), 1);
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const x = (i: number) => padX + (i / (visitsByDay.length - 1)) * innerW;
  const y = (v: number) => padY + innerH - (v / max) * innerH;

  const visitsPath = visitsByDay
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.visits)}`)
    .join(" ");
  const signupsPath = visitsByDay
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.signups)}`)
    .join(" ");

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-extrabold text-black flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#FF005A]" />
          30-day trend
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full bg-[#007E72]" />
            <span className="text-black/60 font-semibold">Visits</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full bg-[#FF005A]" />
            <span className="text-black/60 font-semibold">Signups</span>
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
        {/* Y grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1={padX}
            x2={W - padX}
            y1={padY + innerH - p * innerH}
            y2={padY + innerH - p * innerH}
            stroke="rgba(0,0,0,0.05)"
            strokeWidth={1}
          />
        ))}
        <path d={visitsPath} fill="none" stroke="#007E72" strokeWidth={2} />
        <path d={signupsPath} fill="none" stroke="#FF005A" strokeWidth={2} />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top referrers panel                                                 */
/* ------------------------------------------------------------------ */

function TopReferrersPanel({ rows }: { rows: TopReferrer[] }) {
  const state = useAnalyticsState(rows);
  const columns: ColumnDef<TopReferrer>[] = [
    {
      key: "name",
      label: "Member",
      isCategory: true,
      render: (r) => (
        <div>
          <div className="font-semibold text-black">{r.name || "(no name)"}</div>
          <div className="text-[0.65rem] text-black/50">{r.email}</div>
        </div>
      ),
    },
    { key: "utmUid", label: "UTM UID", accessor: (r) => r.utmUid, render: (r) => (
      <code className="text-xs font-mono bg-black/5 px-1.5 py-0.5 rounded">{r.utmUid}</code>
    )},
    { key: "visits", label: "Visits", isValue: true, accessor: (r) => r.visits, render: (r) => <span className="font-bold">{r.visits}</span> },
    { key: "newVisitors", label: "New", accessor: (r) => r.newVisitors },
    { key: "signups", label: "Signups", accessor: (r) => r.signups },
    { key: "rsvps", label: "RSVPs", accessor: (r) => r.rsvps },
    {
      key: "lastVisitAt",
      label: "Last visit",
      accessor: (r) => r.lastVisitAt ?? "",
      render: (r) => formatDateTime(r.lastVisitAt),
    },
  ];

  const filtered = applyFilters(rows, columns, state.filters, state.globalSearch, state.sortKey, state.sortDir);

  // For chart views: aggregate by Member name → sum of visits
  const chartRows = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const k = r.name || "(no name)";
      m.set(k, (m.get(k) || 0) + r.visits);
    }
    return Array.from(m.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  return (
    <AnalyticsPanel
      title="Top referrers"
      subtitle="Members driving traffic via their unique share links"
      count={filtered.length}
      viewMode={state.viewMode}
      onViewModeChange={state.setViewMode}
      rightSlot={
        <button
          type="button"
          onClick={() => exportCsv("top-referrers.csv", columns, filtered)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#004F98] hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Export CSV
        </button>
      }
    >
      <AnalyticsFilterBar
        columns={columns}
        rows={rows}
        filters={state.filters}
        onFiltersChange={state.setFilters}
        globalSearch={state.globalSearch}
        onGlobalSearchChange={state.setGlobalSearch}
        resultCount={filtered.length}
        totalCount={rows.length}
      />
      {state.viewMode === "table" && (
        <AnalyticsDataTable
          columns={columns}
          rows={filtered}
          sortKey={state.sortKey}
          sortDir={state.sortDir}
          onSortChange={state.setSort}
        />
      )}
      {state.viewMode === "bar" && (
        <AnalyticsBarChart rows={chartRows.map((r) => ({ label: r.label, value: r.value }))} />
      )}
      {state.viewMode === "pie" && (
        <AnalyticsPieChart rows={chartRows.map((r) => ({ label: r.label, value: r.value }))} />
      )}
    </AnalyticsPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Recent visits panel                                                 */
/* ------------------------------------------------------------------ */

function RecentVisitsPanel({ rows }: { rows: RecentVisit[] }) {
  const state = useAnalyticsState(rows);
  const columns: ColumnDef<RecentVisit>[] = [
    {
      key: "createdAt",
      label: "When",
      accessor: (r) => r.createdAt,
      render: (r) => formatDateTime(r.createdAt),
    },
    {
      key: "referrer",
      label: "Referrer",
      isCategory: true,
      accessor: (r) => r.referrer.name || r.referrer.email,
      render: (r) => (
        <div>
          <div className="font-semibold text-black">{r.referrer.name || "(no name)"}</div>
          <div className="text-[0.65rem] text-black/50">{r.referrer.email}</div>
        </div>
      ),
    },
    { key: "utmUid", label: "UTM UID", accessor: (r) => r.utmUid, render: (r) => (
      <code className="text-xs font-mono bg-black/5 px-1.5 py-0.5 rounded">{r.utmUid}</code>
    )},
    { key: "utmSource", label: "Source", accessor: (r) => r.utmSource ?? "—" },
    { key: "utmMedium", label: "Medium", accessor: (r) => r.utmMedium ?? "—" },
    { key: "utmCampaign", label: "Campaign", accessor: (r) => r.utmCampaign ?? "—" },
    { key: "utmContent", label: "Content", accessor: (r) => r.utmContent ?? "—", hiddenInTable: true },
    { key: "utmTerm", label: "Term", accessor: (r) => r.utmTerm ?? "—", hiddenInTable: true },
    { key: "landingPath", label: "Landing page", accessor: (r) => r.landingPath, render: (r) => (
      <code className="text-xs font-mono">{r.landingPath}</code>
    )},
    {
      key: "isNewVisitor",
      label: "New?",
      accessor: (r) => (r.isNewVisitor ? "Yes" : "No"),
      render: (r) =>
        r.isNewVisitor ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[0.6rem] font-bold uppercase">
            New
          </span>
        ) : (
          <span className="text-xs text-black/40">Returning</span>
        ),
    },
  ];

  const filtered = applyFilters(rows, columns, state.filters, state.globalSearch, state.sortKey, state.sortDir);
  const chartRows = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const k = r.referrer.name || r.referrer.email;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  return (
    <AnalyticsPanel
      title="Recent referral visits"
      subtitle="Last 50 visits with full UTM parameters"
      count={filtered.length}
      viewMode={state.viewMode}
      onViewModeChange={state.setViewMode}
    >
      <AnalyticsFilterBar
        columns={columns}
        rows={rows}
        filters={state.filters}
        onFiltersChange={state.setFilters}
        globalSearch={state.globalSearch}
        onGlobalSearchChange={state.setGlobalSearch}
        resultCount={filtered.length}
        totalCount={rows.length}
      />
      {state.viewMode === "table" && (
        <AnalyticsDataTable
          columns={columns}
          rows={filtered}
          sortKey={state.sortKey}
          sortDir={state.sortDir}
          onSortChange={state.setSort}
        />
      )}
      {state.viewMode === "bar" && (
        <AnalyticsBarChart rows={chartRows.map((r) => ({ label: r.label, value: r.value }))} />
      )}
      {state.viewMode === "pie" && (
        <AnalyticsPieChart rows={chartRows.map((r) => ({ label: r.label, value: r.value }))} />
      )}
    </AnalyticsPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Recent signups panel                                                */
/* ------------------------------------------------------------------ */

function RecentSignupsPanel({ rows }: { rows: RecentSignup[] }) {
  const state = useAnalyticsState(rows);
  const columns: ColumnDef<RecentSignup>[] = [
    {
      key: "convertedAt",
      label: "Converted",
      accessor: (r) => r.convertedAt,
      render: (r) => formatDateTime(r.convertedAt),
    },
    {
      key: "referredUser",
      label: "New member",
      isCategory: true,
      accessor: (r) => r.referredUser.name || r.referredUser.email,
      render: (r) => (
        <div>
          <div className="font-semibold text-black">{r.referredUser.name || "(no name)"}</div>
          <div className="text-[0.65rem] text-black/50">{r.referredUser.email}</div>
        </div>
      ),
    },
    {
      key: "referrer",
      label: "Referred by",
      accessor: (r) => r.referrer.name || r.referrer.email,
      render: (r) => (
        <div>
          <div className="font-semibold text-black">{r.referrer.name || "(no name)"}</div>
          <div className="text-[0.65rem] text-black/50">{r.referrer.email}</div>
        </div>
      ),
    },
    { key: "utmUid", label: "UTM UID", accessor: (r) => r.utmUid, render: (r) => (
      <code className="text-xs font-mono bg-black/5 px-1.5 py-0.5 rounded">{r.utmUid}</code>
    )},
  ];

  const filtered = applyFilters(rows, columns, state.filters, state.globalSearch, state.sortKey, state.sortDir);

  return (
    <AnalyticsPanel
      title="Recent signups"
      subtitle="Members who joined via a referral link"
      count={filtered.length}
      viewMode={state.viewMode}
      onViewModeChange={state.setViewMode}
      allowViewModes={["table"]}
    >
      <AnalyticsFilterBar
        columns={columns}
        rows={rows}
        filters={state.filters}
        onFiltersChange={state.setFilters}
        globalSearch={state.globalSearch}
        onGlobalSearchChange={state.setGlobalSearch}
        resultCount={filtered.length}
        totalCount={rows.length}
      />
      <AnalyticsDataTable
        columns={columns}
        rows={filtered}
        sortKey={state.sortKey}
        sortDir={state.sortDir}
        onSortChange={state.setSort}
      />
    </AnalyticsPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Event registrations / check-ins / attended (Task 3-H)               */
/* ------------------------------------------------------------------ */

function EventRegistrationsPanel({ rows }: { rows: EventRegistration[] }) {
  const state = useAnalyticsState(rows);
  const columns: ColumnDef<EventRegistration>[] = [
    {
      key: "eventTitle",
      label: "Event",
      isCategory: true,
      accessor: (r) => r.eventTitle,
      render: (r) => (
        <Link
          href={`/events/${r.eventSlug}`}
          className="font-semibold text-[#004F98] hover:underline"
        >
          {r.eventTitle}
        </Link>
      ),
    },
    {
      key: "attendeeName",
      label: "Attendee",
      accessor: (r) => r.attendeeName || r.attendeeEmail,
      render: (r) => (
        <div>
          <div className="font-semibold text-black">{r.attendeeName || "(no name)"}</div>
          <div className="text-[0.65rem] text-black/50">{r.attendeeEmail}</div>
        </div>
      ),
    },
    {
      key: "referrer",
      label: "Referrer",
      accessor: (r) => r.referrer?.name || r.referrer?.email || "—",
      render: (r) =>
        r.referrer ? (
          <div>
            <div className="font-semibold text-black">{r.referrer.name || "(no name)"}</div>
            <div className="text-[0.65rem] text-black/50">{r.referrer.email}</div>
            {r.referrer.utmUid && (
              <code className="text-[0.6rem] font-mono bg-black/5 px-1 rounded">{r.referrer.utmUid}</code>
            )}
          </div>
        ) : (
          <span className="text-xs text-black/30 italic">—</span>
        ),
    },
    { key: "status", label: "RSVP", accessor: (r) => r.status },
    {
      key: "registeredAt",
      label: "Registered",
      accessor: (r) => r.registeredAt,
      render: (r) => formatDateTime(r.registeredAt),
    },
    {
      key: "approvedAt",
      label: "Approved",
      accessor: (r) => r.approvedAt ?? "",
      render: (r) =>
        r.approvedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> {formatDateTime(r.approvedAt)}
          </span>
        ) : (
          <span className="text-xs text-black/30 italic">Not approved</span>
        ),
    },
    {
      key: "doorCheckedAt",
      label: "Checked in",
      accessor: (r) => r.doorCheckedAt ?? "",
      render: (r) =>
        r.doorCheckedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-[#007E72]">
            <DoorOpen className="h-3 w-3" /> {formatDateTime(r.doorCheckedAt)}
          </span>
        ) : (
          <span className="text-xs text-black/30 italic">Not checked in</span>
        ),
    },
    {
      key: "attended",
      label: "Attended",
      isValue: true,
      accessor: (r) => (r.attended ? "Yes" : "No"),
      render: (r) =>
        r.attended ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[0.6rem] font-bold uppercase">
            <CheckCircle2 className="h-2.5 w-2.5" /> Attended
          </span>
        ) : (
          <span className="text-xs text-black/30">—</span>
        ),
    },
  ];

  const filtered = applyFilters(rows, columns, state.filters, state.globalSearch, state.sortKey, state.sortDir);

  // Chart aggregation: event title → number attended
  const chartRows = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      m.set(r.eventTitle, (m.get(r.eventTitle) || 0) + (r.attended ? 1 : 0));
    }
    return Array.from(m.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  // Aggregate counts for the panel header
  const totalRegistrations = filtered.length;
  const totalCheckedIn = filtered.filter((r) => r.doorCheckedAt).length;
  const totalAttended = filtered.filter((r) => r.attended).length;

  return (
    <AnalyticsPanel
      title="Event registrations · check-ins · attended"
      subtitle="Referral-attributed RSVPs: how many registered, checked in at the door, and were co-host-approved + scanned (attended)"
      count={filtered.length}
      viewMode={state.viewMode}
      onViewModeChange={state.setViewMode}
      rightSlot={
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 font-semibold text-black/60">
            <Ticket className="h-3 w-3" /> {totalRegistrations} registered
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#007E72]/10 px-2 py-0.5 font-semibold text-[#007E72]">
            <DoorOpen className="h-3 w-3" /> {totalCheckedIn} checked in
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> {totalAttended} attended
          </span>
        </div>
      }
    >
      <AnalyticsFilterBar
        columns={columns}
        rows={rows}
        filters={state.filters}
        onFiltersChange={state.setFilters}
        globalSearch={state.globalSearch}
        onGlobalSearchChange={state.setGlobalSearch}
        resultCount={filtered.length}
        totalCount={rows.length}
      />
      {state.viewMode === "table" && (
        <AnalyticsDataTable
          columns={columns}
          rows={filtered}
          sortKey={state.sortKey}
          sortDir={state.sortDir}
          onSortChange={state.setSort}
        />
      )}
      {state.viewMode === "bar" && (
        <AnalyticsBarChart rows={chartRows.map((r) => ({ label: r.label, value: r.value }))} />
      )}
      {state.viewMode === "pie" && (
        <AnalyticsPieChart rows={chartRows.map((r) => ({ label: r.label, value: r.value }))} />
      )}
    </AnalyticsPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Members "I am interested in…" (Task 3-G)                            */
/* ------------------------------------------------------------------ */

function InterestedInPanel({ rows }: { rows: { label: string; count: number }[] }) {
  const state = useAnalyticsState(rows);
  // Apply long-tail grouping: anything < 10% of total is collapsed into "Other interests"
  const grouped = React.useMemo(() => groupLongTail(rows, 0.1, "Other interests"), [rows]);
  const columns: ColumnDef<{ label: string; count: number }>[] = [
    { key: "label", label: "Interest", isCategory: true, accessor: (r) => r.label },
    { key: "count", label: "Members", isValue: true, accessor: (r) => r.count, render: (r) => <span className="font-bold">{r.count}</span> },
  ];
  const filtered = applyFilters(grouped, columns, state.filters, state.globalSearch, state.sortKey, state.sortDir);

  return (
    <AnalyticsPanel
      title="I am interested in…"
      subtitle="Long-tail interests (<10% of total) are grouped under 'Other interests' per the dashboard spec"
      count={filtered.length}
      viewMode={state.viewMode}
      onViewModeChange={state.setViewMode}
    >
      <AnalyticsFilterBar
        columns={columns}
        rows={grouped}
        filters={state.filters}
        onFiltersChange={state.setFilters}
        globalSearch={state.globalSearch}
        onGlobalSearchChange={state.setGlobalSearch}
        resultCount={filtered.length}
        totalCount={grouped.length}
      />
      {state.viewMode === "table" && (
        <AnalyticsDataTable
          columns={columns}
          rows={filtered}
          sortKey={state.sortKey}
          sortDir={state.sortDir}
          onSortChange={state.setSort}
        />
      )}
      {state.viewMode === "bar" && (
        <AnalyticsBarChart rows={filtered.map((r) => ({ label: r.label, value: r.count }))} />
      )}
      {state.viewMode === "pie" && (
        <AnalyticsPieChart rows={filtered.map((r) => ({ label: r.label, value: r.count }))} />
      )}
    </AnalyticsPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Top landing pages                                                   */
/* ------------------------------------------------------------------ */

function TopLandingPagesPanel({ rows }: { rows: { path: string; visits: number }[] }) {
  const state = useAnalyticsState(rows);
  const columns: ColumnDef<{ path: string; visits: number }>[] = [
    { key: "path", label: "Landing page", isCategory: true, accessor: (r) => r.path, render: (r) => (
      <code className="text-xs font-mono">{r.path}</code>
    )},
    { key: "visits", label: "Visits", isValue: true, accessor: (r) => r.visits, render: (r) => <span className="font-bold">{r.visits}</span> },
  ];
  const filtered = applyFilters(rows, columns, state.filters, state.globalSearch, state.sortKey, state.sortDir);
  return (
    <AnalyticsPanel
      title="Top landing pages"
      subtitle="Which pages referral traffic lands on"
      count={filtered.length}
      viewMode={state.viewMode}
      onViewModeChange={state.setViewMode}
    >
      <AnalyticsFilterBar
        columns={columns}
        rows={rows}
        filters={state.filters}
        onFiltersChange={state.setFilters}
        globalSearch={state.globalSearch}
        onGlobalSearchChange={state.setGlobalSearch}
        resultCount={filtered.length}
        totalCount={rows.length}
      />
      {state.viewMode === "table" && (
        <AnalyticsDataTable
          columns={columns}
          rows={filtered}
          sortKey={state.sortKey}
          sortDir={state.sortDir}
          onSortChange={state.setSort}
        />
      )}
      {state.viewMode === "bar" && (
        <AnalyticsBarChart rows={filtered.map((r) => ({ label: r.path, value: r.visits }))} />
      )}
      {state.viewMode === "pie" && (
        <AnalyticsPieChart rows={filtered.map((r) => ({ label: r.path, value: r.visits }))} />
      )}
    </AnalyticsPanel>
  );
}

/* ------------------------------------------------------------------ */
/* CSV export helper                                                   */
/* ------------------------------------------------------------------ */

function exportCsv<T>(filename: string, columns: ColumnDef<T>[], rows: T[]) {
  const visibleCols = columns.filter((c) => !c.hiddenInTable);
  const header = visibleCols.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");
  const lines = rows.map((r) =>
    visibleCols
      .map((c) => {
        const v = c.accessor ? c.accessor(r) : (r as Record<string, unknown>)[c.key];
        const s = v === null || v === undefined ? "" : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
