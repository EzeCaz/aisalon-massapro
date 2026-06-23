"use client";

import { useMemo, useState } from "react";
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
  CartesianGrid,
} from "recharts";
import {
  Search,
  ArrowUpDown,
  Calendar,
  Filter,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  Table as TableIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MEMBER_TAG_CATALOG, tagColor } from "@/lib/tags";

type Member = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  mobile: string | null;
  company: string | null;
  linkedinUrl: string | null;
  bio: string | null;
  interestedIn: string | null;
  profileCategories: string | null;
  appliedFor: string | null;
  invitedToSpeak: string | null;
  importSource: string | null;
  importedAt: string | null;
  onboardedAt: string | null;
  role: string;
  tags: { id: string; label: string; color: string | null }[];
  _count: { images: number; presentations: number; speakers: number };
};

type Props = { members: Member[] };

// AIS brand palette for charts
const AIS_COLORS = [
  "#FF005A", // RED
  "#004F98", // navy
  "#007E72", // teal
  "#00E6FF", // cyan
  "#820A7D", // purple
  "#FFAC30", // orange
  "#52525B", // zinc
  "#10b981", // emerald
  "#f43f5e", // rose
  "#a855f7", // violet
];

type SortField = "name" | "createdAt" | "importedAt" | "company" | "appliedFor";
type SortDir = "asc" | "desc";

// --- Chart type toggle --------------------------------------------------
// Each chart on the dashboard can be rendered as a bar chart, a pie chart,
// or a table. The admin can switch each chart individually via a 3-button
// segmented control in the chart card header, or switch ALL charts at once
// via the "Set all" control above the charts grid.
//
// Defaults preserve the original V3.3 rendering except "Signups over time"
// which was a line chart — it is now a vertical bar chart by default.
type ChartType = "bar" | "pie" | "table";

const CHART_IDS = [
  "signups",
  "source",
  "interestedIn",
  "profileCategories",
  "appliedFor",
  "tags",
] as const;
type ChartId = (typeof CHART_IDS)[number];

const DEFAULT_CHART_TYPES: Record<ChartId, ChartType> = {
  signups: "bar",
  source: "pie",
  interestedIn: "bar",
  profileCategories: "bar",
  appliedFor: "pie",
  tags: "bar",
};

