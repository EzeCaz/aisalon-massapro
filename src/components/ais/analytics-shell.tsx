"use client";

import * as React from "react";
import {
  PieChart as PieChartIcon,
  Table as TableIcon,
  BarChart3,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  X,
  Filter as FilterIcon,
} from "lucide-react";

/* ============================================================================
 * Unified analytics shell — shared by Referral Analytics, Event Dashboard,
 * and Members Dashboard. Provides:
 *   A. View-mode toggle: Pie / Table / Chart (bar)
 *   B. Sort A-Z / Z-A on every column
 *   C. Per-column filter (text match OR dropdown of distinct values)
 *   D. Master filter: any active column filter narrows the ENTIRE dashboard
 *      (all panels re-compute from the filtered row set, not just the table)
 *   E. UTM columns + UTM filters (just regular columns named utm_*)
 *   F. Style mirrors the existing "dashboard report" filter bar (boxed
 *      <Filter> panel with selects + search + Clear button)
 * ========================================================================== */

export type ViewMode = "table" | "bar" | "pie";

export type ColumnDef<T> = {
  /** Object key to read the cell value from, OR a getter function. */
  key: string;
  label: string;
  /** Getter (overrides key). Useful for computed cells. */
  accessor?: (row: T) => string | number | null | undefined;
  /** Render function for the cell (returns ReactNode). Defaults to plain text. */
  render?: (row: T) => React.ReactNode;
  /** Whether this column is sortable (default true). */
  sortable?: boolean;
  /** Whether this column is filterable (default true). */
  filterable?: boolean;
  /**
   * For pie/bar charts: marks this column as the "category" axis (the
   * dimension being grouped by). At most one column per table should
   * have this set. If none, charts fall back to using the first column.
   */
  isCategory?: boolean;
  /**
   * For pie/bar charts: marks this column as the "value" axis (the
   * metric being plotted). At most one column should have this set.
   * If none, charts fall back to a row count.
   */
  isValue?: boolean;
  /** Hide this column from the table view (still usable as filter/chart axis). */
  hiddenInTable?: boolean;
};

type FilterState = Record<string, string>; // columnKey -> search term

