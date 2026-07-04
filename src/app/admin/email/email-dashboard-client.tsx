"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Mail,
  BarChart3,
  Loader2,
  ArrowLeft,
  Send,
  Calendar,
  Edit3,
  Eye,
} from "lucide-react";
import { CampaignComposer } from "./campaign-composer";
import { CampaignStats } from "./campaign-stats";

type Campaign = {
  id: string;
  name: string;
  status: string;
  listSource: string;
  recipientCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  subjectSnapshot: string;
  createdAt: string;
  updatedAt: string;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  _count: { recipients: number };
  creator: { name: string | null; email: string };
};

type Event = {
  id: string;
  title: string;
  startsAt: string;
  _count: { rsvps: number };
};

type Template = {
  id: string;
  name: string;
  category: string;
  subject: string;
  _count: { campaigns: number };
};

type Props = {
  initialCampaigns: Campaign[];
  events: Event[];
  templates: Template[];
  currentUserId: string;
};

type View =
  | { kind: "list" }
  | { kind: "compose"; campaignId?: string }
  | { kind: "stats"; campaignId: string };

export function EmailDashboardClient({
  initialCampaigns,
  events,
  templates,
  currentUserId,
}: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [view, setView] = useState<View>({ kind: "list" });
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/email/campaigns");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCampaigns(data.campaigns);
    } catch {
      toast.error("Failed to refresh campaigns");
    } finally {
      setRefreshing(false);
    }
  }

  function handleCreated(campaign: Campaign) {
    setCampaigns((prev) => [campaign, ...prev]);
    setView({ kind: "stats", campaignId: campaign.id });
  }

  if (view.kind === "compose") {
    return (
      <CampaignComposer
        events={events}
        templates={templates}
        currentUserId={currentUserId}
        onCancel={() => setView({ kind: "list" })}
        onCreated={handleCreated}
      />
    );
  }

  if (view.kind === "stats") {
    return (
      <CampaignStats
        campaignId={view.campaignId}
        onBack={() => {
          refresh();
          setView({ kind: "list" });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">All campaigns</h2>
          <p className="text-sm text-black/60 mt-1">
            Compose, schedule, and track email campaigns to your members, non-members,
            event RSVPs, or any custom list.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4 mr-1.5" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const t = toast.loading("Processing scheduled + in-progress campaigns…");
              try {
                const res = await fetch("/api/cron/email/send-scheduled", {
                  method: "POST",
                });
                if (!res.ok) throw new Error("Failed");
                const data = await res.json();
                toast.success(`Processed ${data.processed} campaign(s)`, { id: t });
                refresh();
              } catch {
                toast.error("Failed to process campaigns", { id: t });
              }
            }}
          >
            <Send className="h-4 w-4 mr-1.5" />
            Send due
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const t = toast.loading("Polling inbox for replies…");
              try {
                const res = await fetch("/api/cron/email/imap-poll", {
                  method: "POST",
                });
                if (!res.ok) throw new Error("Failed");
                const data = await res.json();
                toast.success(
                  `Scanned ${data.scanned} emails, found ${data.replies} replies`,
                  { id: t }
                );
                refresh();
              } catch {
                toast.error("Failed to poll inbox", { id: t });
              }
            }}
          >
            <Mail className="h-4 w-4 mr-1.5" />
            Poll replies
          </Button>
          <Button onClick={() => setView({ kind: "compose" })}>
            <Plus className="h-4 w-4 mr-1.5" /> New campaign
          </Button>
        </div>
      </div>

      {/* Campaign list */}
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-black/10 text-xs font-semibold uppercase tracking-wide text-black/60">
          <div className="col-span-4">Campaign</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-center">Recipients</div>
          <div className="col-span-2">Scheduled / Sent</div>
          <div className="col-span-1 text-center">List source</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="h-10 w-10 mx-auto text-black/30 mb-3" />
            <h3 className="font-bold text-black mb-1">No campaigns yet</h3>
            <p className="text-sm text-black/60 mb-4">
              Click "New campaign" to compose your first email.
            </p>
            <Button onClick={() => setView({ kind: "compose" })}>
              <Plus className="h-4 w-4 mr-1.5" /> New campaign
            </Button>
          </div>
        ) : (
          campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onView={() => setView({ kind: "stats", campaignId: c.id })}
            />
          ))
        )}
      </Card>
    </div>
  );
}

function CampaignRow({
  campaign,
  onView,
}: {
  campaign: Campaign;
  onView: () => void;
}) {
  const status = campaign.status;
  const statusColor =
    status === "SENT"
      ? "bg-[#007E72]/10 text-[#007E72]"
      : status === "SENDING"
      ? "bg-[#004F98]/10 text-[#004F98]"
      : status === "SCHEDULED"
      ? "bg-[#FFAC30]/10 text-[#FFAC30]"
      : status === "FAILED"
      ? "bg-[#FF005A]/10 text-[#FF005A]"
      : "bg-black/5 text-black/60";

  const dateLabel = campaign.completedAt
    ? new Date(campaign.completedAt).toLocaleString()
    : campaign.scheduledAt
    ? `Scheduled ${new Date(campaign.scheduledAt).toLocaleString()}`
    : "—";

  return (
    <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-black/5 hover:bg-black/[0.02] items-center text-sm">
      <div className="col-span-4">
        <div className="font-semibold text-black truncate">{campaign.name}</div>
        <div className="text-xs text-black/50 truncate">{campaign.subjectSnapshot}</div>
      </div>
      <div className="col-span-2">
        <Badge className={statusColor}>{status}</Badge>
      </div>
      <div className="col-span-1 text-center text-xs">
        {campaign.recipientCount || campaign._count.recipients}
      </div>
      <div className="col-span-2 text-xs text-black/60">{dateLabel}</div>
      <div className="col-span-1 text-center text-xs">
        <code className="text-[0.65rem] bg-black/5 px-1 py-0.5 rounded">
          {campaign.listSource.replace("_", " ")}
        </code>
      </div>
      <div className="col-span-2 flex justify-end gap-1">
        <Button size="sm" variant="outline" onClick={onView}>
          {status === "DRAFT" ? (
            <>
              <Edit3 className="h-3 w-3 mr-1" /> Edit
            </>
          ) : (
            <>
              <Eye className="h-3 w-3 mr-1" /> View
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
