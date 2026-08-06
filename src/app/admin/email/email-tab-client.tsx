"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  FileText,
  Save,
  Send,
  Eye,
  Edit3,
  Trash2,
  Copy,
  Search,
  Loader2,
  Mail,
  Workflow,
  Users,
  ExternalLink,
  RefreshCw,
  Pause,
  Play,
  FlaskConical,
  BarChart3,
  Monitor,
  Smartphone,
  X,
} from "lucide-react";
import { OrchestratorPanel } from "./orchestrator-panel";
import { EmailAdminNav, type EmailAdminTab } from "@/components/ais/email-admin-nav";
import { TemplatesClient, PREVIEW_CTX, LogoEditorField } from "./flows/templates-client";
import { RichTextEmailEditor } from "@/components/ais/rich-text-email-editor";
import { buildLogoBlock } from "@/lib/email-orchestrator/templates";
import { renderUnifiedEmail } from "@/lib/email/render-unified";
import Link from "next/link";

// ----------------------------------------------------------------------------
// Types — mirror the Prisma models we serialized in the server page.
// ----------------------------------------------------------------------------

type Template = {
  id: string;
  name: string;
  slug: string | null;
  category: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  signatureHtml: string | null;
  thumbnailUrl: string | null;
  // TSK-0074: logoUrl + mobileOverridesHtml + logoHidden are on
  // EmailTemplate2 but weren't declared here before. Needed for the
  // campaign composer's preview to show the brand logo + mobile
  // overrides + respect the per-template hide flag.
  logoUrl: string | null;
  logoHidden?: boolean;
  mobileOverridesHtml: string | null;
  createdBy: string;
  creator: { id: string; email: string; name: string | null };
  createdAt: string;
  updatedAt: string;
  _count: { campaigns: number };
};

type Campaign = {
  id: string;
  name: string;
  templateId: string | null;
  template: { id: string; name: string; category: string } | null;
  flowId: string | null;
  flow: { id: string; name: string; status: string } | null;
  subjectSnapshot: string;
  bodyHtmlSnapshot: string;
  bodyTextSnapshot: string | null;
  signatureHtmlSnapshot: string | null;
  listSource: string;
  listConfigJson: string;
  recipientCount: number;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  createdBy: string;
  creator: { id: string; email: string; name: string | null };
  createdAt: string;
  updatedAt: string;
  _count: { recipients: number; events: number };
};

type FlowSummary = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  _count: { steps: number };
};

type AudienceSummary = {
  id: string;
  name: string;
  slug: string | null;
  kind: string;
  isTest: boolean;
  flowStepsCount: number;
  emailsCount: number;
};

type StageTemplateSummary = {
  id: string;
  name: string;
  subject: string;
  stage: number | null;
  isDefault: boolean;
  isActive: boolean;
  flowStepsCount: number;
};

type Props = {
  initialCampaigns: Campaign[];
  initialTemplates: Template[];
  membersCount: number;
  tags: { label: string; color: string | null }[];
  adminEmail: string;
  /** Active top-level nav tab (from ?tab= query). */
  activeTab: EmailAdminTab;
  /** All flows in the DB (same source as /admin/email/flows). */
  flows: FlowSummary[];
  /** All audiences in the DB (same source as /admin/email/flows). */
  audiences: AudienceSummary[];
  /** All EmailStageTemplate rows (same source as /admin/email/flows). */
  stageTemplates: StageTemplateSummary[];
};

// ----------------------------------------------------------------------------
// Main client component
// ----------------------------------------------------------------------------

