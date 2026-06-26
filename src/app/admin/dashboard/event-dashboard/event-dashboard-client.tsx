"use client";

import * as React from "react";
import {
  Search,
  Filter,
  Download,
  BarChart3,
  CalendarDays,
  Ticket,
  DoorOpen,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ToggleableChartCard,
  ChartTypeToggleGroup,
  ChartTypeButton,
  useChartTypeState,
  type ChartType,
} from "@/components/admin/toggleable-chart-card";
import { MEMBER_TAG_CATALOG, tagColor } from "@/lib/tags";

// ---------------------------------------------------------------------------
// Types — mirror the props passed from the server page.
// ---------------------------------------------------------------------------

type RsvpEvent = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string;
};

type RsvpUser = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  interestedIn: string | null;
  profileCategories: string | null;
  appliedFor: string | null;
  role: string;
  importSource: string | null;
  mobile: string | null;
  bio: string | null;
};

type Rsvp = {
  id: string;
  eventId: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  checkInCode: string | null;
  checkedInAt: string | null;
  doorCheckedAt: string | null;
  doorCheckedBy: string | null;
  event: RsvpEvent;
  user: RsvpUser | null;
};

type EventOption = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  city: string | null;
  _count: { rsvps: number; speakers: number; images: number };
};

type Props = {
  events: EventOption[];
  rsvps: Rsvp[];
  isSuperAdmin: boolean;
};

// Chart IDs — used by the chart-type state hook.
const CHART_IDS = [
  "eventSplit", // registrants per event (only in "all events" mode)
  "statusSplit", // GOING / MAYBE / NOT_GOING
  "codeState", // no code / code not used / code used at door
  "sourceSplit", // RSVP source (MANUAL / EVENT_PAGE / IMPORT)
  "company", // top companies among registrants
  "interestedIn", // interests among registrants
  "profileCategories", // self-identification
  "appliedFor", // Fast pitch / Presentation
  "roleSplit", // member role at RSVP time
] as const;

type ChartId = (typeof CHART_IDS)[number];

