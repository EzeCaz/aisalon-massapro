"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  LabelList,
} from "recharts";
import {
  Search,
  ArrowUpDown,
  Calendar,
  Filter,
  Download,
  PieChart as PieIcon,
  BarChart3,
  RefreshCw,
  Loader2,
  ExternalLink,
  Linkedin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// AIS brand palette
const AIS_COLORS = [
  "#FF005A",
  "#004F98",
  "#007E72",
  "#00E6FF",
  "#820A7D",
  "#FFAC30",
  "#52525B",
  "#10b981",
  "#f43f5e",
  "#a855f7",
];

type NonMember = {
  id: string;
  email: string;
  name: string | null;
  mobile: string | null;
  company: string | null;
  linkedinUrl: string | null;
  bio: string | null;
  importSource: string | null;
  duplicateStatus: string; // "none" | "pending" | "merged" | "ignored"
  duplicateReason: string | null;
  createdAt: string;
  events: {
    eventId: string;
    eventTitle: string;
    eventSlug: string;
    eventStartsAt: string;
    registeredAt: string;
    source: string;
  }[];
  duplicateOf: {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    createdAt: string;
    image: string | null;
  } | null;
};

type SortField = "name" | "createdAt" | "company" | "duplicateStatus" | "eventsCount";
type SortDir = "asc" | "desc";
type ChartMode = "pie" | "bar";

type ActiveSelection =
  | { kind: "stat"; stat: "all" | "pending" | "merged" | "ignored" | "new" }
  | { kind: "status"; value: string }
  | { kind: "company"; value: string }
  | { kind: "event"; value: string }
  | { kind: "importSource"; value: string }
  | null;

/**
 * Build a label function for a pie chart that shows
 *   "<label> (<count>, <pct>%)"
 */
function pieLabelWithPercent(entries: { label: string; count: number }[]) {
  const total = entries.reduce((s, e) => s + e.count, 0);
  return (entry: { label: string; count: number }) => {
    const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
    return `${entry.label} (${entry.count}, ${pct}%)`;
  };
}

/**
 * Build a formatter for a Recharts <LabelList> on a BarChart.
 */
function barLabelWithPercent(entries: { label: string; count: number }[]) {
  const total = entries.reduce((s, e) => s + e.count, 0);
  return (props: { value?: number }) => {
    const v = props.value ?? 0;
    const pct = total > 0 ? Math.round((v / total) * 100) : 0;
    return `${v} (${pct}%)`;
  };
}

export function NonMemberDashboard() {
  const [allNonMembers, setAllNonMembers] = useState<NonMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Filters -----------------------------------------------------------
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // --- Sort --------------------------------------------------------------
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // --- Chart mode --------------------------------------------------------
  const [chartMode, setChartMode] = useState<ChartMode>("pie");

  // --- Active "report" selection ---------------------------------------
  const [active, setActive] = useState<ActiveSelection>(null);

  const fetchNonMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/non-members?limit=1000", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllNonMembers(data.nonMembers || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNonMembers();
  }, [fetchNonMembers]);

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const toggleSelection = useCallback((sel: ActiveSelection) => {
    setActive((prev) => {
      if (prev && JSON.stringify(prev) === JSON.stringify(sel)) {
        return null;
      }
      return sel;
    });
  }, []);

  // --- Derived data ------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allNonMembers.filter((nm) => {
      const matchSearch =
        !q ||
        (nm.name || "").toLowerCase().includes(q) ||
        nm.email.toLowerCase().includes(q) ||
        (nm.company || "").toLowerCase().includes(q);
      const created = new Date(nm.createdAt);
      const matchFrom = !fromDate || created >= new Date(fromDate);
      const matchTo = !toDate || created <= new Date(toDate + "T23:59:59");

      let matchActive = true;
      if (active?.kind === "stat") {
        if (active.stat === "pending") matchActive = nm.duplicateStatus === "pending";
        else if (active.stat === "merged") matchActive = nm.duplicateStatus === "merged";
        else if (active.stat === "ignored") matchActive = nm.duplicateStatus === "ignored";
        else if (active.stat === "new") matchActive = nm.duplicateStatus === "none";
        // "all" → no constraint
      } else if (active?.kind === "status") {
        matchActive = nm.duplicateStatus === active.value;
      } else if (active?.kind === "company") {
        matchActive = (nm.company || "").toLowerCase() === active.value.toLowerCase();
      } else if (active?.kind === "event") {
        matchActive = nm.events.some((e) => e.eventId === active.value);
      } else if (active?.kind === "importSource") {
        matchActive = nm.importSource === active.value;
      }

      return matchSearch && matchFrom && matchTo && matchActive;
    });
  }, [allNonMembers, search, fromDate, toDate, active]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortField) {
        case "name":
          av = (a.name || a.email).toLowerCase();
          bv = (b.name || b.email).toLowerCase();
          break;
        case "createdAt":
          av = new Date(a.createdAt).getTime();
          bv = new Date(b.createdAt).getTime();
          break;
        case "company":
          av = (a.company || "").toLowerCase();
          bv = (b.company || "").toLowerCase();
          break;
        case "duplicateStatus":
          av = a.duplicateStatus;
          bv = b.duplicateStatus;
          break;
        case "eventsCount":
          av = a.events.length;
          bv = b.events.length;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  // --- CSV export --------------------------------------------------------
  function exportCsv() {
    const rows = [
      [
        "Name",
        "Email",
        "Company",
        "Mobile",
        "LinkedIn",
        "Status",
        "Duplicate Reason",
        "Import Source",
        "Created At",
        "Events Registered",
        "Duplicate Of (email)",
      ],
      ...sorted.map((nm) => [
        nm.name || "",
        nm.email,
        nm.company || "",
        nm.mobile || "",
        nm.linkedinUrl || "",
        nm.duplicateStatus,
        nm.duplicateReason || "",
        nm.importSource || "",
        new Date(nm.createdAt).toISOString(),
        nm.events.map((e) => e.eventTitle).join("; "),
        nm.duplicateOf?.email || "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-salon-non-members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isStatActive = (stat: "all" | "pending" | "merged" | "ignored" | "new") =>
    active?.kind === "stat" && active.stat === stat;
  const isSegmentActive = (
    kind: "status" | "company" | "event" | "importSource",
    value: string
  ) => active?.kind === kind && active.value === value;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-black/40">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading non-members…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[#FF005A]/30 bg-[#FF005A]/5 p-4 text-sm text-[#FF005A]">
        Couldn&apos;t load non-members: {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top stats — clickable to drive the active selection */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total leads"
          value={stats.total}
          accent="#FF005A"
          total={stats.total}
          active={isStatActive("all") || active === null}
          onClick={() => toggleSelection({ kind: "stat", stat: "all" })}
        />
        <StatCard
          label="New leads"
          value={stats.newCount}
          accent="#007E72"
          subtitle="No duplicate detected"
          total={stats.total}
          active={isStatActive("new")}
          onClick={() => toggleSelection({ kind: "stat", stat: "new" })}
        />
        <StatCard
          label="Pending review"
          value={stats.pendingCount}
          accent="#FF005A"
          subtitle="Possible duplicates flagged"
          total={stats.total}
          active={isStatActive("pending")}
          onClick={() => toggleSelection({ kind: "stat", stat: "pending" })}
        />
        <StatCard
          label="Merged"
          value={stats.mergedCount}
          accent="#820A7D"
          subtitle="Converted into members"
          total={stats.total}
          active={isStatActive("merged")}
          onClick={() => toggleSelection({ kind: "stat", stat: "merged" })}
        />
        <StatCard
          label="Ignored"
          value={stats.ignoredCount}
          accent="#52525B"
          subtitle="Admin dismissed"
          total={stats.total}
          active={isStatActive("ignored")}
          onClick={() => toggleSelection({ kind: "stat", stat: "ignored" })}
        />
      </div>

      {/* Filters + chart-mode toggle */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-black/40" />
          <h3 className="text-sm font-bold text-black">Filters</h3>
          <span className="text-xs text-black/40 ml-auto">
            {filtered.length} of {allNonMembers.length} leads
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={fetchNonMembers}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-1">
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/30" />
              <Input
                placeholder="Name, email, company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              <Calendar className="inline h-3 w-3 mr-1" />
              From
            </label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              <Calendar className="inline h-3 w-3 mr-1" />
              To
            </label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Chart type
            </label>
            <div className="inline-flex h-9 rounded-md border border-black/15 overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setChartMode("pie")}
                className={`px-3 inline-flex items-center gap-1 text-xs font-semibold transition-colors ${
                  chartMode === "pie" ? "bg-[#FF005A] text-white" : "text-black/60 hover:bg-black/5"
                }`}
              >
                <PieIcon className="h-3.5 w-3.5" /> Pie
              </button>
              <button
                type="button"
                onClick={() => setChartMode("bar")}
                className={`px-3 inline-flex items-center gap-1 text-xs font-semibold transition-colors ${
                  chartMode === "bar" ? "bg-[#FF005A] text-white" : "text-black/60 hover:bg-black/5"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Bar
              </button>
            </div>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setSearch("");
                setFromDate("");
                setToDate("");
                setActive(null);
              }}
            >
              Clear filters
            </Button>
          </div>
          <div className="flex items-end justify-end lg:col-span-3">
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        {active && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="font-bold uppercase tracking-widest text-black/40">Selection:</span>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="inline-flex items-center gap-1 bg-[#FF005A]/10 text-[#FF005A] font-semibold px-2 py-1 rounded-full hover:bg-[#FF005A]/20"
            >
              {active.kind === "stat"
                ? active.stat === "all"
                  ? "All leads"
                  : active.stat === "new"
                  ? "New leads"
                  : active.stat === "pending"
                  ? "Pending review"
                  : active.stat === "merged"
                  ? "Merged"
                  : "Ignored"
                : active.kind === "status"
                ? `Status: ${active.value}`
                : active.kind === "company"
                ? `Company: ${active.value}`
                : active.kind === "event"
                ? `Event: ${stats.eventCounts.find((e) => e.id === active.value)?.label ?? active.value}`
                : `Import source: ${active.value}`}
              <span className="text-base leading-none">×</span>
            </button>
          </div>
        )}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signups over time */}
        <ChartCard title="Signups over time" subtitle={`${stats.signupsOverTime.length} months`}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={stats.signupsOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#00000060" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #00000020",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Signups"
                stroke="#FF005A"
                strokeWidth={2}
                dot={{ fill: "#FF005A", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Status split */}
        <ChartCard title="Duplicate status" subtitle="Distribution by review state">
          {stats.statusSplit.length === 0 ? (
            <EmptyChart />
          ) : chartMode === "pie" ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stats.statusSplit}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={pieLabelWithPercent(stats.statusSplit)}
                  labelLine={false}
                  onClick={(entry) =>
                    toggleSelection({ kind: "status", value: entry.status })
                  }
                >
                  {stats.statusSplit.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[i % AIS_COLORS.length]}
                      cursor="pointer"
                      opacity={
                        active === null ||
                        (active.kind === "status" && active.value === s.status)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.statusSplit} margin={{ left: 8, right: 8, top: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#00000060" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Leads"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(entry: { status?: string }) =>
                    entry?.status
                      ? toggleSelection({ kind: "status", value: entry.status })
                      : undefined
                  }
                >
                  {stats.statusSplit.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[i % AIS_COLORS.length]}
                      opacity={
                        active === null ||
                        (active.kind === "status" && active.value === s.status)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="top"
                    formatter={barLabelWithPercent(stats.statusSplit)}
                    style={{ fontSize: 11, fontWeight: 600, fill: "#00000099" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Top events */}
        <ChartCard title="Top events" subtitle="Events with the most non-member registrants">
          {stats.eventCounts.length === 0 ? (
            <EmptyChart />
          ) : chartMode === "pie" ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={stats.eventCounts}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={pieLabelWithPercent(stats.eventCounts)}
                  labelLine={false}
                  onClick={(entry) =>
                    toggleSelection({ kind: "event", value: entry.id })
                  }
                >
                  {stats.eventCounts.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[i % AIS_COLORS.length]}
                      cursor="pointer"
                      opacity={
                        active === null ||
                        (active.kind === "event" && active.value === s.id)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.eventCounts} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={160}
                  tick={{ fontSize: 10 }}
                  stroke="#00000060"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Leads"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(entry: { id?: string }) =>
                    entry?.id
                      ? toggleSelection({ kind: "event", value: entry.id })
                      : undefined
                  }
                >
                  {stats.eventCounts.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[i % AIS_COLORS.length]}
                      opacity={
                        active === null ||
                        (active.kind === "event" && active.value === s.id)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    formatter={barLabelWithPercent(stats.eventCounts)}
                    style={{ fontSize: 10, fontWeight: 600, fill: "#00000099" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Top companies */}
        <ChartCard title="Top companies" subtitle="Where non-member leads work">
          {stats.companyCounts.length === 0 ? (
            <EmptyChart />
          ) : chartMode === "pie" ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={stats.companyCounts}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={pieLabelWithPercent(stats.companyCounts)}
                  labelLine={false}
                  onClick={(entry) =>
                    toggleSelection({ kind: "company", value: entry.label })
                  }
                >
                  {stats.companyCounts.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[(i + 2) % AIS_COLORS.length]}
                      cursor="pointer"
                      opacity={
                        active === null ||
                        (active.kind === "company" && active.value === s.label)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.companyCounts} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={160}
                  tick={{ fontSize: 10 }}
                  stroke="#00000060"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Leads"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(entry: { label?: string }) =>
                    entry?.label
                      ? toggleSelection({ kind: "company", value: entry.label })
                      : undefined
                  }
                >
                  {stats.companyCounts.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[(i + 2) % AIS_COLORS.length]}
                      opacity={
                        active === null ||
                        (active.kind === "company" && active.value === s.label)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    formatter={barLabelWithPercent(stats.companyCounts)}
                    style={{ fontSize: 10, fontWeight: 600, fill: "#00000099" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Import sources */}
        <ChartCard title="Import sources" subtitle="Where the leads came from">
          {stats.importSourceCounts.length === 0 ? (
            <EmptyChart />
          ) : chartMode === "pie" ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stats.importSourceCounts}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={pieLabelWithPercent(stats.importSourceCounts)}
                  labelLine={false}
                  onClick={(entry) =>
                    toggleSelection({ kind: "importSource", value: entry.label })
                  }
                >
                  {stats.importSourceCounts.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[(i + 4) % AIS_COLORS.length]}
                      cursor="pointer"
                      opacity={
                        active === null ||
                        (active.kind === "importSource" && active.value === s.label)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.importSourceCounts} margin={{ left: 8, right: 8, top: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#00000060" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Leads"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(entry: { label?: string }) =>
                    entry?.label
                      ? toggleSelection({ kind: "importSource", value: entry.label })
                      : undefined
                  }
                >
                  {stats.importSourceCounts.map((s, i) => (
                    <Cell
                      key={i}
                      fill={AIS_COLORS[(i + 4) % AIS_COLORS.length]}
                      opacity={
                        active === null ||
                        (active.kind === "importSource" && active.value === s.label)
                          ? 1
                          : 0.4
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="top"
                    formatter={barLabelWithPercent(stats.importSourceCounts)}
                    style={{ fontSize: 11, fontWeight: 600, fill: "#00000099" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Data completeness */}
        <ChartCard title="Profile completeness" subtitle="How much info each lead has">
          {stats.completeness.length === 0 ? (
            <EmptyChart />
          ) : chartMode === "pie" ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stats.completeness}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={pieLabelWithPercent(stats.completeness)}
                  labelLine={false}
                >
                  {stats.completeness.map((s, i) => (
                    <Cell key={i} fill={AIS_COLORS[(i + 3) % AIS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.completeness} margin={{ left: 8, right: 8, top: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#00000060" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #00000020",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                  {stats.completeness.map((s, i) => (
                    <Cell key={i} fill={AIS_COLORS[(i + 3) % AIS_COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="top"
                    formatter={barLabelWithPercent(stats.completeness)}
                    style={{ fontSize: 11, fontWeight: 600, fill: "#00000099" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Sortable non-members table */}
      <div className="rounded-lg border border-black/10 overflow-hidden">
        <div className="bg-black/5 px-4 py-3 border-b border-black/10">
          <h3 className="text-sm font-bold text-black">Non-members ({sorted.length})</h3>
          <p className="text-xs text-black/50 mt-0.5">
            Click a column header to sort. Click a stat card or chart segment above to filter.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-black/60 text-xs uppercase tracking-wider">
              <tr>
                <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Company" field="company" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-left px-4 py-2 font-bold">Mobile</th>
                <th className="text-left px-4 py-2 font-bold">LinkedIn</th>
                <SortHeader label="Events" field="eventsCount" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Status" field="duplicateStatus" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Created" field="createdAt" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 100).map((nm) => (
                <tr key={nm.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-black truncate max-w-[200px]">
                      {nm.name || <span className="italic text-black/40">No name</span>}
                    </div>
                    <div className="text-xs text-black/50 truncate max-w-[200px]">{nm.email}</div>
                  </td>
                  <td className="px-4 py-2 text-black/70 truncate max-w-[160px]">
                    {nm.company || "—"}
                  </td>
                  <td className="px-4 py-2 text-black/70 text-xs">
                    {nm.mobile || <span className="text-black/30">—</span>}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {nm.linkedinUrl ? (
                      <a
                        href={nm.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <Linkedin className="h-3 w-3" /> Profile
                      </a>
                    ) : (
                      <span className="text-black/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-black/70 text-xs">
                    {nm.events.length === 0 ? (
                      <span className="text-black/30">—</span>
                    ) : (
                      <span className="font-semibold">{nm.events.length}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={nm.duplicateStatus} />
                    {nm.duplicateOf && (
                      <div className="text-[0.65rem] text-black/50 mt-1">
                        ↔ {nm.duplicateOf.name || nm.duplicateOf.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-black/60">
                    {new Date(nm.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > 100 && (
          <div className="bg-black/[0.02] px-4 py-2 text-xs text-black/50 text-center border-t border-black/10">
            Showing first 100 of {sorted.length} non-members. Use filters to narrow down, or click Export CSV to download all.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  accent,
  subtitle,
  active,
  onClick,
  total,
}: {
  label: string;
  value: number;
  accent: string;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
  total?: number;
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border rounded-lg p-4 bg-white transition-all ${
        active
          ? "border-[#FF005A] ring-2 ring-[#FF005A]/30 shadow-sm"
          : "border-black/10 hover:border-black/20 hover:shadow-sm"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold text-black">{value}</span>
        {total !== undefined && (
          <span className="text-sm font-bold text-black/45">{pct}%</span>
        )}
      </div>
      {subtitle && (
        <div className="mt-1 text-[0.65rem] text-black/40 leading-tight">{subtitle}</div>
      )}
    </button>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-black">{title}</h3>
        {subtitle && <p className="text-xs text-black/50 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[200px] flex items-center justify-center text-xs text-black/30 italic">
      No data for the current filter.
    </div>
  );
}

function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = field === sortField;
  return (
    <th
      className="text-left px-4 py-2 font-bold cursor-pointer hover:bg-black/5 select-none"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "text-[#FF005A]" : "text-black/30"}`}
          style={{ transform: active && sortDir === "desc" ? "rotate(180deg)" : undefined }}
        />
      </span>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return (
        <span className="text-[0.55rem] uppercase font-bold rounded px-1.5 py-0.5 bg-[#FF005A] text-white inline-flex items-center gap-1">
          Pending
        </span>
      );
    case "merged":
      return (
        <span className="text-[0.55rem] uppercase font-bold rounded px-1.5 py-0.5 bg-[#820A7D] text-white">
          Merged
        </span>
      );
    case "ignored":
      return (
        <span className="text-[0.55rem] uppercase font-bold rounded px-1.5 py-0.5 bg-black/10 text-black/60">
          Ignored
        </span>
      );
    default:
      return (
        <span className="text-[0.55rem] uppercase font-bold rounded px-1.5 py-0.5 bg-[#007E72]/10 text-[#007E72]">
          New
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

function computeStats(nonMembers: NonMember[]) {
  const total = nonMembers.length;
  const pendingCount = nonMembers.filter((nm) => nm.duplicateStatus === "pending").length;
  const mergedCount = nonMembers.filter((nm) => nm.duplicateStatus === "merged").length;
  const ignoredCount = nonMembers.filter((nm) => nm.duplicateStatus === "ignored").length;
  const newCount = nonMembers.filter((nm) => nm.duplicateStatus === "none").length;

  // Signups over time (by month)
  const byMonth = new Map<string, number>();
  for (const nm of nonMembers) {
    const d = new Date(nm.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  }
  const signupsOverTime = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, count]) => {
      const [y, m] = key.split("-");
      const date = new Date(Number(y), Number(m) - 1, 1);
      return {
        month: date.toLocaleString("en", { month: "short", year: "2-digit" }),
        count,
      };
    });

  // Status split
  const statusSplit = [
    { label: "New leads", count: newCount, status: "none" },
    { label: "Pending review", count: pendingCount, status: "pending" },
    { label: "Merged", count: mergedCount, status: "merged" },
    { label: "Ignored", count: ignoredCount, status: "ignored" },
  ].filter((s) => s.count > 0);

  // Top events
  const eventMap = new Map<string, { label: string; count: number; id: string }>();
  for (const nm of nonMembers) {
    for (const e of nm.events) {
      const existing = eventMap.get(e.eventId);
      if (existing) {
        existing.count++;
      } else {
        eventMap.set(e.eventId, {
          id: e.eventId,
          label: e.eventTitle,
          count: 1,
        });
      }
    }
  }
  const eventCounts = Array.from(eventMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top companies
  const companyMap = new Map<string, number>();
  for (const nm of nonMembers) {
    if (!nm.company) continue;
    const c = nm.company.trim();
    if (!c) continue;
    companyMap.set(c, (companyMap.get(c) || 0) + 1);
  }
  const companyCounts = Array.from(companyMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Import sources
  const importMap = new Map<string, number>();
  for (const nm of nonMembers) {
    if (!nm.importSource) continue;
    importMap.set(nm.importSource, (importMap.get(nm.importSource) || 0) + 1);
  }
  const importSourceCounts = Array.from(importMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Profile completeness — % of leads that have each field filled
  const withMobile = nonMembers.filter((nm) => nm.mobile).length;
  const withLinkedIn = nonMembers.filter((nm) => nm.linkedinUrl).length;
  const withCompany = nonMembers.filter((nm) => nm.company).length;
  const withName = nonMembers.filter((nm) => nm.name).length;
  const withBio = nonMembers.filter((nm) => nm.bio).length;
  const completeness = [
    { label: "Has name", count: withName },
    { label: "Has company", count: withCompany },
    { label: "Has mobile", count: withMobile },
    { label: "Has LinkedIn", count: withLinkedIn },
    { label: "Has bio", count: withBio },
  ].filter((s) => s.count > 0);

  return {
    total,
    newCount,
    pendingCount,
    mergedCount,
    ignoredCount,
    signupsOverTime,
    statusSplit,
    eventCounts,
    companyCounts,
    importSourceCounts,
    completeness,
  };
}
