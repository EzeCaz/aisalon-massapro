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
} from "lucide-react";
import { toast } from "sonner";

/**
 * AdminAnalyticsClient — fetches from /api/admin/analytics and renders:
 *   - Summary cards (total visits / signups / RSVPs / active referrers)
 *   - 30-day visits + signups trend chart (SVG)
 *   - Top referrers table (visits, new visitors, signups, RSVPs)
 *   - Recent visits feed
 *   - Recent signups feed
 *   - Top landing pages
 *
 * All client-side — the admin can refresh on demand via the Refresh button.
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
  utmCampaign: string | null;
  isNewVisitor: boolean;
  referrer: { name: string | null; email: string; utmUid: string };
};

type RecentSignup = {
  id: string;
  convertedAt: string;
  referredUser: { name: string | null; email: string };
  referrer: { name: string | null; email: string; utmUid: string };
};

type AnalyticsData = {
  summary: Summary;
  topReferrers: TopReferrer[];
  recentVisits: RecentVisit[];
  recentSignups: RecentSignup[];
  visitsByDay: { day: string; visits: number; signups: number }[];
  topLandingPages: { path: string; visits: number }[];
};

export function AdminAnalyticsClient() {
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AnalyticsData;
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Failed to load analytics: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF005A]" />
        <span className="ml-2 text-sm text-black/60">Loading analytics…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-[#FF005A]/30 bg-[#FF005A]/5 p-6 text-center">
        <p className="text-sm font-semibold text-[#FF005A] mb-2">Couldn&apos;t load analytics</p>
        <p className="text-xs text-black/60 mb-4">{error}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md bg-black text-white px-4 py-2 text-xs font-semibold hover:bg-black/90"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, topReferrers, recentVisits, recentSignups, visitsByDay, topLandingPages } = data;

  return (
    <div className="space-y-8">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-black/5 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Total visits"
          value={summary.totalVisits}
          color="#004F98"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="New visitors"
          value={summary.totalNewVisitors}
          color="#00C2A8"
        />
        <StatCard
          icon={<UserPlus className="h-4 w-4" />}
          label="Signups"
          value={summary.totalSignups}
          color="#FF005A"
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Event RSVPs"
          value={summary.totalRsvps}
          color="#820A7D"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Active referrers"
          value={summary.activeReferrers}
          color="#007E72"
        />
      </div>

      {/* 30-day trend chart */}
      <section className="rounded-xl border border-black/10 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-black">Referral activity — last 30 days</h2>
            <p className="text-xs text-black/60 mt-0.5">
              Daily visits and signups attributed to member share links.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#004F98]" /> Visits
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#FF005A]" /> Signups
            </span>
          </div>
        </div>
        <TrendChart data={visitsByDay} />
      </section>

      {/* Top referrers table */}
      <section>
        <h2 className="text-base font-bold text-black mb-1">Top referrers</h2>
        <p className="text-xs text-black/60 mb-4">
          Members ranked by total visits driven through their share link.
        </p>
        <div className="overflow-x-auto rounded-lg border border-black/10">
          <table className="min-w-full divide-y divide-black/10 text-sm">
            <thead className="bg-black/[0.03]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black/60">Member</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-black/60">Visits</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-black/60">New visitors</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-black/60">Signups</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-black/60">RSVPs</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black/60">Last visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white">
              {topReferrers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-black/40">
                    No referral visits yet. Members can share their link from{" "}
                    <Link href="/profile" className="text-[#FF005A] underline">/profile</Link>{" "}
                    or the events page.
                  </td>
                </tr>
              )}
              {topReferrers.map((r) => (
                <tr key={r.userId} className="hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-black">{r.name ?? "(no name)"}</div>
                    <div className="text-xs text-black/50">{r.email}</div>
                    <div className="text-[10px] font-mono text-black/40 mt-0.5">utm_uid: {r.utmUid}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#004F98]">{r.visits}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#00C2A8]">{r.newVisitors}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#FF005A]">{r.signups}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#820A7D]">{r.rsvps}</td>
                  <td className="px-4 py-3 text-xs text-black/60">
                    {r.lastVisitAt ? new Date(r.lastVisitAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent activity — two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent visits */}
        <section>
          <h2 className="text-base font-bold text-black mb-1">Recent visits</h2>
          <p className="text-xs text-black/60 mb-4">Latest 20 clicks on member share links.</p>
          <div className="rounded-lg border border-black/10 bg-white divide-y divide-black/5">
            {recentVisits.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-black/40">No visits recorded yet.</div>
            )}
            {recentVisits.map((v) => (
              <div key={v.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-black truncate">{v.referrer.name ?? v.referrer.email}</span>
                    {v.isNewVisitor && (
                      <span className="inline-flex items-center rounded-full bg-[#00C2A8]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#00C2A8]">
                        NEW
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-black/50 mt-0.5 truncate">
                    Landed on{" "}
                    <Link href={v.landingPath} className="font-mono text-[#004F98] hover:underline">
                      {v.landingPath}
                    </Link>
                    {v.utmCampaign && <span className="ml-2">· campaign: {v.utmCampaign}</span>}
                  </div>
                </div>
                <div className="text-xs text-black/40 whitespace-nowrap">
                  {new Date(v.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent signups */}
        <section>
          <h2 className="text-base font-bold text-black mb-1">Recent referred signups</h2>
          <p className="text-xs text-black/60 mb-4">Latest 20 members who signed up via a share link.</p>
          <div className="rounded-lg border border-black/10 bg-white divide-y divide-black/5">
            {recentSignups.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-black/40">No referred signups yet.</div>
            )}
            {recentSignups.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-start gap-3">
                <UserPlus className="h-4 w-4 text-[#FF005A] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-semibold text-black">{s.referredUser.name ?? s.referredUser.email}</span>
                    <span className="text-black/50"> signed up via </span>
                    <span className="font-semibold text-black">{s.referrer.name ?? s.referrer.email}</span>
                  </div>
                  <div className="text-xs text-black/40 mt-0.5 truncate">
                    {s.referredUser.email}
                  </div>
                </div>
                <div className="text-xs text-black/40 whitespace-nowrap">
                  {new Date(s.convertedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Top landing pages */}
      <section>
        <h2 className="text-base font-bold text-black mb-1">Top landing pages</h2>
        <p className="text-xs text-black/60 mb-4">Where members are driving traffic to.</p>
        <div className="rounded-lg border border-black/10 bg-white divide-y divide-black/5">
          {topLandingPages.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-black/40">No landing pages recorded yet.</div>
          )}
          {topLandingPages.map((p) => (
            <div key={p.path} className="px-4 py-3 flex items-center justify-between">
              <Link
                href={p.path}
                className="inline-flex items-center gap-1.5 text-sm font-mono text-[#004F98] hover:underline"
              >
                {p.path}
                <ExternalLink className="h-3 w-3" />
              </Link>
              <span className="text-sm font-mono font-semibold text-black">{p.visits} visits</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------
// StatCard
// ------------------------------------------------------------------
function StatCard({
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
      <div className="flex items-center gap-2 mb-2">
        <div
          className="inline-flex items-center justify-center w-7 h-7 rounded-full"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-black/50">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-black leading-tight">{value.toLocaleString()}</div>
    </div>
  );
}

// ------------------------------------------------------------------
// TrendChart — simple SVG bar chart, no external chart lib needed.
// ------------------------------------------------------------------
function TrendChart({
  data,
}: {
  data: { day: string; visits: number; signups: number }[];
}) {
  const maxVisits = Math.max(1, ...data.map((d) => d.visits));
  const width = 700;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 30, left: 30 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const barWidth = innerWidth / data.length;
  const visitsBarWidth = barWidth * 0.4;
  const signupsBarWidth = barWidth * 0.4;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        style={{ minWidth: "500px" }}
        role="img"
        aria-label="Daily visits and signups over the last 30 days"
      >
        {/* Y axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = padding.top + innerHeight * (1 - p);
          return (
            <g key={p}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#00000010"
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="#00000060"
              >
                {Math.round(maxVisits * p)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const x = padding.left + i * barWidth;
          const visitH = (d.visits / maxVisits) * innerHeight;
          const signupH = (d.signups / maxVisits) * innerHeight;
          const visitY = padding.top + innerHeight - visitH;
          const signupY = padding.top + innerHeight - signupH;
          return (
            <g key={d.day}>
              <rect
                x={x + barWidth * 0.1}
                y={visitY}
                width={visitsBarWidth}
                height={visitH}
                fill="#004F98"
                rx={1}
              >
                <title>{`${d.day}: ${d.visits} visits`}</title>
              </rect>
              <rect
                x={x + barWidth * 0.5}
                y={signupY}
                width={signupsBarWidth}
                height={signupH}
                fill="#FF005A"
                rx={1}
              >
                <title>{`${d.day}: ${d.signups} signups`}</title>
              </rect>
              {/* X axis label every 5 days */}
              {i % 5 === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - padding.bottom + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#00000060"
                >
                  {d.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}

        {/* X axis line */}
        <line
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={width - padding.right}
          y2={padding.top + innerHeight}
          stroke="#00000020"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
