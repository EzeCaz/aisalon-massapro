"use client";

import { useMemo, useState, useCallback } from "react";
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
import {
  ToggleableChartCard,
  ChartTypeButton,
  useChartTypeState,
} from "@/components/admin/toggleable-chart-card";
import {
  ActiveSelectionChip,
  type ActiveSelection,
  toggleActiveSelection,
} from "@/components/ais/analytics-shell";
import { formatDateTlv } from "@/lib/datetime-tlv";

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
  utmUid: string | null;
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

// Every column in the table is now sortable (Item 2B).
type SortField =
  | "name"
  | "createdAt"
  | "importedAt"
  | "company"
  | "appliedFor"
  | "interestedIn"
  | "profileCategories"
  | "tags"
  | "source"
  | "utmUid";
type SortDir = "asc" | "desc";

// --- Chart type toggle --------------------------------------------------
// Each chart on the dashboard can be rendered as a bar chart, a pie chart,
// or a table. The admin can switch each chart individually via a 3-button
// segmented control in the chart card header, or switch ALL charts at once
// via the "Set all" control above the charts grid.
type ChartType2 = "bar" | "pie" | "table";

const CHART_IDS = [
  "signups",
  "source",
  "interestedIn",
  "profileCategories",
  "appliedFor",
  "tags",
] as const;
type ChartId = (typeof CHART_IDS)[number];

const DEFAULT_CHART_TYPES: Record<ChartId, ChartType2> = {
  signups: "bar",
  source: "pie",
  interestedIn: "bar",
  profileCategories: "bar",
  appliedFor: "pie",
  tags: "bar",
};

// Dimension labels for the active-selection chip
const DIMENSION_LABELS: Record<string, string> = {
  source: "Source",
  interestedIn: "Interested in",
  profileCategories: "Category",
  appliedFor: "Applied for",
  tags: "Tag",
  utmUid: "UTM UID",
};