const DEFAULT_CHART_TYPES: Record<ChartId, ChartType> = {
  eventSplit: "bar",
  statusSplit: "pie",
  codeState: "pie",
  sourceSplit: "pie",
  company: "bar",
  interestedIn: "bar",
  profileCategories: "bar",
  appliedFor: "pie",
  roleSplit: "pie",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventDashboardClient({ events, rsvps, isSuperAdmin }: Props) {
  // ---- Filters ----
  const [eventFilter, setEventFilter] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  // ---- Chart type state ----
  const { chartTypes, setChartType, setAllChartTypes, globalActive } =
    useChartTypeState(CHART_IDS, DEFAULT_CHART_TYPES);

  // ---- Derived data ----
  // Filter RSVPs by the selected event + status + search query.
  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return rsvps.filter((r) => {
      const matchEvent = eventFilter === "ALL" || r.eventId === eventFilter;
      const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
      const matchSearch =
        !q ||
        (r.name || "").toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.user?.company || "").toLowerCase().includes(q) ||
        (r.user?.interestedIn || "").toLowerCase().includes(q);
      return matchEvent && matchStatus && matchSearch;
    });
  }, [rsvps, eventFilter, statusFilter, search]);

  // ---- Stats ----
  const stats = React.useMemo(() => computeStats(filtered, events), [filtered, events]);

  // ---- CSV export ----
  function exportCsv() {
    const rows = [
      [
        "Event",
        "Name",
        "Email",
        "Company",
        "Mobile",
        "Status",
        "Source",
        "Interested In",
        "Profile Categories",
        "Applied For",
        "Role",
        "Check-in Code",
        "Code Generated At",
        "Door Check-in At",
        "Registered At",
      ],
      ...filtered.map((r) => [
        r.event.title,
        r.name || "",
        r.email,
        r.user?.company || "",
        r.user?.mobile || "",
        r.status,
        r.source,
        r.user?.interestedIn || "",
        r.user?.profileCategories || "",
        r.user?.appliedFor || "",
        r.user?.role || "",
        r.checkInCode || "",
        r.checkedInAt ? new Date(r.checkedInAt).toISOString() : "",
        r.doorCheckedAt ? new Date(r.doorCheckedAt).toISOString() : "",
        new Date(r.createdAt).toISOString(),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const showEventSplit = eventFilter === "ALL";

  return (
    <div className="space-y-8">
      {/* Top stats — registrants, codes generated, door check-ins, conversion rate */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Registrants"
          value={stats.total}
          accent="#FF005A"
          icon={<Users className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Codes generated"
          value={stats.codesGenerated}
          accent="#820A7D"
          icon={<Ticket className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Checked in at door"
          value={stats.doorCheckedIn}
          accent="#007E72"
          icon={<DoorOpen className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Conversion rate"
          value={stats.total > 0 ? `${((stats.doorCheckedIn / stats.total) * 100).toFixed(1)}%` : "—"}
          accent="#00E6FF"
          icon={<BarChart3 className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-black/40" />
          <h3 className="text-sm font-bold text-black">Filters</h3>
          <span className="text-xs text-black/40 ml-auto">
            {filtered.length} of {rsvps.length} registrants
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              <CalendarDays className="inline h-3 w-3 mr-1" />
              Event
            </label>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">All events ({rsvps.length} registrants)</option>
              {events.map((ev) => {
                const count = rsvps.filter((r) => r.eventId === ev.id).length;
                return (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {new Date(ev.startsAt).toLocaleDateString()} ({count})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">All statuses</option>
              <option value="GOING">Going</option>
              <option value="MAYBE">Maybe</option>
              <option value="NOT_GOING">Not going</option>
            </select>
          </div>
          <div>
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
          <div className="flex items-end justify-end lg:col-span-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setEventFilter("ALL");
                  setStatusFilter("ALL");
                  setSearch("");
                }}
              >
                Clear filters
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
            </div>
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
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            label="Pie"
          />
          <ChartTypeButton
            active={globalActive === "table"}
            onClick={() => setAllChartTypes("table")}
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            label="Table"
          />
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {showEventSplit && (
          <ToggleableChartCard
            title="Registrants per event"
            subtitle={`${stats.eventSplit.length} events`}
            chartType={chartTypes.eventSplit}
            onTypeChange={(t) => setChartType("eventSplit", t)}
            data={stats.eventSplit}
            colorOffset={0}
            orientation="horizontal"
            height={260}
          />
        )}
        <ToggleableChartCard
          title="RSVP status"
          subtitle="Going / Maybe / Not going"
          chartType={chartTypes.statusSplit}
          onTypeChange={(t) => setChartType("statusSplit", t)}
          data={stats.statusSplit}
          colorOffset={0}
          orientation="vertical"
          height={240}
        />
        <ToggleableChartCard
          title="Check-in code state"
          subtitle="No code · Generated · Used at door"
          chartType={chartTypes.codeState}
          onTypeChange={(t) => setChartType("codeState", t)}
          data={stats.codeState}
          colorOffset={2}
          orientation="vertical"
          height={240}
        />
        <ToggleableChartCard
          title="RSVP source"
          subtitle="Manual / Event page / Import"
          chartType={chartTypes.sourceSplit}
          onTypeChange={(t) => setChartType("sourceSplit", t)}
          data={stats.sourceSplit}
          colorOffset={3}
          orientation="vertical"
          height={240}
        />
        <ToggleableChartCard
          title="Top companies"
          subtitle="Among registrants with a linked member profile"
          chartType={chartTypes.company}
          onTypeChange={(t) => setChartType("company", t)}
          data={stats.companyCounts}
          colorOffset={4}
          orientation="horizontal"
          height={260}
        />
        <ToggleableChartCard
          title="Interested in"
          subtitle="Member interests among registrants"
          chartType={chartTypes.interestedIn}
          onTypeChange={(t) => setChartType("interestedIn", t)}
          data={stats.interestedInCounts}
          colorOffset={0}
          orientation="horizontal"
          height={260}
        />
        <ToggleableChartCard
          title="Profile categories"
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
          title="Member role"
          subtitle="Role of the linked user at RSVP time"
          chartType={chartTypes.roleSplit}
          onTypeChange={(t) => setChartType("roleSplit", t)}
          data={stats.roleSplit}
          colorOffset={5}
          orientation="vertical"
          height={240}
        />
      </div>

      {/* Registrants table — full data, sortable */}
      <RegistrantsTable rsvps={filtered} />
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
  icon,
}: {
  label: string;
  value: number | string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40 inline-flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-3xl font-extrabold text-black tabular-nums">{value}</div>
    </div>
  );
}

function RegistrantsTable({ rsvps }: { rsvps: Rsvp[] }) {
  const [sortField, setSortField] = React.useState<
    "name" | "event" | "company" | "createdAt" | "doorCheckedAt"
  >("createdAt");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  function toggleSort(field: typeof sortField) {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = React.useMemo(() => {
    const arr = [...rsvps];
    arr.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortField) {
        case "name":
          av = (a.name || a.email).toLowerCase();
          bv = (b.name || b.email).toLowerCase();
          break;
        case "event":
          av = a.event.title.toLowerCase();
          bv = b.event.title.toLowerCase();
          break;
        case "company":
          av = (a.user?.company || "").toLowerCase();
          bv = (b.user?.company || "").toLowerCase();
          break;
        case "createdAt":
          av = new Date(a.createdAt).getTime();
          bv = new Date(b.createdAt).getTime();
          break;
        case "doorCheckedAt":
          av = a.doorCheckedAt ? new Date(a.doorCheckedAt).getTime() : 0;
          bv = b.doorCheckedAt ? new Date(b.doorCheckedAt).getTime() : 0;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rsvps, sortField, sortDir]);

  return (
    <div className="rounded-lg border border-black/10 overflow-hidden">
      <div className="bg-black/5 px-4 py-3 border-b border-black/10">
        <h3 className="text-sm font-bold text-black">
          Registrants ({sorted.length})
        </h3>
        <p className="text-xs text-black/50 mt-0.5">
          Click a column header to sort. Use the filters above to slice the data.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-black/60 text-xs uppercase tracking-wider sticky top-0 z-10">
            <tr>
              <SortHeader
                label="Name"
                field="name"
                sortField={sortField}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Event"
                field="event"
                sortField={sortField}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Company"
                field="company"
                sortField={sortField}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <th className="text-left px-4 py-2 font-bold">Interested in</th>
              <th className="text-left px-4 py-2 font-bold">Status</th>
              <th className="text-left px-4 py-2 font-bold">Code</th>
              <SortHeader
                label="Door check-in"
                field="doorCheckedAt"
                sortField={sortField}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Registered"
                field="createdAt"
                sortField={sortField}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                <td className="px-4 py-2">
                  <div className="font-semibold text-black truncate max-w-[200px]">
                    {r.name || r.email.split("@")[0]}
                  </div>
                  <div className="text-xs text-black/50 truncate max-w-[200px]">{r.email}</div>
                </td>
                <td className="px-4 py-2 text-black/70 truncate max-w-[160px]">
                  {r.event.title}
                </td>
                <td className="px-4 py-2 text-black/70 truncate max-w-[140px]">
                  {r.user?.company || "—"}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {(r.user?.interestedIn || "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 2)
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
                  <span
                    className={`text-[0.65rem] font-semibold px-1.5 py-0.5 rounded ${
                      r.status === "GOING"
                        ? "bg-emerald-50 text-emerald-700"
                        : r.status === "MAYBE"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {r.checkInCode ? (
                    <code className="font-mono font-bold text-xs text-black bg-[#FF005A]/5 px-1.5 py-0.5 rounded">
                      {r.checkInCode}
                    </code>
                  ) : (
                    <span className="text-xs text-black/30 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-black/60">
                  {r.doorCheckedAt ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <DoorOpen className="h-3 w-3" />
                      {new Date(r.doorCheckedAt).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-black/30 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-black/60">
                  {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-black/40 text-sm">
                  No registrants match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > 100 && (
        <div className="bg-black/[0.02] px-4 py-2 text-xs text-black/50 text-center border-t border-black/10">
          Showing first 100 of {sorted.length} registrants. Use filters to narrow down, or click Export CSV to download all.
        </div>
      )}
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
  field: "name" | "event" | "company" | "createdAt" | "doorCheckedAt";
  sortField: string;
  sortDir: "asc" | "desc";
  onSort: (f: "name" | "event" | "company" | "createdAt" | "doorCheckedAt") => void;
}) {
  const active = field === sortField;
  return (
    <th
      className="text-left px-4 py-2 font-bold cursor-pointer hover:bg-black/5 select-none"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[0.65rem] ${active ? "text-[#FF005A]" : "text-black/30"}`}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

function computeStats(rsvps: Rsvp[], events: EventOption[]) {
  const total = rsvps.length;
  const codesGenerated = rsvps.filter((r) => !!r.checkInCode).length;
  const doorCheckedIn = rsvps.filter((r) => !!r.doorCheckedAt).length;

  // Registrants per event (only used in "all events" mode)
  const byEvent = new Map<string, number>();
  for (const r of rsvps) {
    byEvent.set(r.event.title, (byEvent.get(r.event.title) || 0) + 1);
  }
  const eventSplit = Array.from(byEvent.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // RSVP status
  const statusMap = new Map<string, number>();
  for (const r of rsvps) {
    statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1);
  }
  const statusSplit = Array.from(statusMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Check-in code state: No code / Generated / Used at door
  const noCode = rsvps.filter((r) => !r.checkInCode).length;
  const codeNotUsed = rsvps.filter((r) => r.checkInCode && !r.doorCheckedAt).length;
  const codeUsed = rsvps.filter((r) => r.doorCheckedAt).length;
  const codeState = [
    { label: "No code", count: noCode },
    { label: "Code generated", count: codeNotUsed },
    { label: "Used at door", count: codeUsed },
  ].filter((s) => s.count > 0);

  // RSVP source
  const sourceMap = new Map<string, number>();
  for (const r of rsvps) {
    sourceMap.set(r.source, (sourceMap.get(r.source) || 0) + 1);
  }
  const sourceSplit = Array.from(sourceMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Company — only count RSVPs with a linked user that has a company
  const companyMap = new Map<string, number>();
  for (const r of rsvps) {
    if (!r.user?.company) continue;
    const c = r.user.company.trim();
    if (!c) continue;
    companyMap.set(c, (companyMap.get(c) || 0) + 1);
  }
  const companyCounts = Array.from(companyMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Interested in — comma-separated values union
  const interestedMap = new Map<string, number>();
  for (const r of rsvps) {
    if (!r.user?.interestedIn) continue;
    for (const v of r.user.interestedIn.split(",").map((s) => s.trim()).filter(Boolean)) {
      interestedMap.set(v, (interestedMap.get(v) || 0) + 1);
    }
  }
  const interestedInCounts = Array.from(interestedMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Profile categories
  const catMap = new Map<string, number>();
  for (const r of rsvps) {
    if (!r.user?.profileCategories) continue;
    for (const v of r.user.profileCategories.split(",").map((s) => s.trim()).filter(Boolean)) {
      catMap.set(v, (catMap.get(v) || 0) + 1);
    }
  }
  const profileCategoriesCounts = Array.from(catMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Applied for
  const appliedMap = new Map<string, number>();
  for (const r of rsvps) {
    if (!r.user?.appliedFor) continue;
    for (const v of r.user.appliedFor.split(/[/,]/).map((s) => s.trim()).filter(Boolean)) {
      appliedMap.set(v, (appliedMap.get(v) || 0) + 1);
    }
  }
  const appliedForCounts = Array.from(appliedMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Member role
  const roleMap = new Map<string, number>();
  for (const r of rsvps) {
    if (!r.user) continue;
    const role = r.user.role || "MEMBER";
    roleMap.set(role, (roleMap.get(role) || 0) + 1);
  }
  const roleSplit = Array.from(roleMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    codesGenerated,
    doorCheckedIn,
    eventSplit,
    statusSplit,
    codeState,
    sourceSplit,
    companyCounts,
    interestedInCounts,
    profileCategoriesCounts,
    appliedForCounts,
    roleSplit,
  };
}

// Suppress unused-import warnings — kept for type completeness in case
// future chart variations need them.
void tagColor;
void MEMBER_TAG_CATALOG;
void ChartTypeToggleGroup;