/**
 * Format an ISO date (or Date) as "DD MMM YYYY HH:MM" (TLV).
 * Used for UTM columns + general timestamp rendering.
 */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Group long-tail categories (those representing < threshold% of the total)
 * into a single "Other" bucket. Threshold defaults to 10% per the user spec
 * (G: "On the I am interested in… anything that is longtail less than 10%
 * group them under a common denominator keyword").
 *
 * Example: given 5 categories with counts [50, 30, 8, 5, 2] and threshold 0.1,
 * returns [{label: A, count: 50}, {label: B, count: 30}, {label: Other, count: 15}].
 *
 * `commonDenominator` lets the caller override the "Other" label (e.g.
 * "Other interests" for the interestedIn field).
 */
export function groupLongTail<T extends { label: string; count: number }>(
  rows: T[],
  threshold = 0.1,
  commonDenominator = "Other"
): T[] {
  if (rows.length === 0) return rows;
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return rows;
  const keep: T[] = [];
  const bucket: T[] = [];
  for (const r of rows) {
    if (r.count / total >= threshold) {
      keep.push(r);
    } else {
      bucket.push(r);
    }
  }
  if (bucket.length === 0) return keep;
  const otherCount = bucket.reduce((s, r) => s + r.count, 0);
  // The "Other" row inherits the type T by spreading the first bucket row.
  return [
    ...keep,
    { ...bucket[0], label: commonDenominator, count: otherCount } as T,
  ];
}

/* ------------------------------------------------------------------ */
/* View-mode toggle                                                   */
/* ------------------------------------------------------------------ */

export function ViewModeToggle({
  value,
  onChange,
  allowed = ["table", "bar", "pie"],
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  allowed?: ViewMode[];
}) {
  const opts: { v: ViewMode; label: string; icon: React.ReactNode }[] = [
    { v: "table", label: "Table", icon: <TableIcon className="h-3.5 w-3.5" /> },
    { v: "bar", label: "Chart", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { v: "pie", label: "Pie", icon: <PieChartIcon className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="inline-flex rounded-md border border-black/15 bg-white p-0.5">
      {opts
        .filter((o) => allowed.includes(o.v))
        .map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
              value === o.v
                ? "bg-black text-white"
                : "text-black/60 hover:bg-black/5"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filter bar (matches "dashboard report" style)                      */
/* ------------------------------------------------------------------ */

/**
 * Filter bar — boxed panel with a search input + per-column dropdown
 * filters + Clear button. Mirrors the style used in event-dashboard-client.tsx.
 */
export function AnalyticsFilterBar<T>({
  columns,
  rows,
  filters,
  onFiltersChange,
  globalSearch,
  onGlobalSearchChange,
  resultCount,
  totalCount,
  rightSlot,
}: {
  columns: ColumnDef<T>[];
  rows: T[];
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  globalSearch: string;
  onGlobalSearchChange: (s: string) => void;
  resultCount: number;
  totalCount: number;
  rightSlot?: React.ReactNode;
}) {
  const filterableCols = columns.filter((c) => c.filterable !== false);
  const activeCount = Object.values(filters).filter((v) => v && v !== "ALL").length + (globalSearch ? 1 : 0);

  function clearAll() {
    onFiltersChange({});
    onGlobalSearchChange("");
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <FilterIcon className="h-4 w-4 text-black/40" />
        <h3 className="text-sm font-bold text-black">Filters</h3>
        <span className="text-xs text-black/40 ml-auto">
          {resultCount} of {totalCount} rows
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Global search */}
        <div className="lg:col-span-2">
          <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
            <Search className="inline h-3 w-3 mr-1" />
            Search all columns
          </label>
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder="Type to filter across every column…"
            className="w-full h-9 text-sm border border-black/15 rounded-md px-3 bg-white"
          />
        </div>
        {/* Per-column dropdowns (only for the first 2 filterable cols to keep the bar compact) */}
        {filterableCols.slice(0, 2).map((col) => {
          const distinct = getDistinctValues(rows, col);
          const current = filters[col.key] || "ALL";
          return (
            <div key={col.key}>
              <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-black/40 mb-1">
                {col.label}
              </label>
              <select
                value={current}
                onChange={(e) =>
                  onFiltersChange({ ...filters, [col.key]: e.target.value })
                }
                className="w-full h-9 text-sm border border-black/15 rounded-md px-2 bg-white"
              >
                <option value="ALL">All ({distinct.length})</option>
                {distinct.map(({ value, count }) => (
                  <option key={value} value={value}>
                    {value} ({count})
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {/* Active filter chips + Clear */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {activeCount > 0 && (
          <>
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
              Active:
            </span>
            {globalSearch && (
              <FilterChip
                label={`Search: "${globalSearch}"`}
                onClear={() => onGlobalSearchChange("")}
              />
            )}
            {Object.entries(filters).map(([k, v]) =>
              v && v !== "ALL" ? (
                <FilterChip
                  key={k}
                  label={`${columns.find((c) => c.key === k)?.label || k}: ${v}`}
                  onClear={() => {
                    const next = { ...filters };
                    delete next[k];
                    onFiltersChange(next);
                  }}
                />
              ) : null
            )}
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#FF005A] hover:underline"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          </>
        )}
        {rightSlot && <div className="ml-auto">{rightSlot}</div>}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FF005A]/10 text-[#FF005A] px-2 py-0.5 text-[0.65rem] font-semibold">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="hover:bg-[#FF005A]/20 rounded-full p-0.5"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Sortable + filterable data table                                   */
/* ------------------------------------------------------------------ */

export function AnalyticsDataTable<T>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSortChange,
  emptyMessage = "No rows match the current filters.",
}: {
  columns: ColumnDef<T>[];
  rows: T[];
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSortChange: (key: string, dir: "asc" | "desc") => void;
  emptyMessage?: string;
}) {
  const visibleCols = columns.filter((c) => !c.hiddenInTable);

  function handleSort(key: string) {
    if (sortKey === key) {
      onSortChange(key, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, "asc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/40">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-black/[0.02] border-b border-black/10">
          <tr>
            {visibleCols.map((col) => {
              const isSortable = col.sortable !== false;
              const isActive = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  className={`text-left px-4 py-3 font-bold text-black/70 whitespace-nowrap ${
                    isSortable ? "cursor-pointer hover:bg-black/5" : ""
                  }`}
                  onClick={() => isSortable && handleSort(col.key)}
                >
                  <div className="inline-flex items-center gap-1">
                    {col.label}
                    {isSortable && (
                      <span className="text-black/30">
                        {isActive ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-black/5 last:border-0 hover:bg-black/[0.015]"
            >
              {visibleCols.map((col) => (
                <td key={col.key} className="px-4 py-3 align-top text-black/80">
                  {col.render ? col.render(row) : cellText(row, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pie + Bar chart panels (pure CSS, no chart lib)                    */
/* ------------------------------------------------------------------ */

type ChartRow = { label: string; value: number; color?: string };

const AISALON_PALETTE = [
  "#FF005A",
  "#007E72",
  "#004F98",
  "#FFAC30",
  "#820A7D",
  "#00C2A8",
  "#00E6FF",
  "#D8004D",
];

export function AnalyticsBarChart({
  rows,
  height = 220,
}: {
  rows: ChartRow[];
  height?: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/40">
        No data for the current filters.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="space-y-2" style={{ minHeight: height }}>
        {rows.map((r, i) => {
          const color = r.color || AISALON_PALETTE[i % AISALON_PALETTE.length];
          const pct = (r.value / max) * 100;
          return (
            <div key={r.label} className="flex items-center gap-3">
              <div
                className="text-xs font-semibold text-black/60 w-32 truncate flex-shrink-0"
                title={r.label}
              >
                {r.label}
              </div>
              <div className="flex-1 bg-black/5 rounded h-6 relative overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
                <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white mix-blend-difference">
                  {r.value.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsPieChart({
  rows,
  height = 260,
}: {
  rows: ChartRow[];
  height?: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/40">
        No data for the current filters.
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/40">
        Total is zero — nothing to plot.
      </div>
    );
  }

  // Build the pie slices using conic-gradient. Each slice = its share
  // of 360deg starting from the top (0deg).
  let acc = 0;
  const slices = rows.map((r, i) => {
    const color = r.color || AISALON_PALETTE[i % AISALON_PALETTE.length];
    const start = (acc / total) * 360;
    acc += r.value;
    const end = (acc / total) * 360;
    return { ...r, color, start, end };
  });
  const gradient = slices
    .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
    .join(", ");

  return (
    <div
      className="rounded-lg border border-black/10 bg-white p-4 flex flex-col sm:flex-row items-center gap-6"
      style={{ minHeight: height }}
    >
      <div
        className="rounded-full flex-shrink-0"
        style={{
          width: 200,
          height: 200,
          background: `conic-gradient(${gradient})`,
        }}
      />
      <div className="flex-1 space-y-1.5 w-full">
        {slices.map((s) => {
          const pct = ((s.value / total) * 100).toFixed(1);
          return (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="font-semibold text-black/70 flex-1 truncate" title={s.label}>
                {s.label}
              </span>
              <span className="font-mono text-black/50">{s.value.toLocaleString()}</span>
              <span className="font-mono text-black/40 w-12 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared panel wrapper — gives every analytics section a consistent   |
/* header (title + view-mode toggle + count badge)                    */
/* ------------------------------------------------------------------ */

export function AnalyticsPanel({
  title,
  subtitle,
  count,
  viewMode,
  onViewModeChange,
  allowViewModes = ["table", "bar", "pie"],
  children,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  allowViewModes?: ViewMode[];
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h3 className="text-base font-extrabold text-black flex items-center gap-2">
            {title}
            {typeof count === "number" && (
              <span className="inline-flex items-center rounded-full bg-black/5 text-black/60 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider">
                {count}
              </span>
            )}
          </h3>
          {subtitle && (
            <p className="text-xs text-black/50 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {rightSlot}
          <ViewModeToggle
            value={viewMode}
            onChange={onViewModeChange}
            allowed={allowViewModes}
          />
        </div>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function cellText<T>(row: T, col: ColumnDef<T>): string {
  const v = col.accessor ? col.accessor(row) : (row as Record<string, unknown>)[col.key];
  if (v === null || v === undefined) return "—";
  return String(v);
}

export function getDistinctValues<T>(rows: T[], col: ColumnDef<T>): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = col.accessor ? col.accessor(r) : (r as Record<string, unknown>)[col.key];
    const key = v === null || v === undefined ? "—" : String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Apply the master filter pipeline to a row set:
 *   1. Per-column filters (exact match if value is in distinct set, else substring)
 *   2. Global search (substring match across ALL columns)
 *   3. Sort by sortKey + sortDir
 *
 * Returns the filtered + sorted rows. This is the heart of the "master
 * filter that updates the entire dashboard" behavior (point D in the spec).
 */
export function applyFilters<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  filters: FilterState,
  globalSearch: string,
  sortKey: string | null,
  sortDir: "asc" | "desc"
): T[] {
  let out = rows;

  // Per-column filters
  for (const [k, v] of Object.entries(filters)) {
    if (!v || v === "ALL") continue;
    const col = columns.find((c) => c.key === k);
    if (!col) continue;
    out = out.filter((r) => {
      const cellV = col.accessor ? col.accessor(r) : (r as Record<string, unknown>)[k];
      const s = cellV === null || cellV === undefined ? "—" : String(cellV);
      return s === v || s.toLowerCase().includes(v.toLowerCase());
    });
  }

  // Global search
  if (globalSearch.trim()) {
    const q = globalSearch.toLowerCase();
    out = out.filter((r) =>
      columns.some((col) => {
        const cellV = col.accessor ? col.accessor(r) : (r as Record<string, unknown>)[col.key];
        return cellV !== null && cellV !== undefined && String(cellV).toLowerCase().includes(q);
      })
    );
  }

  // Sort
  if (sortKey) {
    const col = columns.find((c) => c.key === sortKey);
    if (col) {
      out = [...out].sort((a, b) => {
        const av = col.accessor ? col.accessor(a) : (a as Record<string, unknown>)[sortKey];
        const bv = col.accessor ? col.accessor(b) : (b as Record<string, unknown>)[sortKey];
        // Numbers compare numerically; everything else as strings.
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        const as = av === null || av === undefined ? "" : String(av);
        const bs = bv === null || bv === undefined ? "" : String(bv);
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Hook: useAnalyticsState — centralizes view-mode + sort + filter    |
/* state for one analytics panel. Pass the initial rows + columns.    */
/* ------------------------------------------------------------------ */

export function useAnalyticsState<T>(initialRows: T[]) {
  const [rows] = React.useState(initialRows); // we don't mutate rows externally
  const [viewMode, setViewMode] = React.useState<ViewMode>("table");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [filters, setFilters] = React.useState<FilterState>({});
  const [globalSearch, setGlobalSearch] = React.useState("");

  const setSort = React.useCallback((key: string, dir: "asc" | "desc") => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  return {
    rows,
    viewMode,
    setViewMode,
    sortKey,
    sortDir,
    setSort,
    filters,
    setFilters,
    globalSearch,
    setGlobalSearch,
  };
}