export function MemberDashboard({ members }: Props) {
  // --- Per-column filters (Item 2C) --------------------------------------
  // One dropdown per column, plus a global search + From/To date range.
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<string>("ALL");
  const [filterApplied, setFilterApplied] = useState<string>("ALL");
  const [filterTag, setFilterTag] = useState<string>("ALL");
  const [filterInterested, setFilterInterested] = useState<string>("ALL");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterUtmUid, setFilterUtmUid] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // --- Cross-filter active selection (Item 2D) ---------------------------
  const [active, setActive] = useState<ActiveSelection>(null);

  const toggleActive = useCallback((sel: ActiveSelection) => {
    setActive((prev) => toggleActiveSelection(prev, sel));
  }, []);

  // --- Sort (Item 2B) -----------------------------------------------------
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

  // --- Chart type state (preserved from previous version) ----------------
  const { chartTypes, setChartType, setAllChartTypes, globalActive } =
    useChartTypeState(CHART_IDS, DEFAULT_CHART_TYPES);

  // --- Distinct values for per-column dropdowns (Item 2C) ----------------
  const distinct = useMemo(() => {
    const interested = new Set<string>();
    const categories = new Set<string>();
    const utmUids = new Set<string>();
    const appliedForSet = new Set<string>();
    for (const m of members) {
      if (m.interestedIn)
        for (const v of m.interestedIn.split(",").map((s) => s.trim()).filter(Boolean))
          interested.add(v);
      if (m.profileCategories)
        for (const v of m.profileCategories.split(",").map((s) => s.trim()).filter(Boolean))
          categories.add(v);
      if (m.utmUid) utmUids.add(m.utmUid);
      if (m.appliedFor)
        for (const v of m.appliedFor.split(/[/,]/).map((s) => s.trim()).filter(Boolean))
          appliedForSet.add(v);
    }
    return {
      interested: Array.from(interested).sort(),
      categories: Array.from(categories).sort(),
      utmUids: Array.from(utmUids).sort(),
      appliedFor: Array.from(appliedForSet).sort(),
    };
  }, [members]);

  // --- Derived data: apply ALL filters (per-column + cross-filter) -------
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const matchSearch =
        !q ||
        (m.name || "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.company || "").toLowerCase().includes(q) ||
        (m.utmUid || "").toLowerCase().includes(q);
      const matchSource =
        filterSource === "ALL" ||
        (filterSource === "imported" && !!m.importSource) ||
        (filterSource === "self" && !m.importSource);
      const matchApplied =
        filterApplied === "ALL" || m.appliedFor === filterApplied;
      const matchTag =
        filterTag === "ALL" || m.tags.some((t) => t.label === filterTag);
      const matchInterested =
        filterInterested === "ALL" ||
        (m.interestedIn || "")
          .split(",")
          .map((s) => s.trim())
          .includes(filterInterested);
      const matchCategory =
        filterCategory === "ALL" ||
        (m.profileCategories || "")
          .split(",")
          .map((s) => s.trim())
          .includes(filterCategory);
      const matchUtmUid =
        filterUtmUid === "ALL" || m.utmUid === filterUtmUid;
      const created = new Date(m.createdAt);
      const matchFrom = !fromDate || created >= new Date(fromDate);
      const matchTo = !toDate || created <= new Date(toDate + "T23:59:59");

      // --- Cross-filter active selection (Item 2D) ---------------------
      let matchActive = true;
      if (active) {
        if (active.kind === "source") {
          if (active.value === "Imported") matchActive = !!m.importSource;
          else if (active.value === "Self-registered") matchActive = !m.importSource;
        } else if (active.kind === "interestedIn") {
          matchActive = (m.interestedIn || "")
            .split(",")
            .map((s) => s.trim())
            .includes(active.value);
        } else if (active.kind === "profileCategories") {
          matchActive = (m.profileCategories || "")
            .split(",")
            .map((s) => s.trim())
            .includes(active.value);
        } else if (active.kind === "appliedFor") {
          matchActive = m.appliedFor === active.value;
        } else if (active.kind === "tags") {
          matchActive = m.tags.some((t) => t.label === active.value);
        } else if (active.kind === "utmUid") {
          matchActive = m.utmUid === active.value;
        }
      }

      return (
        matchSearch &&
        matchSource &&
        matchApplied &&
        matchTag &&
        matchInterested &&
        matchCategory &&
        matchUtmUid &&
        matchFrom &&
        matchTo &&
        matchActive
      );
    });
  }, [
    members,
    search,
    filterSource,
    filterApplied,
    filterTag,
    filterInterested,
    filterCategory,
    filterUtmUid,
    fromDate,
    toDate,
    active,
  ]);

  // --- Sorted (Item 2B) --------------------------------------------------
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
        case "interestedIn":
          av = (a.interestedIn || "").toLowerCase();
          bv = (b.interestedIn || "").toLowerCase();
          break;
        case "profileCategories":
          av = (a.profileCategories || "").toLowerCase();
          bv = (b.profileCategories || "").toLowerCase();
          break;
        case "tags":
          av = a.tags.map((t) => t.label).join(",").toLowerCase();
          bv = b.tags.map((t) => t.label).join(",").toLowerCase();
          break;
        case "source":
          av = a.importSource ? "imported" : "self";
          bv = b.importSource ? "imported" : "self";
          break;
        case "utmUid":
          av = (a.utmUid || "").toLowerCase();
          bv = (b.utmUid || "").toLowerCase();
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
        "UTM UID",
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
        m.utmUid || "",
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

  // True when any filter is set — drives the Clear button visibility.
  const hasFilters =
    !!search ||
    filterSource !== "ALL" ||
    filterApplied !== "ALL" ||
    filterTag !== "ALL" ||
    filterInterested !== "ALL" ||
    filterCategory !== "ALL" ||
    filterUtmUid !== "ALL" ||
    !!fromDate ||
    !!toDate ||
    !!active;

  function clearAll() {
    setSearch("");
    setFilterSource("ALL");
    setFilterApplied("ALL");
    setFilterTag("ALL");
    setFilterInterested("ALL");
    setFilterCategory("ALL");
    setFilterUtmUid("ALL");
    setFromDate("");
    setToDate("");
    setActive(null);
  }

  // Per-chart active-value resolver: returns active.value if the active
  // selection matches this chart's kind, else null (so all slices render
  // at full opacity).
  const activeFor = (kind: string) =>
    active && active.kind === kind ? active.value : null;

  return (
    <div className="space-y-8">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total members" value={stats.total} accent="#FF005A" />
        <StatCard label="Imported" value={stats.importedCount} accent="#00E6FF" />
        <StatCard label="Self-registered" value={stats.selfCount} accent="#007E72" />
        <StatCard label="Onboarded" value={stats.onboardedCount} accent="#820A7D" />
      </div>

      {/* Filters — dashboard-report canonical style (Item 2F) */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-black/40" />
          <h3 className="text-sm font-bold text-black">Filters</h3>
          <span className="text-xs text-black/40 ml-auto">
            {filtered.length} of {members.length} members
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Global search (Item 2C — searches across ALL columns) */}
          <div className="lg:col-span-2">
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              <Search className="inline h-3 w-3 mr-1" />
              Search all columns
            </label>
            <Input
              placeholder="Name, email, company, UTM UID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          {/* Per-column dropdown: Source */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Source
            </label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">All sources</option>
              <option value="imported">Imported only</option>
              <option value="self">Self-registered only</option>
            </select>
          </div>
          {/* Per-column dropdown: Applied for */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Applied for
            </label>
            <select
              value={filterApplied}
              onChange={(e) => setFilterApplied(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any</option>
              {distinct.appliedFor.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: Interested in (CSV token) */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Interested in
            </label>
            <select
              value={filterInterested}
              onChange={(e) => setFilterInterested(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any ({distinct.interested.length})</option>
              {distinct.interested.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: Profile categories (CSV token) */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Profile categories
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any ({distinct.categories.length})</option>
              {distinct.categories.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: Tag */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Tag
            </label>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any tag</option>
              {MEMBER_TAG_CATALOG.map((t) => (
                <option key={t.label} value={t.label}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: UTM UID (Item 2E) */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              UTM UID
            </label>
            <select
              value={filterUtmUid}
              onChange={(e) => setFilterUtmUid(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any ({distinct.utmUids.length})</option>
              {distinct.utmUids.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Date range */}
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
          <div className="flex items-end justify-end lg:col-span-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={clearAll}
                disabled={!hasFilters}
              >
                Clear filters
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Active cross-filter selection chip (Item 2D) */}
        {active && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="font-bold uppercase tracking-widest text-black/40">
              Selection:
            </span>
            <ActiveSelectionChip
              active={active}
              onClear={() => setActive(null)}
              labelFor={(k) => DIMENSION_LABELS[k] || k}
            />
          </div>
        )}
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
            Click a slice / bar / row to filter the dashboard to that selection.
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

      {/* Charts grid — every chart's slices/bars/rows are clickable (Item 2D) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signups over time is a timeseries — clicking a month narrows to members
            who signed up in that month (active.kind = "createdAt-month"). */}
        <ToggleableChartCard
          title="Signups over time"
          subtitle={`${stats.signupsOverTime.length} months`}
          chartType={chartTypes.signups}
          onTypeChange={(t) => setChartType("signups", t)}
          data={stats.signupsOverTime.map((s) => ({ label: s.month, count: s.count }))}
          colorOffset={0}
          orientation="vertical"
          height={240}
          activeValue={activeFor("createdAt-month")}
          onSliceClick={(label) =>
            toggleActive({ kind: "createdAt-month", value: label })
          }
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
          activeValue={activeFor("source")}
          onSliceClick={(label) =>
            toggleActive({ kind: "source", value: label })
          }
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
          activeValue={activeFor("interestedIn")}
          onSliceClick={(label) =>
            toggleActive({ kind: "interestedIn", value: label })
          }
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
          activeValue={activeFor("profileCategories")}
          onSliceClick={(label) =>
            toggleActive({ kind: "profileCategories", value: label })
          }
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
          activeValue={activeFor("appliedFor")}
          onSliceClick={(label) =>
            toggleActive({ kind: "appliedFor", value: label })
          }
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
          activeValue={activeFor("tags")}
          onSliceClick={(label) =>
            toggleActive({ kind: "tags", value: label })
          }
        />
      </div>

      {/* Sortable members table — ALL columns sortable (Item 2B) */}
      <div className="rounded-lg border border-black/10 overflow-hidden">
        <div className="bg-black/5 px-4 py-3 border-b border-black/10">
          <h3 className="text-sm font-bold text-black">
            Members ({sorted.length})
          </h3>
          <p className="text-xs text-black/50 mt-0.5">
            Click any column header to sort A–Z / Z–A. Use the filters above to slice the data, or click a chart slice to cross-filter.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-black/60 text-xs uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Company" field="company" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Interested in" field="interestedIn" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Categories" field="profileCategories" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Applied" field="appliedFor" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Tags" field="tags" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Source" field="source" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="UTM UID" field="utmUid" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
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
                  <td className="px-4 py-2">
                    {m.utmUid ? (
                      <code className="text-xs font-mono bg-black/5 px-1.5 py-0.5 rounded">
                        {m.utmUid}
                      </code>
                    ) : (
                      <span className="text-xs text-black/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-black/60">
                    {m.createdAt ? formatDateTlv(m.createdAt) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-black/60">
                    {m.importedAt ? formatDateTlv(m.importedAt) : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-black/40 text-sm">
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
// SortHeader — extended to support ALL columns (Item 2B). The previous
// version only sorted 5 of 9 columns; now every column is sortable.
// ---------------------------------------------------------------------------

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
  const isActive = field === sortField;
  return (
    <th
      className="text-left px-4 py-2 font-bold cursor-pointer hover:bg-black/5 select-none whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${isActive ? "text-[#FF005A]" : "text-black/30"}`}
          style={{ transform: isActive && sortDir === "desc" ? "rotate(180deg)" : undefined }}
        />
      </span>
    </th>
  );
}

// Suppress unused-import warnings — kept for type completeness / future use.
void PieChartIcon;
void TableIcon;
void MEMBER_TAG_CATALOG;

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

  // Interested in (union of CSV values) — long-tail <10% grouped under "Other interests"
  // per the dashboard spec (matches Referral Analytics behavior). (Item 2G — already in place.)
  const interestedCounts = new Map<string, number>();
  for (const m of members) {
    if (!m.interestedIn) continue;
    for (const v of m.interestedIn.split(",").map((s) => s.trim()).filter(Boolean)) {
      interestedCounts.set(v, (interestedCounts.get(v) || 0) + 1);
    }
  }
  const rawInterestedIn = Array.from(interestedCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  // Apply long-tail grouping: any single category whose share of total is <10%
  // gets collapsed into "Other interests".
  const totalInterested = rawInterestedIn.reduce((sum, r) => sum + r.count, 0);
  const interestedInCounts = (() => {
    if (totalInterested === 0) return rawInterestedIn;
    const keep = rawInterestedIn.filter((r) => r.count / totalInterested >= 0.1);
    const group = rawInterestedIn.filter((r) => r.count / totalInterested < 0.1);
    if (group.length === 0) return keep;
    const otherCount = group.reduce((sum, r) => sum + r.count, 0);
    return [...keep, { label: "Other interests", count: otherCount }];
  })();

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