export function MemberDashboard({ members }: Props) {
  // --- Filters -----------------------------------------------------------
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<"all" | "imported" | "self">("all");
  const [filterApplied, setFilterApplied] = useState<string>("");
  const [filterTag, setFilterTag] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // --- Sort --------------------------------------------------------------
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  // --- Derived data ------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const matchSearch =
        !q ||
        (m.name || "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.company || "").toLowerCase().includes(q);
      const matchSource =
        filterSource === "all" ||
        (filterSource === "imported" && !!m.importSource) ||
        (filterSource === "self" && !m.importSource);
      const matchApplied = !filterApplied || m.appliedFor === filterApplied;
      const matchTag = !filterTag || m.tags.some((t) => t.label === filterTag);
      const created = new Date(m.createdAt);
      const matchFrom = !fromDate || created >= new Date(fromDate);
      const matchTo = !toDate || created <= new Date(toDate + "T23:59:59");
      return matchSearch && matchSource && matchApplied && matchTag && matchFrom && matchTo;
    });
  }, [members, search, filterSource, filterApplied, filterTag, fromDate, toDate]);

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
        case "importedAt":
          av = a.importedAt ? new Date(a.importedAt).getTime() : 0;
          bv = b.importedAt ? new Date(b.importedAt).getTime() : 0;
          break;
        case "company":
          av = (a.company || "").toLowerCase();
          bv = (b.company || "").toLowerCase();
          break;
        case "appliedFor":
          av = (a.appliedFor || "").toLowerCase();
          bv = (b.appliedFor || "").toLowerCase();
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  // --- Chart data --------------------------------------------------------
  const stats = useMemo(() => computeStats(filtered), [filtered]);

  // --- Chart type state --------------------------------------------------
  // Per-chart render type (bar / pie / table). The admin can toggle each
  // chart individually via the segmented control in the chart header, or
  // switch all charts at once via the "Set all" control above the grid.
  const [chartTypes, setChartTypes] = useState<Record<ChartId, ChartType>>(
    DEFAULT_CHART_TYPES
  );

  function setChartType(id: ChartId, type: ChartType) {
    setChartTypes((prev) => ({ ...prev, [id]: type }));
  }

  function setAllChartTypes(type: ChartType) {
    setChartTypes(() => {
      const next = {} as Record<ChartId, ChartType>;
      for (const id of CHART_IDS) next[id] = type;
      return next;
    });
  }

  // True when every chart is currently the same type — used to highlight
  // the "active" button in the global "Set all" control.
  const allSameType = (Object.keys(chartTypes) as ChartId[]).every(
    (id) => chartTypes[id] === chartTypes.signups
  );
  const globalActive: ChartType | null = allSameType
    ? chartTypes.signups
    : null;

  // --- CSV export --------------------------------------------------------
  function exportCsv() {
    const rows = [
      [
        "Name",
        "Email",
        "Company",
        "Mobile",
        "LinkedIn",
        "Interested In",
        "Profile Categories",
        "Applied For",
        "Invited",
        "Import Source",
        "Tags",
        "Created At",
        "Onboarded At",
      ],
      ...sorted.map((m) => [
        m.name || "",
        m.email,
        m.company || "",
        m.mobile || "",
        m.linkedinUrl || "",
        m.interestedIn || "",
        m.profileCategories || "",
        m.appliedFor || "",
        m.invitedToSpeak || "",
        m.importSource || "",
        m.tags.map((t) => t.label).join("; "),
        new Date(m.createdAt).toISOString(),
        m.onboardedAt ? new Date(m.onboardedAt).toISOString() : "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-salon-members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total members" value={stats.total} accent="#FF005A" />
        <StatCard label="Imported" value={stats.importedCount} accent="#00E6FF" />
        <StatCard label="Self-registered" value={stats.selfCount} accent="#007E72" />
        <StatCard label="Onboarded" value={stats.onboardedCount} accent="#820A7D" />
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-black/40" />
          <h3 className="text-sm font-bold text-black">Filters</h3>
          <span className="text-xs text-black/40 ml-auto">
            {filtered.length} of {members.length} members
          </span>
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
              Source
            </label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as "all" | "imported" | "self")}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="all">All sources</option>
              <option value="imported">Imported only</option>
              <option value="self">Self-registered only</option>
            </select>
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Applied for
            </label>
            <select
              value={filterApplied}
              onChange={(e) => setFilterApplied(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="">Any</option>
              <option value="Fast pitch">Fast pitch</option>
              <option value="Presentation/Lecure">Presentation/Lecture</option>
            </select>
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Tag
            </label>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="">Any tag</option>
              {MEMBER_TAG_CATALOG.map((t) => (
                <option key={t.label} value={t.label}>
                  {t.label}
                </option>
              ))}
            </select>
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
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setSearch("");
                setFilterSource("all");
                setFilterApplied("");
                setFilterTag("");
                setFromDate("");
                setToDate("");
              }}
            >
              Clear filters
            </Button>
          </div>
          <div className="flex items-end justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={exportCsv}
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Charts toolbar — global "Set all" control */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-black flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#FF005A]" />
            Charts
          </h2>
          <p className="text-xs text-black/50 mt-0.5">
            Toggle each chart between bar, pie, and table — or switch them all at once.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-md border border-black/15 bg-white p-0.5">
          <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/50 px-2">
            Set all
          </span>
          <ChartTypeButton
            active={globalActive === "bar"}
            onClick={() => setAllChartTypes("bar")}
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            label="Bar"
          />
          <ChartTypeButton
            active={globalActive === "pie"}
            onClick={() => setAllChartTypes("pie")}
            icon={<PieChartIcon className="h-3.5 w-3.5" />}
            label="Pie"
          />
          <ChartTypeButton
            active={globalActive === "table"}
            onClick={() => setAllChartTypes("table")}
            icon={<TableIcon className="h-3.5 w-3.5" />}
            label="Table"
          />
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ToggleableChartCard
          title="Signups over time"
          subtitle={`${stats.signupsOverTime.length} months`}
          chartType={chartTypes.signups}
          onTypeChange={(t) => setChartType("signups", t)}
          data={stats.signupsOverTime.map((s) => ({ label: s.month, count: s.count }))}
          colorOffset={0}
          orientation="vertical"
          height={240}
        />
        <ToggleableChartCard
          title="Source split"
          subtitle="Imported vs self-registered"
          chartType={chartTypes.source}
          onTypeChange={(t) => setChartType("source", t)}
          data={stats.sourceSplit.map((s) => ({ label: s.label, count: s.count }))}
          colorOffset={0}
          orientation="vertical"
          height={240}
        />
        <ToggleableChartCard
          title="I am interested in…"
          subtitle="Top interests across all members"
          chartType={chartTypes.interestedIn}
          onTypeChange={(t) => setChartType("interestedIn", t)}
          data={stats.interestedInCounts}
          colorOffset={0}
          orientation="horizontal"
          height={260}
        />
        <ToggleableChartCard
          title="Tell us more about yourself"
          subtitle="Member self-identification"
          chartType={chartTypes.profileCategories}
          onTypeChange={(t) => setChartType("profileCategories", t)}
          data={stats.profileCategoriesCounts}
          colorOffset={2}
          orientation="horizontal"
          height={260}
        />
        <ToggleableChartCard
          title="Applied for"
          subtitle="Fast pitch vs Presentation/Lecture"
          chartType={chartTypes.appliedFor}
          onTypeChange={(t) => setChartType("appliedFor", t)}
          data={stats.appliedForCounts}
          colorOffset={4}
          orientation="vertical"
          height={240}
        />
        <ToggleableChartCard
          title="Top tags"
          subtitle="Most-assigned member tags"
          chartType={chartTypes.tags}
          onTypeChange={(t) => setChartType("tags", t)}
          data={stats.tagCounts}
          colorOffset={0}
          orientation="horizontal"
          height={260}
          useTagColors
        />
      </div>

      {/* Sortable members table */}
      <div className="rounded-lg border border-black/10 overflow-hidden">
        <div className="bg-black/5 px-4 py-3 border-b border-black/10">
          <h3 className="text-sm font-bold text-black">
            Members ({sorted.length})
          </h3>
          <p className="text-xs text-black/50 mt-0.5">
            Click a column header to sort. Use the filters above to slice the data.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-black/60 text-xs uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Company" field="company" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-left px-4 py-2 font-bold">Interested in</th>
                <th className="text-left px-4 py-2 font-bold">Categories</th>
                <SortHeader label="Applied" field="appliedFor" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-left px-4 py-2 font-bold">Tags</th>
                <th className="text-left px-4 py-2 font-bold">Source</th>
                <SortHeader label="Created" field="createdAt" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Imported" field="importedAt" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 100).map((m) => (
                <tr key={m.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-black truncate max-w-[200px]">
                      {m.name || m.email.split("@")[0]}
                    </div>
                    <div className="text-xs text-black/50 truncate max-w-[200px]">{m.email}</div>
                  </td>
                  <td className="px-4 py-2 text-black/70 truncate max-w-[160px]">
                    {m.company || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(m.interestedIn || "")
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .slice(0, 3)
                        .map((s, i) => (
                          <span
                            key={i}
                            className="text-[0.6rem] font-medium bg-[#FF005A]/10 text-[#FF005A] px-1.5 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(m.profileCategories || "")
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .slice(0, 3)
                        .map((s, i) => (
                          <span
                            key={i}
                            className="text-[0.6rem] font-medium bg-[#004F98]/10 text-[#004F98] px-1.5 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {m.appliedFor ? (
                      <span
                        className={`text-[0.65rem] font-semibold px-1.5 py-0.5 rounded ${
                          m.appliedFor === "Fast pitch"
                            ? "bg-[#FF005A]/10 text-[#FF005A]"
                            : "bg-[#004F98]/10 text-[#004F98]"
                        }`}
                      >
                        {m.appliedFor}
                      </span>
                    ) : (
                      <span className="text-xs text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[140px]">
                      {m.tags.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className="text-[0.6rem] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${t.color || tagColor(t.label)}20`,
                            color: t.color || tagColor(t.label),
                          }}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {m.importSource ? (
                      <span className="text-[0.6rem] font-bold uppercase bg-[#00E6FF]/20 text-[#007E72] px-1.5 py-0.5 rounded">
                        Imported
                      </span>
                    ) : (
                      <span className="text-[0.6rem] font-bold uppercase bg-[#007E72]/10 text-[#007E72] px-1.5 py-0.5 rounded">
                        Self
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-black/60">
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-black/60">
                    {m.importedAt ? new Date(m.importedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-black/40 text-sm">
                    No members match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sorted.length > 100 && (
          <div className="bg-black/[0.02] px-4 py-2 text-xs text-black/50 text-center border-t border-black/10">
            Showing first 100 of {sorted.length} members. Use filters to narrow down, or click Export CSV to download all.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-3xl font-extrabold text-black">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToggleableChartCard — chart card with a 3-button segmented control in the
// header that switches the body between Bar / Pie / Table views. All three
// views render the SAME underlying data (an array of { label, count } rows);
// they're just three different visual representations of it.
//
// Props:
//   - title, subtitle: header text
//   - chartType: current render mode
//   - onTypeChange: callback when the admin picks a different mode
//   - data: { label, count }[] — the rows to visualize
//   - colorOffset: rotate the AIS color palette so adjacent charts don't
//     start on the same color
//   - orientation: "horizontal" = horizontal bar chart (good for long
//     category labels like "I am interested in…"); "vertical" = vertical
//     bar chart (good for timeseries / few categories like "Source split")
//   - height: pixel height for the chart canvas (table mode grows beyond
//     this if there are many rows, up to a max of height+120)
//   - useTagColors: if true, use the tag-catalog colors (tagColor()) for
//     each row instead of the AIS palette — used by the Top tags chart
// ---------------------------------------------------------------------------

type ChartRow = { label: string; count: number };

function ToggleableChartCard({
  title,
  subtitle,
  chartType,
  onTypeChange,
  data,
  colorOffset = 0,
  orientation = "vertical",
  height = 240,
  useTagColors = false,
}: {
  title: string;
  subtitle?: string;
  chartType: ChartType;
  onTypeChange: (t: ChartType) => void;
  data: ChartRow[];
  colorOffset?: number;
  orientation?: "horizontal" | "vertical";
  height?: number;
  useTagColors?: boolean;
}) {
  const colorFor = (label: string, i: number) =>
    useTagColors
      ? tagColor(label) || AIS_COLORS[(i + colorOffset) % AIS_COLORS.length]
      : AIS_COLORS[(i + colorOffset) % AIS_COLORS.length];

  const total = data.reduce((sum, r) => sum + r.count, 0);
  // Table view can grow taller than the chart canvas — cap at height + 120
  // so a 10-row table doesn't blow past the screen.
  const tableMaxHeight = Math.max(height, Math.min(height + 120, data.length * 32 + 40));

  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-black">{title}</h3>
          {subtitle && <p className="text-xs text-black/50 mt-0.5">{subtitle}</p>}
        </div>
        <ChartTypeToggleGroup current={chartType} onChange={onTypeChange} />
      </div>

      {/* BAR view */}
      {chartType === "bar" && (
        <ResponsiveContainer
          width="100%"
          height={orientation === "horizontal" ? Math.max(height, data.length * 28 + 40) : height}
        >
          {orientation === "horizontal" ? (
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
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
              <Bar dataKey="count" name="Members" radius={[0, 4, 4, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={colorFor(entry.label, i)} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#00000060" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #00000020",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" name="Members" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={colorFor(entry.label, i)} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      )}

      {/* PIE view */}
      {chartType === "pie" && (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={Math.min(80, (height - 40) / 2)}
              label={(entry) =>
                `${entry.label} (${entry.count})`
              }
              labelLine={false}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={colorFor(entry.label, i)} />
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
      )}

      {/* TABLE view */}
      {chartType === "table" && (
        <div
          className="overflow-auto rounded-md border border-black/10"
          style={{ maxHeight: tableMaxHeight }}
        >
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/60 text-[0.65rem] uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Label</th>
                <th className="text-right px-3 py-2 font-bold w-20">Count</th>
                <th className="text-right px-3 py-2 font-bold w-20">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-black/40">
                    No data
                  </td>
                </tr>
              ) : (
                data.map((entry, i) => {
                  const pct = total > 0 ? (entry.count / total) * 100 : 0;
                  return (
                    <tr
                      key={`${entry.label}-${i}`}
                      className="border-t border-black/5 hover:bg-black/[0.02]"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: colorFor(entry.label, i) }}
                          />
                          <span className="font-medium text-black truncate">{entry.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {entry.count}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-black/50 tabular-nums">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {data.length > 0 && (
              <tfoot className="sticky bottom-0 bg-black/[0.03] border-t border-black/10">
                <tr>
                  <td className="px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-black/60">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-black">
                    {total}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-black/50 tabular-nums">
                    100.0%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartTypeToggleGroup — the 3-button segmented control that lives in the
// top-right of each chart card. Highlights the currently active mode.
// ---------------------------------------------------------------------------
function ChartTypeToggleGroup({
  current,
  onChange,
}: {
  current: ChartType;
  onChange: (t: ChartType) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-black/10 bg-black/[0.02] p-0.5 shrink-0">
      <ChartTypeButton
        active={current === "bar"}
        onClick={() => onChange("bar")}
        icon={<BarChart3 className="h-3.5 w-3.5" />}
        label="Bar"
      />
      <ChartTypeButton
        active={current === "pie"}
        onClick={() => onChange("pie")}
        icon={<PieChartIcon className="h-3.5 w-3.5" />}
        label="Pie"
      />
      <ChartTypeButton
        active={current === "table"}
        onClick={() => onChange("table")}
        icon={<TableIcon className="h-3.5 w-3.5" />}
        label="Table"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartTypeButton — one button in a ChartTypeToggleGroup (or in the global
// "Set all" control). Active state is highlighted with the AIS pink + a
// subtle shadow; inactive uses a muted gray that darkens on hover.
// ---------------------------------------------------------------------------
function ChartTypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Show as ${label.toLowerCase()}`}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[0.65rem] font-bold transition-colors ${
        active
          ? "bg-white text-[#FF005A] shadow-sm"
          : "text-black/50 hover:text-black/80"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
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

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

function computeStats(members: Member[]) {
  const total = members.length;
  const importedCount = members.filter((m) => m.importSource).length;
  const selfCount = total - importedCount;
  const onboardedCount = members.filter((m) => m.onboardedAt).length;

  // Signups over time (by month)
  const byMonth = new Map<string, number>();
  for (const m of members) {
    const d = new Date(m.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  }
  const signupsOverTime = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12) // last 12 months
    .map(([key, count]) => {
      const [y, m] = key.split("-");
      const date = new Date(Number(y), Number(m) - 1, 1);
      return {
        month: date.toLocaleString("en", { month: "short", year: "2-digit" }),
        count,
      };
    });

  // Source split
  const sourceSplit = [
    { label: "Imported", count: importedCount },
    { label: "Self-registered", count: selfCount },
  ].filter((s) => s.count > 0);

  // Interested in (union of CSV values)
  const interestedCounts = new Map<string, number>();
  for (const m of members) {
    if (!m.interestedIn) continue;
    for (const v of m.interestedIn.split(",").map((s) => s.trim()).filter(Boolean)) {
      interestedCounts.set(v, (interestedCounts.get(v) || 0) + 1);
    }
  }
  const interestedInCounts = Array.from(interestedCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Profile categories
  const catCounts = new Map<string, number>();
  for (const m of members) {
    if (!m.profileCategories) continue;
    for (const v of m.profileCategories.split(",").map((s) => s.trim()).filter(Boolean)) {
      catCounts.set(v, (catCounts.get(v) || 0) + 1);
    }
  }
  const profileCategoriesCounts = Array.from(catCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Applied for
  const appliedCounts = new Map<string, number>();
  for (const m of members) {
    if (!m.appliedFor) continue;
    for (const v of m.appliedFor.split(/[/,]/).map((s) => s.trim()).filter(Boolean)) {
      appliedCounts.set(v, (appliedCounts.get(v) || 0) + 1);
    }
  }
  const appliedForCounts = Array.from(appliedCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Tags
  const tagCountsMap = new Map<string, number>();
  for (const m of members) {
    for (const t of m.tags) {
      tagCountsMap.set(t.label, (tagCountsMap.get(t.label) || 0) + 1);
    }
  }
  const tagCounts = Array.from(tagCountsMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total,
    importedCount,
    selfCount,
    onboardedCount,
    signupsOverTime,
    sourceSplit,
    interestedInCounts,
    profileCategoriesCounts,
    appliedForCounts,
    tagCounts,
  };
}