export function EmailTabClient({
  initialCampaigns,
  initialTemplates,
  membersCount,
  tags,
  adminEmail,
  activeTab,
  flows,
  audiences,
  stageTemplates,
}: Props) {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>(initialCampaigns);
  const [templates, setTemplates] = React.useState<Template[]>(initialTemplates);

  // Top-level modal state
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [editingCampaign, setEditingCampaign] = React.useState<Campaign | null>(null);

  // Save-as-template modal (used both by row button and in-composer button)
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = React.useState(false);
  const [saveAsTemplateSource, setSaveAsTemplateSource] = React.useState<{
    campaignId: string;
    campaignName: string;
    defaultName: string;
  } | null>(null);

  // Test-send modal (Phase 6) — opens from row "Test send" button OR from
  // the composer. Target is the campaign to test-send.
  const [testSendTarget, setTestSendTarget] = React.useState<Campaign | null>(null);

  // Local copy of stage templates so the TemplatesClient can update it.
  const [stageTemplatesState, setStageTemplatesState] = React.useState<StageTemplateSummary[]>(stageTemplates);

  // Refresh helpers
  const refreshCampaigns = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const refreshTemplates = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Handlers
  const handleNewCampaign = () => {
    setEditingCampaign(null);
    setComposerOpen(true);
  };

  // "Resend to same audience" — clones the source campaign (subject,
  // body, audience, from/reply-to) and immediately fires the send
  // pipeline on the clone via the /resend API endpoint. One-click
  // re-blast without walking the composer again. Only SENT / FAILED
  // campaigns can be resent (the API enforces this too).
  const [resendingId, setResendingId] = React.useState<string | null>(null);
  const handleResendCampaign = async (c: Campaign) => {
    if (!confirm(
      `Resend "${c.name}" to the same audience?\n\n` +
      `This creates a new campaign with the same subject, body, and ` +
      `recipient list, then sends it immediately. The original ` +
      `campaign is not modified.`
    )) {
      return;
    }
    setResendingId(c.id);
    const t = toast.loading(`Resending "${c.name}"…`);
    try {
      const res = await fetch(
        `/api/admin/email/campaigns/${c.id}/resend`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      // 207 = multi-status: clone created but send step failed.
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
      await refreshCampaigns();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resend",
        { id: t }
      );
    } finally {
      setResendingId(null);
    }
  };

  const handleEditCampaign = (c: Campaign) => {
    setEditingCampaign(c);
    setComposerOpen(true);
  };

  const handleSaveAsTemplateFromRow = (c: Campaign) => {
    setSaveAsTemplateSource({
      campaignId: c.id,
      campaignName: c.name,
      defaultName: `${c.name} (template)`,
    });
    setSaveAsTemplateOpen(true);
  };

  const handleDeleteCampaign = async (c: Campaign) => {
    if (!confirm(`Delete campaign "${c.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/email/campaigns/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete campaign");
        return;
      }
      toast.success("Campaign deleted");
      await refreshCampaigns();
    } catch {
      toast.error("Failed to delete campaign");
    }
  };

  // TSK-0074 Phase 5B: pause a SENDING/SCHEDULED campaign by setting its
  // status to PAUSED. The PATCH endpoint accepts PAUSED as a valid status
  // (Phase 5D backend change).
  const handlePauseCampaign = async (c: Campaign) => {
    if (!confirm(`Pause "${c.name}"? You can resume it later.`)) return;
    try {
      const res = await fetch(`/api/admin/email/campaigns/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to pause campaign");
        return;
      }
      toast.success(`Campaign "${c.name}" paused`);
      await refreshCampaigns();
    } catch {
      toast.error("Failed to pause campaign");
    }
  };

  // TSK-0074 Phase 5B: resume a PAUSED campaign — if it had a scheduledAt,
  // restore it to SCHEDULED; otherwise restore to DRAFT (editable).
  //
  // For flow-linked campaigns, the backend PATCH also re-activates the
  // linked flow (status → ACTIVE) so the orchestrator resumes processing
  // triggers. The toast message reflects this.
  const handleResumeCampaign = async (c: Campaign) => {
    const nextStatus = c.scheduledAt ? "SCHEDULED" : "DRAFT";
    try {
      const res = await fetch(`/api/admin/email/campaigns/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to resume campaign");
        return;
      }
      // For flow-linked campaigns, the PATCH also re-activated the flow.
      const flowMsg = c.flowId
        ? " · Linked flow re-activated — orchestrator will process due emails on the next cron tick (every 10 min)."
        : "";
      toast.success(`Campaign "${c.name}" resumed (${nextStatus}${flowMsg})`);
      await refreshCampaigns();
    } catch {
      toast.error("Failed to resume campaign");
    }
  };

  // TSK-0074 Phase 6: open the test-send modal. The actual send happens
  // inside the TestSendDialog component.
  const handleOpenTestSend = (c: Campaign) => {
    setTestSendTarget(c);
  };

  const handleComposerSaved = async () => {
    await refreshCampaigns();
    setComposerOpen(false);
    setEditingCampaign(null);
  };

  const handleSaveAsTemplateSaved = async () => {
    await refreshTemplates();
    setSaveAsTemplateOpen(false);
    setSaveAsTemplateSource(null);
  };

  return (
    <div className="space-y-6">
      <EmailAdminNav active={activeTab} />

      {activeTab === "orchestrator" && <OrchestratorPanel />}

      {activeTab === "flows" && (
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Email Flow Builder</h2>
              <p className="text-sm text-neutral-500">
                Build automated email sequences: pick an audience, a trigger, and an email template
                with A/B subject testing. Up to 8 independent steps per flow. Includes a per-step
                report broken down by template + subject variant.
              </p>
            </div>
            <a
              href="/admin/email/flows"
              className="inline-flex items-center gap-2 rounded bg-[#FF005A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d8004d]"
            >
              <Workflow className="h-4 w-4" /> Open Flow Builder
            </a>
          </div>
        </div>
      )}

      {activeTab === "campaigns" && (
        <div className="space-y-10">
          {/* Quick links to Flows + Audiences (same DB, full editor in /admin/email/flows) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <QuickLinkCard
              href="/admin/email/flows"
              icon={<Workflow className="h-4 w-4" />}
              title={`Flows (${flows.length})`}
              desc="Automated email sequences with triggers, delays, and A/B subject testing."
              accent="#FF005A"
            />
            <QuickLinkCard
              href="/admin/email/flows"
              icon={<Users className="h-4 w-4" />}
              title={`Audiences (${audiences.length})`}
              desc="Static email lists + dynamic filter-based audiences (members, RSVPs, users)."
              accent="#00E6FF"
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("flow-subtab-pref", "audiences");
                  window.dispatchEvent(new CustomEvent("flow-subtab-change", { detail: "audiences" }));
                }
              }}
            />
            <QuickLinkCard
              href="/admin/email/flows"
              icon={<FileText className="h-4 w-4" />}
              title={`Flow Templates (${stageTemplatesState.length})`}
              desc="Stage 1-5 templates + custom templates — editable, duplicable, with metrics."
              accent="#820A7D"
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("flow-subtab-pref", "templates");
                  window.dispatchEvent(new CustomEvent("flow-subtab-change", { detail: "templates" }));
                }
              }}
            />
          </section>

          {/* Flow Templates section (EmailStageTemplate — same DB as /admin/email/flows) */}
          <section>
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-black flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#820A7D]" />
                  Flow Templates (Stage 1-5)
                </h2>
                <p className="text-sm text-black/80">
                  Same templates used in the Flow Builder. Edit, duplicate, view metrics — all changes
                  sync to /admin/email/flows instantly (shared DB).
                </p>
              </div>
              <Link
                href="/admin/email/flows"
                className="text-xs text-[#FF005A] hover:underline inline-flex items-center gap-1"
              >
                Open full editor <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <TemplatesClient
              templates={[]}
              onTemplatesChange={(next) => {
                setStageTemplatesState(next.map((t) => ({
                  id: t.id,
                  name: t.name,
                  subject: t.subject,
                  stage: t.stage,
                  isDefault: t.isDefault ?? false,
                  isActive: t.isActive ?? true,
                  flowStepsCount: 0,
                })));
              }}
            />
          </section>

          {/* Campaigns section */}
          <section>
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-black">Campaigns</h2>
                <p className="text-sm text-black/80">
                  Draft, scheduled, and sent email campaigns. {membersCount} members in the
                  community.
                </p>
              </div>
              <Button onClick={handleNewCampaign} className="bg-black hover:bg-black/90 text-white">
                <Plus className="h-4 w-4 mr-1.5" />
                New campaign
              </Button>
            </div>
            <CampaignsTable
              campaigns={campaigns}
              onEdit={handleEditCampaign}
              onDelete={handleDeleteCampaign}
              onSaveAsTemplate={handleSaveAsTemplateFromRow}
              onRefresh={refreshCampaigns}
              onPause={handlePauseCampaign}
              onResume={handleResumeCampaign}
              onTestSend={handleOpenTestSend}
              onResend={handleResendCampaign}
              resendingId={resendingId}
            />
          </section>

          {/* Composer slide-out panel — rendered by CampaignComposer itself */}
          {composerOpen && (
            <CampaignComposer
              key={editingCampaign?.id || "new"}
              campaign={editingCampaign}
              templates={templates}
              tags={tags}
              membersCount={membersCount}
              adminEmail={adminEmail}
              flows={flows}
              onSaved={handleComposerSaved}
              onCancel={() => {
                setComposerOpen(false);
                setEditingCampaign(null);
              }}
              onTestSend={(c) => setTestSendTarget(c)}
              onRequestSaveAsTemplate={async (subject, bodyHtml, suggestedName) => {
                try {
                  let campaignId = editingCampaign?.id;
                  const campaignName = editingCampaign?.name || suggestedName || "Draft";

                  if (!campaignId) {
                    const createRes = await fetch("/api/admin/email/campaigns", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: campaignName,
                        subject,
                        bodyHtml,
                        listSource: "ALL_MEMBERS",
                        listConfigJson: "{}",
                      }),
                    });
                    if (!createRes.ok) {
                      const d = await createRes.json().catch(() => ({}));
                      toast.error(d.error || "Failed to create draft for template");
                      return;
                    }
                    const d = await createRes.json();
                    campaignId = d.campaign.id;
                  } else {
                    await fetch(`/api/admin/email/campaigns/${campaignId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        subject,
                        bodyHtml,
                        name: suggestedName || campaignName,
                      }),
                    });
                  }

                  setSaveAsTemplateSource({
                    campaignId: campaignId!,
                    campaignName: suggestedName || campaignName,
                    defaultName: `${suggestedName || campaignName} (template)`,
                  });
                  setSaveAsTemplateOpen(true);
                } catch (e) {
                  toast.error("Failed to prepare template");
                  console.error(e);
                }
              }}
            />
          )}

          {/* Save-as-template modal (used by both row button + in-composer button) */}
          <Dialog open={saveAsTemplateOpen} onOpenChange={setSaveAsTemplateOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Save as template</DialogTitle>
                <DialogDescription>
                  Save this email's subject + body as a reusable template. You can pick it
                  from the composer's template dropdown in future campaigns.
                </DialogDescription>
              </DialogHeader>
              {saveAsTemplateSource && (
                <SaveAsTemplateForm
                  campaignId={saveAsTemplateSource.campaignId}
                  defaultName={saveAsTemplateSource.defaultName}
                  campaignName={saveAsTemplateSource.campaignName}
                  onSaved={handleSaveAsTemplateSaved}
                  onCancel={() => {
                    setSaveAsTemplateOpen(false);
                    setSaveAsTemplateSource(null);
                  }}
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Test-send modal (Phase 6) — opened from the campaigns table OR
              from the composer's "Test send" button. The dialog lives at the
              top level so it can stay open even if the composer closes. */}
          <TestSendDialog
            campaign={testSendTarget}
            onOpenChange={(open) => {
              if (!open) setTestSendTarget(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickLinkCard — small CTA card for navigating to /admin/email/flows
// ---------------------------------------------------------------------------

function QuickLinkCard({
  href,
  icon,
  title,
  desc,
  accent,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="group rounded-lg border border-black/10 bg-white p-4 hover:border-[#FF005A]/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: accent }}
        >
          {icon}
        </span>
        <h3 className="text-sm font-bold text-black">{title}</h3>
      </div>
      <p className="text-xs text-black/80 leading-relaxed">{desc}</p>
      <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-[#FF005A] opacity-0 group-hover:opacity-100 transition-opacity">
        Open in Flow Builder →
      </p>
    </a>
  );
}

// ----------------------------------------------------------------------------
// Campaigns table
// ----------------------------------------------------------------------------

function CampaignsTable({
  campaigns,
  onEdit,
  onDelete,
  onSaveAsTemplate,
  onRefresh,
  onPause,
  onResume,
  onTestSend,
  onResend,
  resendingId,
}: {
  campaigns: Campaign[];
  onEdit: (c: Campaign) => void;
  onDelete: (c: Campaign) => void;
  onSaveAsTemplate: (c: Campaign) => void;
  onRefresh: () => Promise<void>;
  onPause: (c: Campaign) => Promise<void>;
  onResume: (c: Campaign) => Promise<void>;
  onTestSend: (c: Campaign) => void;
  onResend: (c: Campaign) => Promise<void>;
  resendingId: string | null;
}) {
  const [sending, setSending] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = campaigns.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.subjectSnapshot.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q) ||
      (c.flow?.name?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleSend = async (c: Campaign) => {
    // TSK-0074 Phase 5B: confirm dialog showing recipient count.
    const recipientCount = c._count.recipients || c.recipientCount || 0;
    const confirmMsg =
      recipientCount > 0
        ? `This will send "${c.name}" to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}. Continue?`
        : `Send "${c.name}" now? This will email all matching recipients immediately. Continue?`;
    if (!confirm(confirmMsg)) return;
    setSending(c.id);
    try {
      const res = await fetch(`/api/admin/email/campaigns/${c.id}/send`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to send campaign");
        return;
      }
      toast.success(
        `Sent: ${data.sentCount} delivered, ${data.failedCount} failed out of ${data.totalRecipients} recipients`
      );
      await onRefresh();
    } catch {
      toast.error("Failed to send campaign");
    } finally {
      setSending(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      toast.success("Campaigns refreshed");
    } finally {
      setRefreshing(false);
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 p-8 text-center">
        <Mail className="h-8 w-8 mx-auto text-black/30 mb-2" />
        <p className="text-sm text-black/80">
          No campaigns yet. Click <strong>New campaign</strong> above to compose your
          first email.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/80" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, subject, status, or flow..."
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-9"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>
      <div className="rounded-lg border border-black/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-black/80 sticky top-0 z-10">
            <tr>
              <th className="text-left font-medium px-3 py-2.5">Name</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-left font-medium px-3 py-2.5 max-w-[14rem]">Subject</th>
              {/* Hide Flow + Template on smaller viewports so the table
                  doesn't overflow horizontally. They come back on lg / xl
                  screens where there's room. Matches the templates
                  section approach (which has 7 cols and never scrolls). */}
              <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Flow</th>
              <th className="text-left font-medium px-3 py-2.5 hidden xl:table-cell">Template</th>
              <th className="text-right font-medium px-3 py-2.5">Recipients</th>
              <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Last sent</th>
              <th className="text-right font-medium px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const canSend = c.status === "DRAFT" || c.status === "FAILED";
              const canPause = c.status === "SENDING" || c.status === "SCHEDULED";
              const canResume = c.status === "PAUSED";
              const canEdit = c.status === "DRAFT" || c.status === "PAUSED";
              const canDelete = c.status === "DRAFT" || c.status === "FAILED" || c.status === "PAUSED";
              const canViewStats = c.status === "SENT";
              const lastSent = c.completedAt || c.startedAt;
              return (
                <tr key={c.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                  <td className="px-3 py-2.5 font-medium text-black max-w-xs truncate">
                    {c.name}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2.5 text-black/70 max-w-[14rem] truncate">
                    {c.subjectSnapshot}
                  </td>
                  <td className="px-3 py-2.5 text-black/80 text-xs hidden lg:table-cell">
                    {c.flow ? (
                      <a
                        href={`/admin/email/flows?flow=${c.flow.id}`}
                        className="inline-flex items-center gap-1 text-[#FF005A] hover:underline"
                        title={`Flow status: ${c.flow.status}`}
                      >
                        <Workflow className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">{c.flow.name}</span>
                      </a>
                    ) : (
                      <span className="text-black/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-black/80 text-xs hidden xl:table-cell">
                    {c.template ? (
                      <Badge variant="outline" className="font-normal text-xs">
                        {c.template.name}
                      </Badge>
                    ) : (
                      <span className="text-black/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-black/80">
                    {c._count.recipients > 0 ? c._count.recipients : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-black/80 text-xs whitespace-nowrap hidden md:table-cell">
                    {lastSent ? (
                      <span title={new Date(lastSent).toISOString()}>
                        {new Date(lastSent).toLocaleDateString()}{" "}
                        {new Date(lastSent).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : (
                      <span className="text-black/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {/* Resend — for SENT or FAILED. Clones the campaign +
                        sends to the same audience in one click. */}
                    {(c.status === "SENT" || c.status === "FAILED") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onResend(c)}
                        disabled={resendingId === c.id}
                        className="h-7 px-2 text-[#004F98] hover:text-[#004F98]"
                        title="Resend to the same audience (creates a new campaign)"
                      >
                        {resendingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    {/* Test send — always visible */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onTestSend(c)}
                      className="h-7 px-2 text-[#820A7D] hover:text-[#820A7D]"
                      title="Send a test email"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                    </Button>
                    {/* Send — only for DRAFT or FAILED */}
                    {canSend && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSend(c)}
                        disabled={sending === c.id}
                        className="h-7 px-2 text-[#FF005A] hover:text-[#FF005A]"
                        title="Send now"
                      >
                        {sending === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    {/* Pause — for SENDING or SCHEDULED */}
                    {canPause && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onPause(c)}
                        className="h-7 px-2 text-amber-600 hover:text-amber-700"
                        title="Pause"
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Resume — for PAUSED */}
                    {canResume && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onResume(c)}
                        className="h-7 px-2 text-green-600 hover:text-green-700"
                        title="Resume"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Edit — for DRAFT or PAUSED */}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(c)}
                        className="h-7 px-2"
                        title="Edit"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* View — for SENT or FAILED (read-only) */}
                    {(c.status === "SENT" || c.status === "FAILED") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(c)}
                        className="h-7 px-2"
                        title="View"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Stats — for SENT (placeholder) */}
                    {canViewStats && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toast.info("Stats coming soon")}
                        className="h-7 px-2 text-[#007E72] hover:text-[#007E72]"
                        title="View stats (coming soon)"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Save as template — for SENT or FAILED */}
                    {(c.status === "SENT" || c.status === "FAILED") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSaveAsTemplate(c)}
                        className="h-7 px-2 text-[#820A7D] hover:text-[#820A7D]"
                        title="Save as template"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Delete — for DRAFT, FAILED, or PAUSED */}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(c)}
                        className="h-7 px-2 text-black/80 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* SENDING spinner — no other actions */}
                    {c.status === "SENDING" && (
                      <Loader2 className="h-4 w-4 animate-spin text-[#FF005A] inline-block ml-1" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  // TSK-0074 Phase 5B: colored status badges.
  // DRAFT (gray), SCHEDULED (blue), SENDING (yellow pulse),
  // SENT (green), FAILED (red), PAUSED (amber).
  const color =
    status === "DRAFT"
      ? "bg-black/10 text-black/80"
      : status === "SCHEDULED"
      ? "bg-blue-100 text-blue-700"
      : status === "SENDING"
      ? "bg-yellow-100 text-yellow-800"
      : status === "SENT"
      ? "bg-[#007E72]/15 text-[#007E72]"
      : status === "FAILED"
      ? "bg-red-100 text-red-700"
      : status === "PAUSED"
      ? "bg-amber-100 text-amber-800"
      : "bg-black/10 text-black/80";
  const pulse = status === "SENDING";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${color} ${pulse ? "animate-pulse" : ""}`}
    >
      {status}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Campaign composer (also supports editing existing drafts/sent campaigns)
// ----------------------------------------------------------------------------

function CampaignComposer({
  campaign,
  templates,
  tags,
  membersCount,
  adminEmail,
  flows,
  onSaved,
  onCancel,
  onTestSend,
  onRequestSaveAsTemplate,
}: {
  campaign: Campaign | null;
  templates: Template[];
  tags: { label: string; color: string | null }[];
  membersCount: number;
  adminEmail: string;
  flows: FlowSummary[];
  onSaved: () => void;
  onCancel: () => void;
  onTestSend: (c: Campaign) => void;
  onRequestSaveAsTemplate: (subject: string, bodyHtml: string, suggestedName: string) => Promise<void>;
}) {
  const isFrozen = campaign && (campaign.status === "SENT" || campaign.status === "SENDING");
  const isEditing = !!campaign;

  const [name, setName] = React.useState(campaign?.name || "");
  const [subject, setSubject] = React.useState(campaign?.subjectSnapshot || "");
  const [bodyHtml, setBodyHtml] = React.useState(campaign?.bodyHtmlSnapshot || defaultBodyHtml());
  const [listSource, setListSource] = React.useState(campaign?.listSource || "ALL_MEMBERS");
  const [tagLabel, setTagLabel] = React.useState("");
  const [manualEmails, setManualEmails] = React.useState("");
  const [fromName, setFromName] = React.useState(campaign?.fromName || "AI Salon");
  const [fromEmail, setFromEmail] = React.useState(
    campaign?.fromEmail || process.env.NEXT_PUBLIC_SMTP_FROM_DEFAULT || "no-reply@aisalon.massapro.com"
  );
  const [replyTo, setReplyTo] = React.useState(campaign?.replyTo || adminEmail);

  // TSK-0074: logoUrl + mobileOverridesHtml + logoHidden for the campaign
  // preview. These come from the selected template (if any). The campaign
  // itself doesn't store these — at send time, the send route looks them up
  // from the linked template. In the composer, we track the "preview logo"
  // which is the template's logoUrl (or empty for the default brand logo)
  // + the template's logoHidden flag.
  const [logoUrl, setLogoUrl] = React.useState<string>("");
  const [logoHidden, setLogoHidden] = React.useState<boolean>(false);
  const [mobileOverridesHtml, setMobileOverridesHtml] = React.useState<string>("");

  // TSK-0074: Desktop/Mobile preview tabs (same as the template editor).
  // Replaces the old showPreview boolean toggle. The preview is always
  // visible below the editor, rendered via the same renderUnifiedEmail
  // pipeline used at send time.
  const [previewTab, setPreviewTab] = React.useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = React.useState(false);
  const [savingTemplate, setSavingTemplate] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [pausing, setPausing] = React.useState(false);

  // TSK-0074 Phase 5C: source-choice state for new campaigns.
  // "flow"  → user picked an ACTIVE flow from the dropdown; flowId is set.
  // "blank" → user opted for the legacy manual template picker (no flow link).
  // null    → user hasn't picked yet (shows the choice UI).
  const [sourceChoice, setSourceChoice] = React.useState<"flow" | "blank" | null>(
    isEditing ? "blank" : null
  );
  const [selectedFlowId, setSelectedFlowId] = React.useState<string | null>(
    campaign?.flowId ?? null
  );
  const [loadingFlow, setLoadingFlow] = React.useState(false);

  // Active flows only — a campaign can only be backed by an ACTIVE flow.
  // (A DRAFT/PAUSED/ARCHIVED flow has no live campaign.)
  const activeFlows = React.useMemo(
    () => flows.filter((f) => f.status === "ACTIVE"),
    [flows]
  );

  const resolvedListSource = React.useMemo(() => {
    if (listSource === "TAG" && tagLabel) return `TAG:${tagLabel}`;
    if (listSource === "MANUAL") return "MANUAL";
    return listSource;
  }, [listSource, tagLabel]);

  const listConfigJson = React.useMemo(() => {
    if (listSource === "MANUAL") {
      return JSON.stringify({
        emails: manualEmails
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
    return "{}";
  }, [listSource, manualEmails]);

  const handleApplyTemplate = (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBodyHtml(tpl.bodyHtml);
    // TSK-0074: load the template's logoUrl + mobile overrides so the
    // campaign preview shows the same branding + mobile styling as the
    // template editor.
    setLogoUrl(tpl.logoUrl ?? "");
    setLogoHidden(!!tpl.logoHidden);
    setMobileOverridesHtml(tpl.mobileOverridesHtml ?? "");
    if (!name) setName(tpl.name);
    toast.success(`Loaded template "${tpl.name}"`);
  };

  // TSK-0074 Phase 5C: when a flow is selected, fetch its first step's
  // template + audience and pre-fill the composer. Mirrors the backend
  // auto-create logic in PATCH /api/email-flows/[id].
  const handleSelectFlow = async (flowId: string) => {
    setSelectedFlowId(flowId);
    setLoadingFlow(true);
    try {
      const res = await fetch(`/api/email-flows/${flowId}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to load flow");
        return;
      }
      const data = await res.json();
      const flow = data.flow;
      if (!flow) return;
      const firstStep = (flow.steps || []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      )[0];
      if (!firstStep) {
        toast.warning("Flow has no steps — start blank instead");
        return;
      }
      // Pre-fill from the first step's template + subject variant + audience.
      if (firstStep.template?.subject) setSubject(firstStep.template.subject);
      else if (firstStep.subjectVariantA) setSubject(firstStep.subjectVariantA);
      if (firstStep.template?.bodyHtml) setBodyHtml(firstStep.template.bodyHtml);
      // TSK-0074: load logo + mobile overrides + hide flag from the flow step's template.
      if (firstStep.template?.logoUrl !== undefined) setLogoUrl(firstStep.template.logoUrl ?? "");
      if (firstStep.template?.logoHidden !== undefined) setLogoHidden(!!firstStep.template.logoHidden);
      if (firstStep.template?.mobileOverridesHtml !== undefined)
        setMobileOverridesHtml(firstStep.template.mobileOverridesHtml ?? "");
      if (!name) setName(`${flow.name} — campaign`);
      if (firstStep.audienceId) {
        setListSource(`AUDIENCE:${firstStep.audienceId}`);
      }
      toast.success(`Pre-filled from flow "${flow.name}" (step 1)`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load flow details");
    } finally {
      setLoadingFlow(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    setSaving(true);
    try {
      if (isEditing && campaign) {
        const res = await fetch(`/api/admin/email/campaigns/${campaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            subject,
            bodyHtml,
            listSource: resolvedListSource,
            listConfigJson,
            fromName,
            fromEmail,
            replyTo,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error || "Failed to save");
          return;
        }
        toast.success("Draft saved");
      } else {
        const res = await fetch("/api/admin/email/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            subject,
            bodyHtml,
            listSource: resolvedListSource,
            listConfigJson,
            fromName,
            fromEmail,
            replyTo,
            ...(selectedFlowId ? { flowId: selectedFlowId } : {}),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error || "Failed to create draft");
          return;
        }
        toast.success("Draft created");
      }
      onSaved();
    } catch (e) {
      toast.error("Failed to save");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // TSK-0074 Phase 5C: Send now from inside the composer (same endpoint as
  // the row Send button). Only available when editing an existing DRAFT or
  // FAILED campaign.
  const handleSendNow = async () => {
    if (!campaign) return;
    const recipientCount = campaign._count.recipients || campaign.recipientCount || 0;
    const confirmMsg =
      recipientCount > 0
        ? `This will send "${campaign.name}" to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}. Continue?`
        : `Send "${campaign.name}" now? This will email all matching recipients immediately. Continue?`;
    if (!confirm(confirmMsg)) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/email/campaigns/${campaign.id}/send`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to send campaign");
        return;
      }
      toast.success(
        `Sent: ${data.sentCount} delivered, ${data.failedCount} failed out of ${data.totalRecipients} recipients`
      );
      onSaved();
    } catch {
      toast.error("Failed to send campaign");
    } finally {
      setSending(false);
    }
  };

  // TSK-0074 Phase 5C: Pause from inside the composer.
  const handlePauseFromComposer = async () => {
    if (!campaign) return;
    if (!confirm(`Pause "${campaign.name}"? You can resume it later.`)) return;
    setPausing(true);
    try {
      const res = await fetch(`/api/admin/email/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to pause campaign");
        return;
      }
      toast.success(`Campaign "${campaign.name}" paused`);
      onSaved();
    } catch {
      toast.error("Failed to pause campaign");
    } finally {
      setPausing(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error("Subject and body are required to save as template");
      return;
    }
    const suggestedName = name.trim() || "Untitled campaign";
    setSavingTemplate(true);
    try {
      await onRequestSaveAsTemplate(subject, bodyHtml, suggestedName);
    } finally {
      setSavingTemplate(false);
    }
  };

  // TSK-0074 Phase 5C: derive action-button visibility from the campaign
  // state. Same conditions as the row buttons in CampaignsTable.
  const canSendFromComposer =
    isEditing && campaign && (campaign.status === "DRAFT" || campaign.status === "FAILED");
  const canPauseFromComposer =
    isEditing && campaign && (campaign.status === "SENDING" || campaign.status === "SCHEDULED");
  const canTestSendFromComposer = isEditing && !!campaign;

  // ── TSK-0074: Preview rendering (mirrors the template editor) ────────────
  // The preview iframe srcdoc is produced by the SAME renderUnifiedEmail
  // pipeline used at send time, so what the admin sees here matches
  // production rendering 1:1:
  //   - tokens substituted with sample values (PREVIEW_CTX)
  //   - brand logo injected top-right via buildLogoBlock(logoUrl)
  //   - mobile overrides wrapped in @media (max-width:600px)
  //   - unsubscribe footer with unsubscribeUrl: "#"
  //
  // Re-renders are debounced 300ms after edits to avoid re-running the
  // pipeline on every keystroke.
  const [debouncedBody, setDebouncedBody] = React.useState(bodyHtml);
  const [debouncedMobile, setDebouncedMobile] = React.useState(mobileOverridesHtml);
  const [debouncedLogo, setDebouncedLogo] = React.useState(logoUrl);
  const [debouncedLogoHidden, setDebouncedLogoHidden] = React.useState(logoHidden);

  React.useEffect(() => {
    const h = window.setTimeout(() => setDebouncedBody(bodyHtml), 300);
    return () => window.clearTimeout(h);
  }, [bodyHtml]);
  React.useEffect(() => {
    const h = window.setTimeout(() => setDebouncedMobile(mobileOverridesHtml), 300);
    return () => window.clearTimeout(h);
  }, [mobileOverridesHtml]);
  React.useEffect(() => {
    const h = window.setTimeout(() => setDebouncedLogo(logoUrl), 300);
    return () => window.clearTimeout(h);
  }, [logoUrl]);
  React.useEffect(() => {
    const h = window.setTimeout(() => setDebouncedLogoHidden(logoHidden), 100);
    return () => window.clearTimeout(h);
  }, [logoHidden]);

  // PER USER SPEC 2026-08-05: fetch the global default email logo (picked
  // by the Super Admin in the brand-image gallery) so the campaign preview
  // shows the ACTUAL default logo that will be injected at send time — not
  // the hardcoded fallback. The per-template `logoUrl` override still wins
  // (handled by buildLogoBlock). Fetched once when the composer mounts.
  const [globalEmailLogoDefault, setGlobalEmailLogoDefault] = React.useState<string>("");
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/brand-images", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { selections?: { emailLogo?: string } } | null) => {
        if (!cancelled && json?.selections?.emailLogo) {
          setGlobalEmailLogoDefault(json.selections.emailLogo);
        }
      })
      .catch(() => {
        // Non-critical — preview falls back to DEFAULT_BRAND_LOGO_URL.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewSrcDoc = React.useMemo(() => {
    if (!debouncedBody.trim()) {
      return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;padding:32px;color:#999;font-size:14px;text-align:center;">Start typing in the editor above to see a live preview here.</body></html>`;
    }
    return renderUnifiedEmail({
      html: debouncedBody,
      ctx: PREVIEW_CTX,
      logoHtml: buildLogoBlock(
        debouncedLogo || null,
        debouncedLogoHidden,
        globalEmailLogoDefault || undefined,
      ),
      mobileOverridesHtml: debouncedMobile || undefined,
      unsubscribeUrl: "#",
      chapterName: PREVIEW_CTX.chapterName,
    });
  }, [debouncedBody, debouncedMobile, debouncedLogo, debouncedLogoHidden, globalEmailLogoDefault]);

  // Preview pane — extracted so it can be rendered in two places:
  //   1. Inline (below the editor) on small screens — visible below xl breakpoint
  //   2. Sticky right sidebar on xl+ screens — always visible while scrolling
  // The iframe srcDoc is the same in both cases (single memoized value above).
  const renderPreviewPane = () => (
    <div className="rounded-md border border-black/15 bg-neutral-50">
      <div className="flex items-center justify-between border-b border-black/10 bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPreviewTab("desktop")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${
              previewTab === "desktop"
                ? "bg-[#FF005A] text-white"
                : "text-black/60 hover:bg-black/5"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab("mobile")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${
              previewTab === "mobile"
                ? "bg-[#FF005A] text-white"
                : "text-black/60 hover:bg-black/5"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </button>
        </div>
        <span className="text-[0.7rem] text-black/50">
          Rendered via <code>renderUnifiedEmail</code> · matches production sends
        </span>
      </div>
      <div className="flex justify-center bg-[repeating-conic-gradient(#f5f5f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] p-4">
        <iframe
          srcDoc={previewSrcDoc}
          title="Email preview"
          sandbox="allow-same-origin"
          style={{
            width: previewTab === "desktop" ? 600 : 375,
            maxWidth: "100%",
            height: 520,
            background: "#ffffff",
            border: "1px solid #e5e5e5",
            borderRadius: 4,
          }}
        />
      </div>
      <div className="border-t border-black/10 bg-white px-3 py-1.5 text-center text-[0.7rem] text-black/50">
        {previewTab === "desktop"
          ? "Desktop · 600px wide (typical webmail / Gmail desktop)"
          : "Mobile · 375px wide (iPhone SE / 12 mini viewport)"}
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-[1800px] max-w-[95vw] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold">
              {isEditing ? "Edit campaign" : "New campaign"}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Compose your email below. Save a draft, save it as a reusable template,
              or send it now to the selected recipient list.
            </p>
          </div>
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_680px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
      {/* TSK-0074 Phase 5C: source chooser (only for NEW campaigns).
          Three options:
            A) Pick an ACTIVE flow — pre-fills subject/body/audience from the
               flow's first step. The campaign is then "flow-backed": flow
               edits will refresh its snapshots automatically.
            B) Create a new flow — link to /admin/email/flows with a toast.
            C) Start blank — the legacy manual template picker (no flow link). */}
      {!isEditing && sourceChoice === null && (
        <div className="rounded-md border border-[#FF005A]/20 bg-[#FF005A]/[0.03] p-4 space-y-3">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-[#FF005A]">
              Choose source
            </Label>
            <p className="text-xs text-black/70 mt-0.5">
              Pick an existing ACTIVE flow to pre-fill this campaign from its first
              step, or start blank for a one-off send.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSourceChoice("flow")}
              disabled={activeFlows.length === 0}
              className="rounded-md border border-black/10 bg-white p-3 text-left hover:border-[#FF005A]/40 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Workflow className="h-4 w-4 text-[#FF005A] mb-1.5" />
              <div className="text-sm font-semibold text-black">Select existing flow</div>
              <div className="text-[0.7rem] text-black/70 mt-0.5">
                {activeFlows.length === 0
                  ? "No ACTIVE flows yet — activate one in the Flow Builder first."
                  : `${activeFlows.length} flow${activeFlows.length === 1 ? "" : "s"} available`}
              </div>
            </button>
            <a
              href="/admin/email/flows"
              onClick={(e) => {
                e.preventDefault();
                toast.info("Create a flow first, then come back here.");
                setTimeout(() => {
                  if (typeof window !== "undefined") {
                    window.location.href = "/admin/email/flows";
                  }
                }, 800);
              }}
              className="rounded-md border border-black/10 bg-white p-3 text-left hover:border-[#FF005A]/40 hover:shadow-sm transition-all"
            >
              <Plus className="h-4 w-4 text-[#FF005A] mb-1.5" />
              <div className="text-sm font-semibold text-black">Create new flow</div>
              <div className="text-[0.7rem] text-black/70 mt-0.5">
                Open the Flow Builder to design an automated sequence.
              </div>
            </a>
            <button
              type="button"
              onClick={() => setSourceChoice("blank")}
              className="rounded-md border border-black/10 bg-white p-3 text-left hover:border-[#FF005A]/40 hover:shadow-sm transition-all"
            >
              <FileText className="h-4 w-4 text-[#820A7D] mb-1.5" />
              <div className="text-sm font-semibold text-black">Start blank (no flow)</div>
              <div className="text-[0.7rem] text-black/70 mt-0.5">
                Manual template picker — one-off send with no flow link.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Flow picker (Option A) */}
      {!isEditing && sourceChoice === "flow" && (
        <div className="rounded-md border border-[#FF005A]/20 bg-[#FF005A]/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-[#FF005A]">
              Select an ACTIVE flow
            </Label>
            <button
              type="button"
              onClick={() => {
                setSourceChoice(null);
                setSelectedFlowId(null);
              }}
              className="text-[0.7rem] text-black/60 hover:text-black underline"
            >
              ← Back to source chooser
            </button>
          </div>
          {loadingFlow ? (
            <div className="flex items-center gap-2 text-sm text-black/70 py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading flow details…
            </div>
          ) : (
            <Select onValueChange={handleSelectFlow} value={selectedFlowId ?? undefined}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Pick an ACTIVE flow…" />
              </SelectTrigger>
              <SelectContent>
                {activeFlows.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}{" "}
                    <span className="text-black/70 ml-1">
                      ({f._count?.steps ?? 0} steps)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedFlowId && (
            <p className="text-[0.7rem] text-[#FF005A]">
              ✓ Campaign will be linked to this flow. Saving the flow in the Flow
              Builder will refresh this campaign&apos;s snapshots automatically.
            </p>
          )}
        </div>
      )}

      {/* Template picker (Option C — start blank, OR when editing) */}
      {(sourceChoice === "blank" || isEditing) && templates.length > 0 && (
        <div className="rounded-md border border-[#820A7D]/20 bg-[#820A7D]/[0.03] p-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-[#820A7D]">
            Start from template (optional)
          </Label>
          <Select onValueChange={handleApplyTemplate}>
            <SelectTrigger className="mt-1.5 bg-white">
              <SelectValue placeholder="Pick a template to load its subject + body..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} <span className="text-black/80 ml-1">({t.category})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* If editing a flow-backed campaign, show a banner linking back to the flow. */}
      {isEditing && campaign?.flow && (
        <div className="rounded-md border border-[#FF005A]/20 bg-[#FF005A]/[0.04] px-3 py-2 text-xs text-black/80 flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-[#FF005A]" />
          <span>
            Linked to flow{" "}
            <a
              href={`/admin/email/flows?flow=${campaign.flow.id}`}
              className="font-semibold text-[#FF005A] hover:underline"
            >
              {campaign.flow.name}
            </a>
            . Saving the flow as ACTIVE refreshes this campaign&apos;s snapshots automatically.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cmp-name">Campaign name</Label>
          <Input
            id="cmp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!isFrozen}
            placeholder="e.g. June 2026 newsletter"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="cmp-subject">Email subject</Label>
          <Input
            id="cmp-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!!isFrozen}
            placeholder="e.g. You're invited — AI Salon TLV June meetup"
            className="mt-1"
          />
        </div>
      </div>

      {/* ── TSK-0074: Email body WYSIWYG editor (same as template editor) ──────
          Replaced the old plain <Textarea> + toggle preview with the same
          RichTextEmailEditor + Desktop/Mobile preview pane used in the
          template editor. This ensures the campaign composer and template
          editor have identical editing + preview UX. */}
      <div>
        <Label className="mb-1 block">Email body (WYSIWYG)</Label>
        <RichTextEmailEditor
          value={bodyHtml}
          onChange={setBodyHtml}
          height={420}
          readOnly={!!isFrozen}
        />
      </div>

      {/* Logo override — read-only when editing a flow-linked campaign (the
          logo comes from the template; edit it in the template editor).
          For non-flow campaigns, allow per-campaign override. */}
      <LogoEditorField
        value={logoUrl}
        onChange={setLogoUrl}
        hidden={logoHidden}
        onHiddenChange={setLogoHidden}
      />

      {/* Mobile overrides (CSS/HTML) — same as template editor */}
      <div className="rounded-md border border-cyan-200 bg-cyan-50/30 p-3">
        <Label className="mb-1 block text-xs font-semibold text-cyan-900">
          Mobile overrides (CSS/HTML)
        </Label>
        <Textarea
          value={mobileOverridesHtml}
          onChange={(e) => setMobileOverridesHtml(e.target.value)}
          disabled={!!isFrozen}
          rows={6}
          spellCheck={false}
          placeholder={`h1 { font-size: 24px !important; line-height: 1.3 !important; }\n.hero { padding: 12px !important; }\n.btn { display: block !important; width: 100% !important; }`}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="mt-1 text-[0.7rem] text-cyan-800">
          These rules only apply on screens ≤600px wide (mobile). Wrapped
          automatically inside a <code>@media (max-width: 600px)</code>{" "}
          block by the unified renderer. The Mobile preview tab below shows
          them in action.
        </p>
      </div>

      {/* Desktop / Mobile preview — inline on small screens (below the editor).
          On xl+ screens, the preview moves to a sticky right sidebar (see
          the right column below). The srcDoc is the same in both cases. */}
      <div className="xl:hidden">{renderPreviewPane()}</div>

      {/* Recipient list selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Recipient list</Label>
          <Select
            value={listSource.startsWith("AUDIENCE:") ? "AUDIENCE" : listSource}
            onValueChange={(v) => {
              // TSK-0074 Phase 5C: when the user picks a different option
              // while a flow's AUDIENCE: listSource is active, switch to
              // ALL_MEMBERS (the user is explicitly overriding the flow's
              // audience). The flow's listSource is restored next time
              // the user re-selects the flow.
              if (v === "AUDIENCE") {
                // Keep the existing AUDIENCE:... value (already in listSource).
                return;
              }
              setListSource(v);
            }}
            disabled={!!isFrozen}
          >
            <SelectTrigger className="mt-1 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL_MEMBERS">
                All members ({membersCount})
              </SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.label} value={`TAG:${t.label}`}>
                  Tag: {t.label}
                </SelectItem>
              ))}
              <SelectItem value="MANUAL">Manual email list</SelectItem>
              {listSource.startsWith("AUDIENCE:") && (
                <SelectItem value="AUDIENCE" disabled>
                  Audience from flow (locked)
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {listSource.startsWith("AUDIENCE:") && (
            <p className="text-[0.7rem] text-[#FF005A] mt-1">
              Audience set by the linked flow&apos;s first step. Pick All members /
              Tag / Manual above to override.
            </p>
          )}
        </div>
        {listSource === "MANUAL" && (
          <div>
            <Label htmlFor="cmp-manual">Email addresses (one per line, comma, or semicolon)</Label>
            <Textarea
              id="cmp-manual"
              value={manualEmails}
              onChange={(e) => setManualEmails(e.target.value)}
              disabled={!!isFrozen}
              rows={3}
              placeholder="alice@x.com, bob@y.com&#10;carol@z.com"
              className="mt-1 font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* From / Reply-To */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="cmp-from-name">From name</Label>
          <Input
            id="cmp-from-name"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            disabled={!!isFrozen}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="cmp-from-email">From email</Label>
          <Input
            id="cmp-from-email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            disabled={!!isFrozen}
            className="mt-1 font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor="cmp-reply-to">Reply-To</Label>
          <Input
            id="cmp-reply-to"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            disabled={!!isFrozen}
            className="mt-1 font-mono text-xs"
          />
        </div>
      </div>

      {/* Read-only notice for sent campaigns */}
      {isFrozen && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This campaign has been sent — the subject and body are frozen snapshots and
          can no longer be edited. Use <strong>Save as template</strong> below to clone
          the content into a new editable template.
        </div>
      )}

      </div>
      {/* Sticky preview sidebar — visible on xl+ screens alongside the editor.
          The preview stays in view while scrolling through the form fields. */}
      <div className="hidden xl:block">
        <div className="sticky top-4">
          {renderPreviewPane()}
        </div>
      </div>
      </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Close
        </Button>

        {/* Test send — only available once the campaign exists (need an id). */}
        {canTestSendFromComposer && (
          <Button
            type="button"
            variant="outline"
            onClick={() => campaign && onTestSend(campaign)}
            className="border-[#820A7D]/30 text-[#820A7D] hover:bg-[#820A7D]/5"
          >
            <FlaskConical className="h-4 w-4 mr-1.5" />
            Test send
          </Button>
        )}

        {/* Pause — only for SENDING/SCHEDULED */}
        {canPauseFromComposer && (
          <Button
            type="button"
            variant="outline"
            onClick={handlePauseFromComposer}
            disabled={pausing}
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {pausing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Pause className="h-4 w-4 mr-1.5" />
            )}
            Pause
          </Button>
        )}

        {/* Send now — only for DRAFT/FAILED */}
        {canSendFromComposer && (
          <Button
            type="button"
            onClick={handleSendNow}
            disabled={sending}
            className="bg-[#FF005A] hover:bg-[#d8004d] text-white"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Send now
          </Button>
        )}

        {/* Save as template — always available (in-composer button #3) */}
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveAsTemplate}
          disabled={savingTemplate || !subject.trim() || !bodyHtml.trim()}
          className="border-[#820A7D]/30 text-[#820A7D] hover:bg-[#820A7D]/5"
        >
          {savingTemplate ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Copy className="h-4 w-4 mr-1.5" />
          )}
          Save as template
        </Button>

        {/* Save draft — only for editable */}
        {!isFrozen && (
          <Button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="bg-black hover:bg-black/90 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {isEditing ? "Save changes" : "Save draft"}
          </Button>
        )}
        </div>
      </div>
    </>
  );
}

function defaultBodyHtml() {
  return `<div style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Hi {{name}},</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
    Here's what's coming up at AI Salon {{chapter_name}}...
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    — The AI Salon {{chapter_name}} team
  </p>
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    AI Salon {{chapter_name}} · Empowering AI Connections<br/>
    <a href="https://aisalon.massapro.com" style="color: #999;">aisalon.massapro.com</a>
  </p>
</div>`;
}

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// Save-as-template form (used by both row button and in-composer button)
// ----------------------------------------------------------------------------

function SaveAsTemplateForm({
  campaignId,
  defaultName,
  campaignName,
  onSaved,
  onCancel,
}: {
  campaignId: string;
  defaultName: string;
  campaignName: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const [category, setCategory] = React.useState("general");
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/email/campaigns/${campaignId}/save-as-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to save as template");
        return;
      }
      toast.success(`Template "${name}" created`);
      onSaved();
    } catch (e) {
      toast.error("Failed to save as template");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-md bg-black/[0.03] p-3 text-xs text-black/70">
        Source campaign: <strong>{campaignName}</strong>
        <br />
        The subject and body snapshot will be cloned into the new template.
      </div>
      <div>
        <Label htmlFor="sat-name">Template name</Label>
        <Input
          id="sat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. June newsletter (template)"
          className="mt-1"
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="sat-category">Category</Label>
        <Input
          id="sat-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="general"
          className="mt-1"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-[#820A7D] hover:bg-[#820A7D]/90 text-white"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Copy className="h-4 w-4 mr-1.5" />
          )}
          Save template
        </Button>
      </DialogFooter>
    </div>
  );
}

// ----------------------------------------------------------------------------
// TestSendDialog (Phase 6) — modal for sending a test email to a free-typed
// list of email addresses. Calls POST /api/admin/email/campaigns/[id]/test-send.
// ----------------------------------------------------------------------------

function TestSendDialog({
  campaign,
  onOpenChange,
}: {
  campaign: Campaign | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [emails, setEmails] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<{
    sent: number;
    failed: number;
    total: number;
    errors?: string[];
  } | null>(null);

  const open = !!campaign;

  // Reset state when the dialog opens for a new campaign.
  React.useEffect(() => {
    if (campaign) {
      setEmails("");
      setResult(null);
      setSending(false);
    }
  }, [campaign?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!campaign) return;
    const trimmed = emails.trim();
    if (!trimmed) {
      toast.error("Enter at least one email address");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/admin/email/campaigns/${campaign.id}/test-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: trimmed }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to send test email");
        return;
      }
      setResult({
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        total: data.total ?? 0,
        errors: data.errors,
      });
      if (data.sent > 0) {
        toast.success(`Test sent: ${data.sent} email${data.sent === 1 ? "" : "s"}`);
      } else if (data.failed > 0) {
        toast.error("All test sends failed — see details below");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to send test email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[#820A7D]" />
            Test send
          </DialogTitle>
          <DialogDescription>
            Send a test email to a free-typed list of addresses. Bypasses the
            audience — no recipient rows are created, no events are logged.
          </DialogDescription>
        </DialogHeader>

        {campaign && (
          <div className="space-y-3 py-1">
            <div className="rounded-md bg-black/[0.03] p-3 text-xs space-y-1">
              <div className="font-semibold text-black">{campaign.name}</div>
              <div className="text-black/70">
                <span className="font-medium">Subject:</span>{" "}
                {campaign.subjectSnapshot || "(empty)"}
              </div>
              <div className="text-black/70">
                <span className="font-medium">Status:</span>{" "}
                <StatusBadge status={campaign.status} />
              </div>
            </div>

            <div>
              <Label htmlFor="ts-emails">
                Email addresses
              </Label>
              <Textarea
                id="ts-emails"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={4}
                placeholder="friend@example.com, eze@massapro.com"
                className="mt-1 font-mono text-xs"
                disabled={sending}
              />
              <p className="text-[0.7rem] text-black/50 mt-1">
                Comma-separated, newline-separated, or one per line. Invalid
                entries are silently dropped (listed in the result below).
              </p>
            </div>

            {result && (
              <div
                className={`rounded-md p-3 text-xs space-y-1 ${
                  result.failed > 0
                    ? "border border-amber-200 bg-amber-50 text-amber-900"
                    : "border border-[#007E72]/30 bg-[#007E72]/[0.04] text-[#007E72]"
                }`}
              >
                <div className="font-semibold">
                  Sent: {result.sent} · Failed: {result.failed} · Total: {result.total}
                </div>
                {result.errors && result.errors.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-medium">
                      Show {result.errors.length} error{result.errors.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {result.errors.map((err, i) => (
                        <li key={i} className="font-mono text-[0.7rem] break-all">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sending}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={handleSend}
                disabled={sending || !emails.trim()}
                className="bg-[#820A7D] hover:bg-[#820A7D]/90 text-white"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4 mr-1.5" />
                )}
                Send test
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
