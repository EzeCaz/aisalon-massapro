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
  FilePlus2,
} from "lucide-react";

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

type Props = {
  initialCampaigns: Campaign[];
  initialTemplates: Template[];
  membersCount: number;
  tags: { label: string; color: string | null }[];
  adminEmail: string;
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
}: Props) {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>(initialCampaigns);
  const [templates, setTemplates] = React.useState<Template[]>(initialTemplates);

  // Top-level modal state
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [editingCampaign, setEditingCampaign] = React.useState<Campaign | null>(null);
  const [templateEditorOpen, setTemplateEditorOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<Template | null>(null);

  // Save-as-template modal (used both by row button and in-composer button)
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = React.useState(false);
  const [saveAsTemplateSource, setSaveAsTemplateSource] = React.useState<{
    campaignId: string;
    campaignName: string;
    defaultName: string;
  } | null>(null);

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

  const handleEditCampaign = (c: Campaign) => {
    setEditingCampaign(c);
    setComposerOpen(true);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateEditorOpen(true);
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
    } catch (e) {
      toast.error("Failed to delete campaign");
    }
  };

  const handleComposerSaved = async () => {
    await refreshCampaigns();
    setComposerOpen(false);
    setEditingCampaign(null);
  };

  const handleTemplateSaved = async () => {
    await refreshTemplates();
    setTemplateEditorOpen(false);
    setEditingTemplate(null);
  };

  const handleSaveAsTemplateSaved = async () => {
    await refreshTemplates();
    setSaveAsTemplateOpen(false);
    setSaveAsTemplateSource(null);
  };

  return (
    <div className="space-y-10">
      {/* Templates section (shown at top — small, so admins see them first) */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-black">Templates</h2>
            <p className="text-sm text-black/60">
              Reusable subject + body pairs. Pick from the composer's template dropdown.
            </p>
          </div>
          <Button
            onClick={handleCreateTemplate}
            className="bg-[#820A7D] hover:bg-[#820A7D]/90 text-white"
          >
            <FilePlus2 className="h-4 w-4 mr-1.5" />
            Create template
          </Button>
        </div>
        <TemplatesTable
          templates={templates}
          onEdit={(t) => {
            setEditingTemplate(t);
            setTemplateEditorOpen(true);
          }}
        />
      </section>

      {/* Campaigns section */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-black">Campaigns</h2>
            <p className="text-sm text-black/60">
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
        />
      </section>

      {/* Composer modal */}
      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-w-[128rem] w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? "Edit campaign" : "New campaign"}
            </DialogTitle>
            <DialogDescription>
              Compose your email below. Save a draft, save it as a reusable template,
              or send it now to the selected recipient list.
            </DialogDescription>
          </DialogHeader>
          <CampaignComposer
            key={editingCampaign?.id || "new"}
            campaign={editingCampaign}
            templates={templates}
            tags={tags}
            membersCount={membersCount}
            adminEmail={adminEmail}
            onSaved={handleComposerSaved}
            onCancel={() => {
              setComposerOpen(false);
              setEditingCampaign(null);
            }}
            onRequestSaveAsTemplate={async (subject, bodyHtml, suggestedName) => {
              // For the in-composer flow: create a draft campaign first (if not
              // already), then call save-as-template on it. If we're editing an
              // existing draft, use its ID directly.
              try {
                let campaignId = editingCampaign?.id;
                let campaignName = editingCampaign?.name || suggestedName || "Draft";

                if (!campaignId) {
                  // Create a draft so we can clone it
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
                  // Update the existing draft with the latest composer content
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
        </DialogContent>
      </Dialog>

      {/* Template editor modal */}
      <Dialog open={templateEditorOpen} onOpenChange={setTemplateEditorOpen}>
        <DialogContent className="max-w-[128rem] w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit template" : "Create template"}
            </DialogTitle>
            <DialogDescription>
              Templates store a reusable subject + body pair. They don't send — pick
              one from the composer's dropdown to use it as a starting point.
            </DialogDescription>
          </DialogHeader>
          <TemplateEditor
            key={editingTemplate?.id || "new"}
            template={editingTemplate}
            onSaved={handleTemplateSaved}
            onCancel={() => {
              setTemplateEditorOpen(false);
              setEditingTemplate(null);
            }}
          />
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

// ----------------------------------------------------------------------------
// Templates table
// ----------------------------------------------------------------------------

function TemplatesTable({
  templates,
  onEdit,
}: {
  templates: Template[];
  onEdit: (t: Template) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 p-8 text-center">
        <FileText className="h-8 w-8 mx-auto text-black/30 mb-2" />
        <p className="text-sm text-black/60">
          No templates yet. Click <strong>Create template</strong> above, or use{" "}
          <strong>Save as template</strong> on a sent campaign to create one.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-black/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.03] text-black/60">
          <tr>
            <th className="text-left font-medium px-3 py-2.5">Name</th>
            <th className="text-left font-medium px-3 py-2.5">Category</th>
            <th className="text-left font-medium px-3 py-2.5">Subject</th>
            <th className="text-right font-medium px-3 py-2.5">Campaigns</th>
            <th className="text-left font-medium px-3 py-2.5">Created</th>
            <th className="text-right font-medium px-3 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="border-t border-black/5 hover:bg-black/[0.02]">
              <td className="px-3 py-2.5 font-medium text-black">{t.name}</td>
              <td className="px-3 py-2.5">
                <Badge variant="outline" className="font-normal text-xs">
                  {t.category}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-black/70 max-w-md truncate">
                {t.subject}
              </td>
              <td className="px-3 py-2.5 text-right text-black/60">
                {t._count.campaigns}
              </td>
              <td className="px-3 py-2.5 text-black/60 text-xs">
                {new Date(t.createdAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit(t)}
                  className="h-7 px-2"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
}: {
  campaigns: Campaign[];
  onEdit: (c: Campaign) => void;
  onDelete: (c: Campaign) => void;
  onSaveAsTemplate: (c: Campaign) => void;
  onRefresh: () => Promise<void>;
}) {
  const [sending, setSending] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const filtered = campaigns.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.subjectSnapshot.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  });

  const handleSend = async (c: Campaign) => {
    if (
      !confirm(
        `Send "${c.name}" now? This will email all matching recipients immediately.`
      )
    )
      return;
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
    } catch (e) {
      toast.error("Failed to send campaign");
    } finally {
      setSending(null);
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 p-8 text-center">
        <Mail className="h-8 w-8 mx-auto text-black/30 mb-2" />
        <p className="text-sm text-black/60">
          No campaigns yet. Click <strong>New campaign</strong> above to compose your
          first email.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-black/40" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns..."
          className="pl-8"
        />
      </div>
      <div className="rounded-lg border border-black/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-black/60">
            <tr>
              <th className="text-left font-medium px-3 py-2.5">Name</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-left font-medium px-3 py-2.5">Subject</th>
              <th className="text-left font-medium px-3 py-2.5">Template</th>
              <th className="text-right font-medium px-3 py-2.5">Recipients</th>
              <th className="text-left font-medium px-3 py-2.5">Created</th>
              <th className="text-right font-medium px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                <td className="px-3 py-2.5 font-medium text-black max-w-xs truncate">
                  {c.name}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-3 py-2.5 text-black/70 max-w-md truncate">
                  {c.subjectSnapshot}
                </td>
                <td className="px-3 py-2.5 text-black/60 text-xs">
                  {c.template ? (
                    <Badge variant="outline" className="font-normal text-xs">
                      {c.template.name}
                    </Badge>
                  ) : (
                    <span className="text-black/30">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-black/60">
                  {c._count.recipients > 0 ? c._count.recipients : "—"}
                </td>
                <td className="px-3 py-2.5 text-black/60 text-xs">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {c.status === "DRAFT" && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(c)}
                        className="h-7 px-2"
                        title="Edit draft"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(c)}
                        className="h-7 px-2 text-black/40 hover:text-red-600"
                        title="Delete draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {(c.status === "SENT" || c.status === "FAILED") && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(c)}
                        className="h-7 px-2"
                        title="View"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSaveAsTemplate(c)}
                        className="h-7 px-2 text-[#820A7D] hover:text-[#820A7D]"
                        title="Save as template"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {c.status === "SENDING" && (
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF005A] inline-block" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "DRAFT"
      ? "bg-black/10 text-black/60"
      : status === "SENT"
      ? "bg-[#007E72]/15 text-[#007E72]"
      : status === "SENDING"
      ? "bg-[#FF005A]/15 text-[#FF005A]"
      : status === "FAILED"
      ? "bg-red-100 text-red-700"
      : "bg-black/10 text-black/60";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${color}`}
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
  onSaved,
  onCancel,
  onRequestSaveAsTemplate,
}: {
  campaign: Campaign | null;
  templates: Template[];
  tags: { label: string; color: string | null }[];
  membersCount: number;
  adminEmail: string;
  onSaved: () => void;
  onCancel: () => void;
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
  const [fromName, setFromName] = React.useState(campaign?.fromName || "AI Salon Tel Aviv");
  const [fromEmail, setFromEmail] = React.useState(
    campaign?.fromEmail || process.env.NEXT_PUBLIC_SMTP_FROM_DEFAULT || "no-reply@aisalon.massapro.com"
  );
  const [replyTo, setReplyTo] = React.useState(campaign?.replyTo || adminEmail);
  const [showPreview, setShowPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingTemplate, setSavingTemplate] = React.useState(false);

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
    if (!name) setName(tpl.name);
    toast.success(`Loaded template "${tpl.name}"`);
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

  return (
    <div className="space-y-4 py-2">
      {/* Template picker (only for new campaigns) */}
      {!isEditing && templates.length > 0 && (
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
                  {t.name} <span className="text-black/40 ml-1">({t.category})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="cmp-body">Email body (HTML)</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowPreview((s) => !s)}
            className="h-7"
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            {showPreview ? "Edit" : "Preview"}
          </Button>
        </div>
        {showPreview ? (
          <div
            className="rounded-md border border-black/15 bg-white p-4 min-h-[260px] prose-sm max-w-none overflow-auto"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <Textarea
            id="cmp-body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            disabled={!!isFrozen}
            rows={12}
            className="font-mono text-xs"
            placeholder="<h1>Hi {{name}},</h1><p>Here's what's coming up...</p>"
          />
        )}
        <p className="text-xs text-black/50 mt-1">
          Merge fields: <code>{"{{name}}"}</code> resolves to recipient's name. HTML
          supported.
        </p>
      </div>

      {/* Recipient list selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Recipient list</Label>
          <Select
            value={listSource}
            onValueChange={setListSource}
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
            </SelectContent>
          </Select>
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

      {/* Footer actions */}
      <DialogFooter className="gap-2 flex flex-row flex-wrap justify-end items-center">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Close
        </Button>

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
      </DialogFooter>
    </div>
  );
}

function defaultBodyHtml() {
  return `<div style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Hi {{name}},</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
    Here's what's coming up at AI Salon Tel Aviv...
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
    — The AI Salon Tel Aviv team
  </p>
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #999; margin: 0;">
    AI Salon Tel Aviv · Empowering AI Connections<br/>
    <a href="https://aisalon.massapro.com" style="color: #999;">aisalon.massapro.com</a>
  </p>
</div>`;
}

// ----------------------------------------------------------------------------
// Template editor (Create template modal)
// ----------------------------------------------------------------------------

function TemplateEditor({
  template,
  onSaved,
  onCancel,
}: {
  template: Template | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(template?.name || "");
  const [category, setCategory] = React.useState(template?.category || "general");
  const [subject, setSubject] = React.useState(template?.subject || "");
  const [bodyHtml, setBodyHtml] = React.useState(template?.bodyHtml || defaultBodyHtml());
  const [showPreview, setShowPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!bodyHtml.trim()) {
      toast.error("Body is required");
      return;
    }
    setSaving(true);
    try {
      if (template) {
        // Update existing — we don't have a PATCH endpoint yet, but templates are
        // currently create-only. For now, just create a new one with the edits.
        // (Follow-up task would add PATCH /api/admin/email/templates/[id].)
        const res = await fetch("/api/admin/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            category,
            subject,
            bodyHtml,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error || "Failed to save template");
          return;
        }
        toast.success(`Saved new version of "${name}"`);
      } else {
        const res = await fetch("/api/admin/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            category,
            subject,
            bodyHtml,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error || "Failed to create template");
          return;
        }
        toast.success(`Template "${name}" created`);
      }
      onSaved();
    } catch (e) {
      toast.error("Failed to save template");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tpl-name">Template name</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Monthly newsletter"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="tpl-category">Category</Label>
          <Input
            id="tpl-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="general"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="tpl-subject">Subject</Label>
        <Input
          id="tpl-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. You're invited — AI Salon TLV"
          className="mt-1"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="tpl-body">Body (HTML)</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowPreview((s) => !s)}
            className="h-7"
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            {showPreview ? "Edit" : "Preview"}
          </Button>
        </div>
        {showPreview ? (
          <div
            className="rounded-md border border-black/15 bg-white p-4 min-h-[260px] prose-sm max-w-none overflow-auto"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <Textarea
            id="tpl-body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder="<h1>Hi {{name}},</h1>..."
          />
        )}
        <p className="text-xs text-black/50 mt-1">
          Merge field <code>{"{{name}}"}</code> resolves to recipient's name when sent.
        </p>
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
            <Save className="h-4 w-4 mr-1.5" />
          )}
          {template ? "Save new version" : "Create template"}
        </Button>
      </DialogFooter>
    </div>
  );
}

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
