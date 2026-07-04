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
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ToggleableChartCard,
  ChartTypeButton,
  useChartTypeState,
  type ChartType,
} from "@/components/admin/toggleable-chart-card";
import { MEMBER_TAG_CATALOG, tagColor } from "@/lib/tags";
import {
  ActiveSelectionChip,
  type ActiveSelection,
  toggleActiveSelection,
} from "@/components/ais/analytics-shell";

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
  utmUid: string | null;
};

type ReferringUser = {
  id: string;
  email: string;
  name: string | null;
  utmUid: string | null;
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
  approvedAt: string | null;
  attendedAt: string | null;
  noShow: boolean;
  event: RsvpEvent;
  user: RsvpUser | null;
  referredBy: ReferringUser | null;
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

// Dimension labels for the active-selection chip
const DIMENSION_LABELS: Record<string, string> = {
  event: "Event",
  status: "Status",
  codeState: "Code state",
  source: "Source",
  company: "Company",
  interestedIn: "Interested in",
  profileCategories: "Category",
  appliedFor: "Applied for",
  role: "Role",
  utmUid: "Referrer UTM UID",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventDashboardClient({ events, rsvps, isSuperAdmin }: Props) {
  // ---- Per-column filters (Item 2C) ----
  const [eventFilter, setEventFilter] = React.useState<string>("ALL");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = React.useState<string>("ALL");
  const [companyFilter, setCompanyFilter] = React.useState<string>("ALL");
  const [interestedFilter, setInterestedFilter] = React.useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("ALL");
  const [appliedFilter, setAppliedFilter] = React.useState<string>("ALL");
  const [roleFilter, setRoleFilter] = React.useState<string>("ALL");
  const [utmUidFilter, setUtmUidFilter] = React.useState<string>("ALL");

  // ---- Cross-filter active selection (Item 2D) ----
  const [active, setActive] = React.useState<ActiveSelection>(null);

  const toggleActive = React.useCallback((sel: ActiveSelection) => {
    setActive((prev) => toggleActiveSelection(prev, sel));
  }, []);

  // ---- Chart type state ----
  const { chartTypes, setChartType, setAllChartTypes, globalActive } =
    useChartTypeState(CHART_IDS, DEFAULT_CHART_TYPES);

  // ---- Distinct values for per-column dropdowns ----
  const distinct = React.useMemo(() => {
    const sources = new Set<string>();
    const companies = new Set<string>();
    const interested = new Set<string>();
    const categories = new Set<string>();
    const appliedFor = new Set<string>();
    const roles = new Set<string>();
    const utmUids = new Set<string>();
    for (const r of rsvps) {
      sources.add(r.source);
      if (r.user?.company) companies.add(r.user.company.trim());
      if (r.user?.interestedIn)
        for (const v of r.user.interestedIn.split(",").map((s) => s.trim()).filter(Boolean))
          interested.add(v);
      if (r.user?.profileCategories)
        for (const v of r.user.profileCategories.split(",").map((s) => s.trim()).filter(Boolean))
          categories.add(v);
      if (r.user?.appliedFor)
        for (const v of r.user.appliedFor.split(/[/,]/).map((s) => s.trim()).filter(Boolean))
          appliedFor.add(v);
      if (r.user) roles.add(r.user.role || "MEMBER");
      if (r.referredBy?.utmUid) utmUids.add(r.referredBy.utmUid);
    }
    return {
      sources: Array.from(sources).sort(),
      companies: Array.from(companies).sort(),
      interested: Array.from(interested).sort(),
      categories: Array.from(categories).sort(),
      appliedFor: Array.from(appliedFor).sort(),
      roles: Array.from(roles).sort(),
      utmUids: Array.from(utmUids).sort(),
    };
  }, [rsvps]);

  // ---- Derived data — apply ALL filters (per-column + cross-filter) ----
  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return rsvps.filter((r) => {
      const matchEvent = eventFilter === "ALL" || r.eventId === eventFilter;
      const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
      const matchSource = sourceFilter === "ALL" || r.source === sourceFilter;
      const matchCompany =
        companyFilter === "ALL" ||
        (r.user?.company || "").trim() === companyFilter;
      const matchInterested =
        interestedFilter === "ALL" ||
        (r.user?.interestedIn || "")
          .split(",")
          .map((s) => s.trim())
          .includes(interestedFilter);
      const matchCategory =
        categoryFilter === "ALL" ||
        (r.user?.profileCategories || "")
          .split(",")
          .map((s) => s.trim())
          .includes(categoryFilter);
      const matchApplied =
        appliedFilter === "ALL" || r.user?.appliedFor === appliedFilter;
      const matchRole =
        roleFilter === "ALL" || (r.user?.role || "MEMBER") === roleFilter;
      const matchUtmUid =
        utmUidFilter === "ALL" || r.referredBy?.utmUid === utmUidFilter;
      const matchSearch =
        !q ||
        (r.name || "").toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.user?.company || "").toLowerCase().includes(q) ||
        (r.user?.interestedIn || "").toLowerCase().includes(q) ||
        (r.referredBy?.utmUid || "").toLowerCase().includes(q);

      // Cross-filter active selection (Item 2D)
      let matchActive = true;
      if (active) {
        if (active.kind === "event") {
          matchActive = r.event.title === active.value;
        } else if (active.kind === "status") {
          matchActive = r.status === active.value;
        } else if (active.kind === "codeState") {
          if (active.value === "No code") matchActive = !r.checkInCode;
          else if (active.value === "Code generated")
            matchActive = !!r.checkInCode && !r.doorCheckedAt;
          else if (active.value === "Used at door") matchActive = !!r.doorCheckedAt;
        } else if (active.kind === "source") {
          matchActive = r.source === active.value;
        } else if (active.kind === "company") {
          matchActive = (r.user?.company || "").trim() === active.value;
        } else if (active.kind === "interestedIn") {
          matchActive = (r.user?.interestedIn || "")
            .split(",")
            .map((s) => s.trim())
            .includes(active.value);
        } else if (active.kind === "profileCategories") {
          matchActive = (r.user?.profileCategories || "")
            .split(",")
            .map((s) => s.trim())
            .includes(active.value);
        } else if (active.kind === "appliedFor") {
          matchActive = r.user?.appliedFor === active.value;
        } else if (active.kind === "role") {
          matchActive = (r.user?.role || "MEMBER") === active.value;
        } else if (active.kind === "utmUid") {
          matchActive = r.referredBy?.utmUid === active.value;
        }
      }

      return (
        matchEvent &&
        matchStatus &&
        matchSource &&
        matchCompany &&
        matchInterested &&
        matchCategory &&
        matchApplied &&
        matchRole &&
        matchUtmUid &&
        matchSearch &&
        matchActive
      );
    });
  }, [
    rsvps,
    eventFilter,
    statusFilter,
    sourceFilter,
    companyFilter,
    interestedFilter,
    categoryFilter,
    appliedFilter,
    roleFilter,
    utmUidFilter,
    search,
    active,
  ]);

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
        "Referrer Name",
        "Referrer Email",
        "Referrer UTM UID",
        "Check-in Code",
        "Code Generated At",
        "Door Check-in At",
        "Attended At",
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
        r.referredBy?.name || "",
        r.referredBy?.email || "",
        r.referredBy?.utmUid || "",
        r.checkInCode || "",
        r.checkedInAt ? new Date(r.checkedInAt).toISOString() : "",
        r.doorCheckedAt ? new Date(r.doorCheckedAt).toISOString() : "",
        r.attendedAt ? new Date(r.attendedAt).toISOString() : "",
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

  const hasFilters =
    eventFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    sourceFilter !== "ALL" ||
    companyFilter !== "ALL" ||
    interestedFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    appliedFilter !== "ALL" ||
    roleFilter !== "ALL" ||
    utmUidFilter !== "ALL" ||
    !!search ||
    !!active;

  function clearAll() {
    setEventFilter("ALL");
    setStatusFilter("ALL");
    setSourceFilter("ALL");
    setCompanyFilter("ALL");
    setInterestedFilter("ALL");
    setCategoryFilter("ALL");
    setAppliedFilter("ALL");
    setRoleFilter("ALL");
    setUtmUidFilter("ALL");
    setSearch("");
    setActive(null);
  }

  // Per-chart active-value resolver.
  const activeFor = (kind: string) =>
    active && active.kind === kind ? active.value : null;

  return (
    <div className="space-y-8">
      {/* Top stats — registrants, codes generated, door check-ins, attended, conversion rate */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
          label="Attended"
          value={stats.attended}
          accent="#004F98"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Conversion rate"
          value={stats.total > 0 ? `${((stats.attended / stats.total) * 100).toFixed(1)}%` : "—"}
          accent="#00E6FF"
          icon={<BarChart3 className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Filters — dashboard-report canonical style (Item 2F) */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-black/40" />
          <h3 className="text-sm font-bold text-black">Filters</h3>
          <span className="text-xs text-black/40 ml-auto">
            {filtered.length} of {rsvps.length} registrants
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
              placeholder="Name, email, company, referrer UTM UID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          {/* Per-column dropdown: Event */}
          <div>
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
          {/* Per-column dropdown: Status */}
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
          {/* Per-column dropdown: Source */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Source
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">All sources ({distinct.sources.length})</option>
              {distinct.sources.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: Company */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Company
            </label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any ({distinct.companies.length})</option>
              {distinct.companies.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: Interested in */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Interested in
            </label>
            <select
              value={interestedFilter}
              onChange={(e) => setInterestedFilter(e.target.value)}
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
          {/* Per-column dropdown: Profile categories */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Profile categories
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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
          {/* Per-column dropdown: Applied for */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Applied for
            </label>
            <select
              value={appliedFilter}
              onChange={(e) => setAppliedFilter(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any ({distinct.appliedFor.length})</option>
              {distinct.appliedFor.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: Role */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Member role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
            >
              <option value="ALL">Any ({distinct.roles.length})</option>
              {distinct.roles.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* Per-column dropdown: Referrer UTM UID (Item 2E) */}
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
              Referrer UTM UID
            </label>
            <select
              value={utmUidFilter}
              onChange={(e) => setUtmUidFilter(e.target.value)}
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

      {/* Charts grid — every chart's slices/bars/rows are clickable (Item 2D) */}
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
            activeValue={activeFor("event")}
            onSliceClick={(label) =>
              toggleActive({ kind: "event", value: label })
            }
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
          activeValue={activeFor("status")}
          onSliceClick={(label) =>
            toggleActive({ kind: "status", value: label })
          }
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
          activeValue={activeFor("codeState")}
          onSliceClick={(label) =>
            toggleActive({ kind: "codeState", value: label })
          }
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
          activeValue={activeFor("source")}
          onSliceClick={(label) =>
            toggleActive({ kind: "source", value: label })
          }
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
          activeValue={activeFor("company")}
          onSliceClick={(label) =>
            toggleActive({ kind: "company", value: label })
          }
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
          activeValue={activeFor("interestedIn")}
          onSliceClick={(label) =>
            toggleActive({ kind: "interestedIn", value: label })
          }
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
          title="Member role"
          subtitle="Role of the linked user at RSVP time"
          chartType={chartTypes.roleSplit}
          onTypeChange={(t) => setChartType("roleSplit", t)}
          data={stats.roleSplit}
          colorOffset={5}
          orientation="vertical"
          height={240}
          activeValue={activeFor("role")}
          onSliceClick={(label) =>
            toggleActive({ kind: "role", value: label })
          }
        />
      </div>

      {/* Registrants table — ALL columns sortable (Item 2B), with UTM UID column (Item 2E) */}
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

// ---------------------------------------------------------------------------
// RegistrantsTable — every column is now sortable (Item 2B) and there's a
// new "UTM UID" column showing the referrer's utm_uid (Item 2E).
// ---------------------------------------------------------------------------

type SortField =
  | "name"
  | "event"
  | "company"
  | "interestedIn"
  | "status"
  | "checkInCode"
  | "doorCheckedAt"
  | "attendedAt"
  | "createdAt"
  | "utmUid";

function RegistrantsTable({ rsvps }: { rsvps: Rsvp[] }) {
  const [sortField, setSortField] = React.useState<SortField>("createdAt");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  function toggleSort(field: SortField) {
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
        case "interestedIn":
          av = (a.user?.interestedIn || "").toLowerCase();
          bv = (b.user?.interestedIn || "").toLowerCase();
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "checkInCode":
          av = a.checkInCode || "";
          bv = b.checkInCode || "";
          break;
        case "doorCheckedAt":
          av = a.doorCheckedAt ? new Date(a.doorCheckedAt).getTime() : 0;
          bv = b.doorCheckedAt ? new Date(b.doorCheckedAt).getTime() : 0;
          break;
        case "attendedAt":
          av = a.attendedAt ? new Date(a.attendedAt).getTime() : 0;
          bv = b.attendedAt ? new Date(b.attendedAt).getTime() : 0;
          break;
        case "utmUid":
          av = (a.referredBy?.utmUid || "").toLowerCase();
          bv = (b.referredBy?.utmUid || "").toLowerCase();
          break;
        case "createdAt":
          av = new Date(a.createdAt).getTime();
          bv = new Date(b.createdAt).getTime();
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
          Click any column header to sort A–Z / Z–A. Use the filters above to slice the data, or click a chart slice to cross-filter.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-black/60 text-xs uppercase tracking-wider sticky top-0 z-10">
            <tr>
              <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Event" field="event" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Company" field="company" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Interested in" field="interestedIn" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Code" field="checkInCode" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Door check-in" field="doorCheckedAt" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Attended" field="attendedAt" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Referrer UTM UID" field="utmUid" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Registered" field="createdAt" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
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
                  {r.attendedAt ? (
                    <span className="inline-flex items-center gap-1 text-[#004F98] font-semibold">
                      <CheckCircle2 className="h-3 w-3" />
                      {new Date(r.attendedAt).toLocaleString()}
                    </span>
                  ) : r.noShow ? (
                    <span className="text-xs text-red-600 font-semibold">No-show</span>
                  ) : (
                    <span className="text-black/30 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {r.referredBy?.utmUid ? (
                    <code className="text-xs font-mono bg-black/5 px-1.5 py-0.5 rounded">
                      {r.referredBy.utmUid}
                    </code>
                  ) : (
                    <span className="text-xs text-black/30 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-black/60">
                  {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-black/40 text-sm">
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
  field: SortField;
  sortField: SortField;
  sortDir: "asc" | "desc";
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
        <span className={`text-[0.65rem] ${isActive ? "text-[#FF005A]" : "text-black/30"}`}>
          {isActive ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
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
  // "Attended" — prefer the explicit post-event attendedAt field; fall
  // back to the door signal (co-host approved AND door-staff scanned).
  const attended = rsvps.filter(
    (r) => r.attendedAt != null || (!!r.doorCheckedAt && !!r.approvedAt),
  ).length;
  const noShow = rsvps.filter((r) => r.noShow).length;

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
    attended,
    noShow,
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
