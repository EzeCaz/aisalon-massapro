"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Download,
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  MailX,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

type Stats = {
  campaign: {
    id: string;
    name: string;
    status: string;
    subjectSnapshot: string;
    bodyHtmlSnapshot: string;
    recipientCount: number;
    scheduledAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    fromName: string | null;
    fromEmail: string | null;
    listSource: string;
  };
  counts: {
    total: number;
    QUEUED: number;
    SENT: number;
    FAILED: number;
    BOUNCED: number;
    UNSUBSCRIBED: number;
    opened: number;
    clicked: number;
    replied: number;
  };
  timeline: { hour: number; opens: number; clicks: number; replies: number }[];
  clickMap: { url: string; count: number }[];
  recentEvents: {
    id: string;
    type: string;
    email: string;
    details: string | null;
    createdAt: string;
    recipient: { email: string; name: string | null } | null;
  }[];
};

type Recipient = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  sentAt: string | null;
  openCount: number;
  clickCount: number;
  repliedAt: string | null;
  replySnippet: string | null;
};

export function CampaignStats({
  campaignId,
  onBack,
}: {
  campaignId: string;
  onBack: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsTotal, setRecipientsTotal] = useState(0);
  const [recipientsPage, setRecipientsPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"overview" | "recipients" | "events" | "preview">("overview");

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/email/campaigns/${campaignId}/stats`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setStats(data);
    } catch {
      toast.error("Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecipients() {
    const params = new URLSearchParams({
      page: String(recipientsPage),
      pageSize: "50",
    });
    if (search) params.set("search", search);
    const res = await fetch(
      `/api/admin/email/campaigns/${campaignId}/recipients?${params}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setRecipients(data.recipients);
    setRecipientsTotal(data.total);
  }

  useEffect(() => {
    fetchStats();
  }, [campaignId]);

  useEffect(() => {
    if (tab === "recipients") fetchRecipients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, recipientsPage, search]);

  if (loading || !stats) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-black/30" />
        <p className="text-sm text-black/50 mt-2">Loading campaign stats…</p>
      </div>
    );
  }

  const { campaign, counts, timeline, clickMap, recentEvents } = stats;

  function exportCsv() {
    // Export all recipients as CSV
    const params = new URLSearchParams({ page: "1", pageSize: "1000" });
    fetch(`/api/admin/email/campaigns/${campaignId}/recipients?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const rows = [
          [
            "email",
            "name",
            "status",
            "sent_at",
            "open_count",
            "first_opened_at",
            "last_opened_at",
            "click_count",
            "first_clicked_at",
            "replied_at",
            "reply_snippet",
          ],
          ...data.recipients.map((r: Recipient) => [
            r.email,
            r.name ?? "",
            r.status,
            r.sentAt ?? "",
            r.openCount,
            "",
            "",
            r.clickCount,
            "",
            r.repliedAt ?? "",
            (r.replySnippet ?? "").replace(/[\n,]/g, " "),
          ]),
        ];
        const csv = rows
          .map((r) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(","))
          .join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${campaign.name.replace(/\s+/g, "_")}_recipients.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to campaigns
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-black/80">{campaign.subjectSnapshot}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={Send} label="Sent" value={counts.SENT} color="#004F98" />
        <StatCard icon={MailX} label="Failed" value={counts.FAILED + counts.BOUNCED} color="#FF005A" />
        <StatCard icon={Eye} label="Opened" value={counts.opened} color="#007E72" sub={counts.SENT > 0 ? `${Math.round((counts.opened / counts.SENT) * 100)}%` : ""} />
        <StatCard icon={MousePointerClick} label="Clicked" value={counts.clicked} color="#FFAC30" sub={counts.SENT > 0 ? `${Math.round((counts.clicked / counts.SENT) * 100)}%` : ""} />
        <StatCard icon={MessageSquare} label="Replied" value={counts.replied} color="#820A7D" />
        <StatCard icon={MailX} label="Unsubscribed" value={counts.UNSUBSCRIBED} color="#666" />
        <StatCard icon={Send} label="Queued" value={counts.QUEUED} color="#999" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-black/10">
        {([
          ["overview", "Overview"],
          ["recipients", `Recipients (${recipientsTotal})`],
          ["events", "Recent events"],
          ["preview", "Email preview"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[#FF005A] text-black"
                : "border-transparent text-black/50 hover:text-black"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Timeline */}
          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">Opens + clicks over time</h3>
            <TimelineChart timeline={timeline} />
          </Card>

          {/* Click map */}
          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">Top clicked links</h3>
            {clickMap.length === 0 ? (
              <p className="text-xs text-black/80">No clicks yet.</p>
            ) : (
              <div className="space-y-2">
                {clickMap.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge className="bg-[#004F98]/10 text-[#004F98] w-8 justify-center">
                      {c.count}
                    </Badge>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate flex-1 text-[#004F98] hover:underline"
                    >
                      {c.url}
                    </a>
                    <ExternalLink className="h-3 w-3 text-black/30" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "recipients" && (
        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b border-black/10 flex items-center gap-2">
            <Input
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setRecipientsPage(1);
              }}
              className="max-w-xs"
            />
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-3 w-3 mr-1" /> Export CSV
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-2 px-3 py-2 border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-black/50">
            <div className="col-span-2">Email</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-center">Opens</div>
            <div className="col-span-1 text-center">Clicks</div>
            <div className="col-span-1">Replied</div>
            <div className="col-span-1">Sent at</div>
          </div>
          {recipients.length === 0 ? (
            <div className="p-8 text-center text-sm text-black/80">No recipients found.</div>
          ) : (
            recipients.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-7 gap-2 px-3 py-2 border-b border-black/5 hover:bg-black/[0.02] text-xs items-center"
              >
                <div className="col-span-2">
                  <div className="font-medium truncate">{r.email}</div>
                  {r.name && <div className="text-black/50 truncate">{r.name}</div>}
                </div>
                <div className="col-span-1">
                  <Badge
                    className={
                      r.status === "SENT"
                        ? "bg-[#007E72]/10 text-[#007E72]"
                        : r.status === "FAILED" || r.status === "BOUNCED"
                        ? "bg-[#FF005A]/10 text-[#FF005A]"
                        : r.status === "UNSUBSCRIBED"
                        ? "bg-black/10 text-black/80"
                        : "bg-black/5 text-black/50"
                    }
                  >
                    {r.status}
                  </Badge>
                </div>
                <div className="col-span-1 text-center">{r.openCount}</div>
                <div className="col-span-1 text-center">{r.clickCount}</div>
                <div className="col-span-1">
                  {r.repliedAt ? (
                    <span title={r.replySnippet ?? ""} className="cursor-help">
                      {new Date(r.repliedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="col-span-1 text-black/80">
                  {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                </div>
              </div>
            ))
          )}
          {/* Pagination */}
          <div className="p-3 border-t border-black/10 flex items-center justify-between">
            <span className="text-xs text-black/50">
              Page {recipientsPage} · {recipientsTotal} total
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={recipientsPage === 1}
                onClick={() => setRecipientsPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={recipients.length < 50}
                onClick={() => setRecipientsPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "events" && (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-black/50">
            <div>When</div>
            <div>Type</div>
            <div>Email</div>
            <div>Details</div>
          </div>
          {recentEvents.length === 0 ? (
            <div className="p-8 text-center text-sm text-black/80">No events yet.</div>
          ) : (
            recentEvents.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-black/5 hover:bg-black/[0.02] text-xs items-center"
              >
                <div className="text-black/80">{new Date(e.createdAt).toLocaleString()}</div>
                <div>
                  <Badge className={eventBadgeColor(e.type)}>{e.type}</Badge>
                </div>
                <div className="truncate">{e.email}</div>
                <div className="truncate text-black/80">{e.details || "—"}</div>
              </div>
            ))
          )}
        </Card>
      )}

      {tab === "preview" && (
        <Card className="p-0 overflow-hidden">
          <div className="bg-black/[0.02] px-4 py-3 border-b border-black/10 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-black/50">From</div>
                <div className="font-medium">
                  {campaign.fromName} &lt;{campaign.fromEmail}&gt;
                </div>
              </div>
              <div>
                <div className="text-xs text-black/50">Subject</div>
                <div className="font-medium">{campaign.subjectSnapshot}</div>
              </div>
            </div>
          </div>
          <div
            className="p-6 bg-white max-h-[600px] overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: campaign.bodyHtmlSnapshot }}
          />
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-xs text-black/50">
        <Icon className="h-3 w-3" style={{ color }} />
        {label}
      </div>
      <div className="text-2xl font-bold mt-1" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-black/50">{sub} of sent</div>}
    </Card>
  );
}

function TimelineChart({
  timeline,
}: {
  timeline: { hour: number; opens: number; clicks: number; replies: number }[];
}) {
  if (timeline.length === 0) {
    return <p className="text-xs text-black/80">No data yet.</p>;
  }
  const maxVal = Math.max(
    ...timeline.map((t) => Math.max(t.opens, t.clicks, t.replies, 1))
  );
  return (
    <div className="space-y-1">
      {timeline.map((t) => (
        <div key={t.hour} className="grid grid-cols-12 gap-2 items-center text-xs">
          <div className="col-span-1 text-black/50">h{t.hour}</div>
          <div className="col-span-7 flex gap-0.5 h-4">
            <div
              className="bg-[#007E72] h-full"
              style={{ width: `${(t.opens / maxVal) * 50}%` }}
              title={`${t.opens} opens`}
            />
            <div
              className="bg-[#FFAC30] h-full"
              style={{ width: `${(t.clicks / maxVal) * 50}%` }}
              title={`${t.clicks} clicks`}
            />
            <div
              className="bg-[#820A7D] h-full"
              style={{ width: `${(t.replies / maxVal) * 50}%` }}
              title={`${t.replies} replies`}
            />
          </div>
          <div className="col-span-4 text-black/80 text-[0.65rem]">
            {t.opens}o / {t.clicks}c / {t.replies}r
          </div>
        </div>
      ))}
      <div className="flex gap-3 pt-2 text-[0.65rem] text-black/50">
        <span><span className="inline-block w-2 h-2 bg-[#007E72] mr-1" />Opens</span>
        <span><span className="inline-block w-2 h-2 bg-[#FFAC30] mr-1" />Clicks</span>
        <span><span className="inline-block w-2 h-2 bg-[#820A7D] mr-1" />Replies</span>
      </div>
    </div>
  );
}

function eventBadgeColor(type: string): string {
  switch (type) {
    case "SENT":
      return "bg-[#004F98]/10 text-[#004F98]";
    case "OPEN":
      return "bg-[#007E72]/10 text-[#007E72]";
    case "CLICK":
      return "bg-[#FFAC30]/10 text-[#FFAC30]";
    case "REPLY":
      return "bg-[#820A7D]/10 text-[#820A7D]";
    case "BOUNCE":
      return "bg-[#FF005A]/10 text-[#FF005A]";
    case "UNSUBSCRIBE":
      return "bg-black/10 text-black/80";
    default:
      return "bg-black/5 text-black/50";
  }
}
