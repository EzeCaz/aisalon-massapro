"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  RefreshCw,
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
  // Track which campaign ID is currently being resent so we can show a
  // spinner on just that row's Resend button (instead of a global
  // overlay that blocks the whole list).
  const [resendingId, setResendingId] = useState<string | null>(null);

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

  // "Resend to same audience" — clones the source campaign (subject,
  // body, audience, from/reply-to) and immediately fires the send
  // pipeline on the clone. One-click re-blast without walking the
  // 4-step composer again. Only SENT / FAILED campaigns can be resent
  // (the API enforces this too, but we hide the button for other
  // statuses so the admin doesn't see a dead action).
  async function handleResend(campaign: Campaign) {
    if (!confirm(
      `Resend "${campaign.name}" to the same audience?\n\n` +
      `This creates a new campaign with the same subject, body, and ` +
      `recipient list, then sends it immediately. The original ` +
      `campaign is not modified.`
    )) {
      return;
    }
    setResendingId(campaign.id);
    const t = toast.loading(`Resending "${campaign.name}"…`);
    try {
      const res = await fetch(
        `/api/admin/email/campaigns/${campaign.id}/resend`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        throw new Error(data?.error || `Failed (${res.status})`);
      }

      // 207 = multi-status: clone created but send step failed. Surface
      // the send error but still refresh so the admin can see + retry
      // the new DRAFT clone in the list.
      if (data.sendError) {
        toast.error(
          `Cloned, but send failed: ${data.sendError}`,
          { id: t, duration: 8000 }
        );
      } else if (data.sendResult) {
        const sr = data.sendResult;
        toast.success(
          `Resent to ${sr.sentCount || 0} recipients` +
          (sr.failedCount ? ` (${sr.failedCount} failed)` : ""),
          { id: t }
        );
      } else {
        toast.success("Resend queued", { id: t });
      }

      // Refresh so the new clone appears at the top of the list.
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resend",
        { id: t }
      );
    } finally {
      setResendingId(null);
    }
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
          <p className="text-sm text-black/80 mt-1">
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

      {/* Campaign list — real <table> matching the templates section
          layout. Avoids the horizontal-scroll problem the old
          grid-cols-12 layout had (the Actions col-span-2 was too narrow
          to fit two labeled buttons side-by-side, so the Resend button
          was getting pushed off-screen on narrower viewports). Table
          layout lets columns auto-size to their content and uses
          truncate + max-w-* for long text wrapping. */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Campaign</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Recipients</th>
              <th className="px-3 py-2.5 text-left font-semibold">Scheduled / Sent</th>
              <th className="px-3 py-2.5 text-left font-semibold">List source</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-neutral-500">
                  <Mail className="mx-auto mb-2 h-10 w-10 text-neutral-300" />
                  <div className="font-bold text-neutral-700 mb-1">No campaigns yet</div>
                  <div className="text-sm mb-4">Click "New campaign" to compose your first email.</div>
                  <Button onClick={() => setView({ kind: "compose" })}>
                    <Plus className="h-4 w-4 mr-1.5" /> New campaign
                  </Button>
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  onView={() => setView({ kind: "stats", campaignId: c.id })}
                  onResend={() => handleResend(c)}
                  resending={resendingId === c.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  onView,
  onResend,
  resending,
}: {
  campaign: Campaign;
  onView: () => void;
  onResend: () => void;
  resending: boolean;
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
      : "bg-black/5 text-black/80";

  const dateLabel = campaign.completedAt
    ? new Date(campaign.completedAt).toLocaleString()
    : campaign.scheduledAt
    ? `Scheduled ${new Date(campaign.scheduledAt).toLocaleString()}`
    : "—";

  // "Resend" clones the campaign + re-sends to the same audience. Only
  // meaningful for terminal states (SENT/FAILED) — for DRAFT the Edit
  // button already lets the admin open + send, and for SCHEDULED /
  // SENDING a resend would either double-send or collide with the
  // in-flight batch worker. We still RENDER the button on non-eligible
  // rows (disabled, with a tooltip explaining why) so the feature is
  // discoverable instead of mysteriously absent.
  const canResend = status === "SENT" || status === "FAILED";
  const resendTooltip = canResend
    ? "Resend to the same audience (creates a new campaign)"
    : `Resend is only available for SENT or FAILED campaigns (this one is ${status})`;

  // Icon-only action buttons save horizontal space so the row never
  // overflows. Each button has a `title` attribute so hovering shows
  // the action name (mirrors the email templates section's pattern).
  return (
    <tr className="border-t border-neutral-100 hover:bg-neutral-50">
      <td className="px-3 py-2.5">
        <div className="font-semibold text-neutral-900 max-w-xs truncate">{campaign.name}</div>
        <div className="text-xs text-neutral-500 max-w-xs truncate">{campaign.subjectSnapshot}</div>
      </td>
      <td className="px-3 py-2.5">
        <Badge className={statusColor}>{status}</Badge>
      </td>
      <td className="px-3 py-2.5 text-right text-neutral-700">
        {campaign.recipientCount || campaign._count.recipients}
      </td>
      <td className="px-3 py-2.5 text-xs text-neutral-700 whitespace-nowrap">{dateLabel}</td>
      <td className="px-3 py-2.5">
        <code className="text-[0.65rem] bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded">
          {campaign.listSource.replace("_", " ")}
        </code>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex justify-end gap-1">
          <button
            onClick={onResend}
            disabled={!canResend || resending}
            title={resendTooltip}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
              canResend
                ? "text-[#004F98] hover:bg-[#004F98]/10"
                : "text-neutral-300 cursor-not-allowed"
            }`}
          >
            {resending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onView}
            title={status === "DRAFT" ? "Edit campaign" : "View campaign stats"}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-[#FF005A]"
          >
            {status === "DRAFT" ? (
              <Edit3 className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
