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
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Search,
  ArrowUpDown,
  Calendar,
  Filter,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Table as TableIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

        {/* Source split */}
        <ChartCard title="Source split" subtitle="Imported vs self-registered">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.sourceSplit}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => `${entry.label} (${entry.count})`}
                labelLine={false}
              >
                {stats.sourceSplit.map((_, i) => (
                  <Cell key={i} fill={AIS_COLORS[i % AIS_COLORS.length]} />
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
        </ChartCard>

        {/* Interested in */}
        <ChartCard title="I am interested in…" subtitle="Top interests across all members">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.interestedInCounts} layout="vertical" margin={{ left: 20 }}>
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
                {stats.interestedInCounts.map((_, i) => (
                  <Cell key={i} fill={AIS_COLORS[i % AIS_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Profile categories */}
        <ChartCard title="Tell us more about yourself" subtitle="Member self-identification">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.profileCategoriesCounts} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
              <YAxis
                type="category"
                dataKey="label"
                width={180}
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
                {stats.profileCategoriesCounts.map((_, i) => (
                  <Cell key={i} fill={AIS_COLORS[(i + 2) % AIS_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Applied for */}
        <ChartCard title="Applied for" subtitle="Fast pitch vs Presentation/Lecture">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.appliedForCounts}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => `${entry.label} (${entry.count})`}
                labelLine={false}
              >
                {stats.appliedForCounts.map((_, i) => (
                  <Cell key={i} fill={AIS_COLORS[(i + 4) % AIS_COLORS.length]} />
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
        </ChartCard>

        {/* Tag distribution */}
        <ChartCard title="Top tags" subtitle="Most-assigned member tags">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.tagCounts} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#00000060" />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
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
                {stats.tagCounts.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={tagColor(entry.label) || AIS_COLORS[i % AIS_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
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
