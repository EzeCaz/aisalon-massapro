"use client";

import * as React from "react";
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
  BarChart3,
  PieChart as PieChartIcon,
  Table as TableIcon,
} from "lucide-react";
import { tagColor } from "@/lib/tags";

/**
 * ToggleableChartCard — chart card with a 3-button segmented control in the
 * header that switches the body between Bar / Pie / Table views. All three
 * views render the SAME underlying data (an array of { label, count } rows);
 * they're just three different visual representations of it.
 *
 * Props:
 *   - title, subtitle: header text
 *   - chartType: current render mode
 *   - onTypeChange: callback when the admin picks a different mode
 *   - data: { label, count }[] — the rows to visualize
 *   - colorOffset: rotate the AIS color palette so adjacent charts don't
 *     start on the same color
 *   - orientation: "horizontal" = horizontal bar chart (good for long
 *     category labels like "I am interested in…"); "vertical" = vertical
 *     bar chart (good for timeseries / few categories like "Source split")
 *   - height: pixel height for the chart canvas (table mode grows beyond
 *     this if there are many rows, up to a max of height+120)
 *   - useTagColors: if true, use the tag-catalog colors (tagColor()) for
 *     each row instead of the AIS palette — used by the Top tags chart
 *
 * Extracted from src/app/admin/dashboard/member-dashboard.tsx so the same
 * chart component can be reused on the Event Dashboard tab.
 */

export type ChartType = "bar" | "pie" | "table";

export type ChartRow = { label: string; count: number };

// AIS brand palette for charts
export const AIS_COLORS = [
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

export function ToggleableChartCard({
  title,
  subtitle,
  chartType,
  onTypeChange,
  data,
  colorOffset = 0,
  orientation = "vertical",
  height = 240,
  useTagColors = false,
  activeValue,
  onSliceClick,
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
  /**
   * Cross-filtering: the currently active slice value. When set, non-active
   * slices/bars/rows render at opacity 0.4. Set to null/undefined to disable.
   */
  activeValue?: string | null;
  /**
   * Cross-filtering: when provided, slices/bars/rows become clickable —
   * clicking sets the active selection to that label.
   */
  onSliceClick?: (label: string) => void;
}) {
  const colorFor = (label: string, i: number) =>
    useTagColors
      ? tagColor(label) || AIS_COLORS[(i + colorOffset) % AIS_COLORS.length]
      : AIS_COLORS[(i + colorOffset) % AIS_COLORS.length];

  const total = data.reduce((sum, r) => sum + r.count, 0);
  // Table view can grow taller than the chart canvas — cap at height + 120
  // so a 10-row table doesn't blow past the screen.
  const tableMaxHeight = Math.max(
    height,
    Math.min(height + 120, data.length * 32 + 40)
  );

  // Cross-filter state for individual rows
  const clickable = !!onSliceClick;
  const isActiveRow = (label: string) => !activeValue || activeValue === label;
  const cellOpacity = (label: string) => (isActiveRow(label) ? 1 : 0.4);

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
          height={
            orientation === "horizontal"
              ? Math.max(height, data.length * 28 + 40)
              : height
          }
        >
          {orientation === "horizontal" ? (
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 20, right: 8, top: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#00000010"
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                stroke="#00000060"
              />
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
              <Bar
                dataKey="count"
                name="Members"
                radius={[0, 4, 4, 0]}
                cursor={clickable ? "pointer" : undefined}
                onClick={clickable ? (entry: { label?: string }) => entry?.label ? onSliceClick!(entry.label) : undefined : undefined}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={colorFor(entry.label, i)}
                    opacity={cellOpacity(entry.label)}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#00000060" />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
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
                name="Members"
                radius={[4, 4, 0, 0]}
                cursor={clickable ? "pointer" : undefined}
                onClick={clickable ? (entry: { label?: string }) => entry?.label ? onSliceClick!(entry.label) : undefined : undefined}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={colorFor(entry.label, i)}
                    opacity={cellOpacity(entry.label)}
                  />
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
              label={(entry) => `${entry.label} (${entry.count})`}
              labelLine={false}
              cursor={clickable ? "pointer" : undefined}
              onClick={clickable ? (entry: { label?: string }) => entry?.label ? onSliceClick!(entry.label) : undefined : undefined}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={colorFor(entry.label, i)}
                  opacity={cellOpacity(entry.label)}
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
      )}

      {/* TABLE view */}
      {chartType === "table" && (
        <div
          className="overflow-auto rounded-md border border-black/10"
          style={{ maxHeight: tableMaxHeight }}
        >
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-black/80 text-[0.65rem] uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Label</th>
                <th className="text-right px-3 py-2 font-bold w-20">Count</th>
                <th className="text-right px-3 py-2 font-bold w-20">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-black/80"
                  >
                    No data
                  </td>
                </tr>
              ) : (
                data.map((entry, i) => {
                  const pct = total > 0 ? (entry.count / total) * 100 : 0;
                  return (
                    <tr
                      key={`${entry.label}-${i}`}
                      className={`border-t border-black/5 ${clickable ? "cursor-pointer hover:bg-black/[0.02]" : "hover:bg-black/[0.02]"}`}
                      onClick={() => clickable && onSliceClick!(entry.label)}
                      style={{ opacity: cellOpacity(entry.label) }}
                      title={clickable ? `Click to filter dashboard to "${entry.label}"` : undefined}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: colorFor(entry.label, i) }}
                          />
                          <span className="font-medium text-black truncate">
                            {entry.label}
                          </span>
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
                  <td className="px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-black/80">
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
export function ChartTypeToggleGroup({
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
export function ChartTypeButton({
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

/**
 * useChartTypeState — convenience hook for managing per-chart + global
 * "set all" chart type state, mirroring the pattern used by the member
 * dashboard. Each chart has its own type (bar/pie/table), but the admin
 * can switch ALL charts at once via setAllChartTypes().
 *
 * Usage:
 *   const { chartTypes, setChartType, setAllChartTypes, globalActive } =
 *     useChartTypeState(CHART_IDS, DEFAULT_CHART_TYPES);
 */
export function useChartTypeState<ChartId extends string>(
  chartIds: readonly ChartId[],
  defaultTypes: Record<ChartId, ChartType>
) {
  const [chartTypes, setChartTypes] =
    React.useState<Record<ChartId, ChartType>>(defaultTypes);

  const setChartType = React.useCallback(
    (id: ChartId, type: ChartType) => {
      setChartTypes((prev) => ({ ...prev, [id]: type }));
    },
    []
  );

  const setAllChartTypes = React.useCallback(
    (type: ChartType) => {
      setChartTypes(() => {
        const next = {} as Record<ChartId, ChartType>;
        for (const id of chartIds) next[id] = type;
        return next;
      });
    },
    [chartIds]
  );

  // True when every chart is currently the same type — used to highlight
  // the "active" button in the global "Set all" control.
  const allSameType = chartIds.every(
    (id) => chartTypes[id] === chartTypes[chartIds[0]]
  );
  const globalActive: ChartType | null = allSameType
    ? chartTypes[chartIds[0]]
    : null;

  return { chartTypes, setChartType, setAllChartTypes, globalActive };
}
