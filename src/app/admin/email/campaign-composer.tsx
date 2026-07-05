"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Send,
  Calendar,
  Mail,
  Users,
  Eye,
  FileText,
  Sparkles,
  Check,
  X,
} from "lucide-react";

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

type ListSource =
  | "all_members"
  | "non_members"
  | "event_rsvp"
  | "manual_upload"
  | "specific_users";

type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string; icon: any }[] = [
  { id: 1, label: "Audience", icon: Users },
  { id: 2, label: "Template", icon: FileText },
  { id: 3, label: "Compose", icon: Mail },
  { id: 4, label: "Review & Send", icon: Send },
];

const DEFAULT_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #0a0a0a; margin-top: 24px;">
  <tr>
    <td style="padding-right: 12px; vertical-align: top;">
      <img src="https://aisalon.massapro.com/logo.png" width="48" height="48" alt="AI Salon" style="border-radius: 8px;" />
    </td>
    <td style="vertical-align: top;">
      <div style="font-weight: 700; font-size: 15px;">Ezequiel Sznaider</div>
      <div style="color: #FF005A; font-weight: 600;">Founder, AI Salon Tel Aviv</div>
      <div style="color: #666; margin-top: 4px;">
        <a href="https://aisalon.massapro.com" style="color: #004F98;">aisalon.massapro.com</a> · MassaPro
      </div>
    </td>
  </tr>
</table>`;

type Props = {
  events: Event[];
  templates: Template[];
  currentUserId: string;
  onCancel: () => void;
  onCreated: (campaign: any) => void;
};

export function CampaignComposer({
  events,
  templates,
  currentUserId,
  onCancel,
  onCreated,
}: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1: audience
  const [listSource, setListSource] = useState<ListSource>("all_members");
  const [eventId, setEventId] = useState<string>("");
  const [rsvpStatuses, setRsvpStatuses] = useState<string[]>(["GOING"]);
  const [manualEmails, setManualEmails] = useState<string>("");
  const [externalEmails, setExternalEmails] = useState<string>("");
  const [preview, setPreview] = useState<{
    total: number;
    sample: { email: string; name: string | null }[];
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Step 2: template
  const [templateId, setTemplateId] = useState<string>("");

  // Step 3: compose
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [signatureHtml, setSignatureHtml] = useState(DEFAULT_SIGNATURE_HTML);
  const [fromName, setFromName] = useState("AI Salon");
  const [fromEmail, setFromEmail] = useState("aisalon@massapro.com");
  const [replyTo, setReplyTo] = useState("eze@massapro.com");

  // Step 4: review
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>("");

  // Compute listConfig from current selections
  function buildListConfig(): any {
    switch (listSource) {
      case "event_rsvp":
        return { eventId, rsvpStatuses };
      case "manual_upload":
        return {
          emails: manualEmails
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        };
      case "non_members":
        return {
          externalEmails: externalEmails
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        };
      default:
        return {};
    }
  }

  // Preview list count
  async function fetchPreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/admin/email/preview-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: listSource,
          config: buildListConfig(),
          sampleSize: 10,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setPreview(data);
    } catch {
      toast.error("Failed to preview list");
    } finally {
      setPreviewing(false);
    }
  }

  // Load template when templateId changes
  async function loadTemplate(id: string) {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/email/templates`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const tpl = data.templates.find((t: any) => t.id === id);
      if (tpl) {
        setSubject(tpl.subject);
        setBodyHtml(tpl.bodyHtml);
        if (tpl.signatureHtml) setSignatureHtml(tpl.signatureHtml);
        toast.success(`Loaded template: ${tpl.name}`);
      }
    } catch {
      toast.error("Failed to load template");
    }
  }

  // Auto-preview when audience changes
  useEffect(() => {
    if (step === 1) fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listSource, eventId, rsvpStatuses, manualEmails, externalEmails, step]);

  function canProceed(): boolean {
    if (step === 1) {
      if (listSource === "event_rsvp" && !eventId) return false;
      if (listSource === "manual_upload" && !manualEmails.trim()) return false;
      return true;
    }
    if (step === 2) return true; // template is optional
    if (step === 3) return name.trim() && subject.trim() && bodyHtml.trim() ? true : false;
    return true;
  }

  async function createCampaign(): Promise<string | null> {
    // Returns the new campaign ID, or null on failure
    try {
      const res = await fetch("/api/admin/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          templateId: templateId || undefined,
          subject,
          bodyHtml,
          signatureHtml,
          listSource,
          listConfig: buildListConfig(),
          fromName,
          fromEmail,
          replyTo,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      const data = await res.json();
      return data.campaign.id;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create campaign");
      return null;
    }
  }

  async function handleTestSend() {
    setSending(true);
    const id = await createCampaign();
    if (!id) {
      setSending(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/email/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testOnly: true,
          testEmail: replyTo || "eze@massapro.com",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.result.sent > 0) {
        toast.success(`Test email sent to ${replyTo || "eze@massapro.com"}`);
        onCreated({ id, name, status: "DRAFT", subjectSnapshot: subject, ...{} });
      } else {
        toast.error(`Test send failed: ${data.result.error || "unknown error"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test");
    } finally {
      setSending(false);
    }
  }

  async function handleSendNow() {
    setSending(true);
    const id = await createCampaign();
    if (!id) {
      setSending(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/email/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(
        `Campaign sent: ${data.result.sent} sent, ${data.result.failed} failed` +
          (data.result.remaining > 0
            ? ` (${data.result.remaining} remaining — cron will continue)`
            : "")
      );
      onCreated({ id, name, status: "SENT", subjectSnapshot: subject });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledAt) {
      toast.error("Pick a date and time first");
      return;
    }
    setScheduling(true);
    const id = await createCampaign();
    if (!id) {
      setScheduling(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/email/campaigns/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(
        `Scheduled for ${new Date(scheduledAt).toLocaleString()} (${data.recipientCount} recipients)`
      );
      onCreated({ id, name, status: "SCHEDULED", subjectSnapshot: subject });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header + steps */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold">New campaign</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive
                    ? "bg-black text-white"
                    : isDone
                    ? "bg-[#007E72]/10 text-[#007E72]"
                    : "bg-black/5 text-black/50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {s.label}
                {isDone && <Check className="h-3 w-3" />}
              </div>
              {idx < STEPS.length - 1 && (
                <ArrowRight className="h-4 w-4 mx-1 text-black/30" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step body */}
      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold">Who should receive this?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <ListSourceCard
              selected={listSource === "all_members"}
              onClick={() => setListSource("all_members")}
              title="All members"
              description="All platform users with at least one member tag."
              icon={Users}
            />
            <ListSourceCard
              selected={listSource === "non_members"}
              onClick={() => setListSource("non_members")}
              title="Non-members"
              description="DB users without any member tag + any external emails you add."
              icon={Users}
            />
            <ListSourceCard
              selected={listSource === "event_rsvp"}
              onClick={() => setListSource("event_rsvp")}
              title="Event RSVP"
              description="Users who RSVP'd to a specific event (filterable by status)."
              icon={Calendar}
            />
            <ListSourceCard
              selected={listSource === "manual_upload"}
              onClick={() => setListSource("manual_upload")}
              title="Manual upload"
              description="Paste a list of emails (comma- or newline-separated)."
              icon={Mail}
            />
            <ListSourceCard
              selected={listSource === "specific_users"}
              onClick={() => setListSource("specific_users")}
              title="Specific users"
              description="Pick individual users from the platform. (Use the picker below.)"
              icon={Users}
            />
          </div>

          {/* Conditional config per source */}
          {listSource === "event_rsvp" && (
            <div className="space-y-3 p-4 bg-black/[0.02] rounded-md">
              <div>
                <Label>Event</Label>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-black/20 rounded-md bg-white"
                >
                  <option value="">— Pick an event —</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({new Date(e.startsAt).toLocaleDateString()}) —{" "}
                      {e._count.rsvps} RSVPs
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>RSVP statuses to include</Label>
                <div className="flex gap-3 mt-2">
                  {["GOING", "MAYBE", "WAITLIST", "NOT_GOING"].map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={rsvpStatuses.includes(s)}
                        onCheckedChange={(c) => {
                          if (c) setRsvpStatuses([...rsvpStatuses, s]);
                          else setRsvpStatuses(rsvpStatuses.filter((x) => x !== s));
                        }}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {listSource === "manual_upload" && (
            <div className="space-y-2">
              <Label>Emails (one per line, or comma-separated)</Label>
              <Textarea
                rows={6}
                placeholder={"alice@example.com\nbob@example.com, carol@example.com"}
                value={manualEmails}
                onChange={(e) => setManualEmails(e.target.value)}
              />
              <p className="text-xs text-black/50">
                You can also use the format "Name &lt;email@example.com&gt;" to include
                a name with each email.
              </p>
            </div>
          )}

          {listSource === "non_members" && (
            <div className="space-y-2">
              <Label>Additional external emails (optional)</Label>
              <Textarea
                rows={4}
                placeholder={"alice@example.com\nbob@example.com"}
                value={externalEmails}
                onChange={(e) => setExternalEmails(e.target.value)}
              />
              <p className="text-xs text-black/50">
                These will be merged with DB users that have no member tags.
                Duplicates are removed automatically.
              </p>
            </div>
          )}

          {/* Preview */}
          <div className="p-4 bg-[#004F98]/5 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm">
                Recipients preview{" "}
                {preview && (
                  <Badge className="ml-2 bg-[#004F98] text-white">
                    {preview.total} total
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={fetchPreview} disabled={previewing}>
                {previewing ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Eye className="h-3 w-3 mr-1" />
                )}
                Refresh
              </Button>
            </div>
            {preview && preview.sample.length > 0 ? (
              <div className="text-xs space-y-1">
                {preview.sample.map((r, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{r.email}</span>
                    {r.name && <span className="text-black/80">{r.name}</span>}
                  </div>
                ))}
                {preview.total > preview.sample.length && (
                  <div className="text-black/80 pt-1">
                    + {preview.total - preview.sample.length} more
                  </div>
                )}
              </div>
            ) : preview ? (
              <p className="text-xs text-black/80">No recipients match this list.</p>
            ) : null}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Pick a template (optional)</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTemplateId("");
                setStep(3);
              }}
            >
              Skip <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <p className="text-sm text-black/80">
            Start from a saved template to reuse the subject, body, and signature.
            You'll be able to edit everything in the next step.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.length === 0 ? (
              <div className="col-span-full text-center p-8 text-black/50 text-sm">
                No templates saved yet. Skip this step to compose from scratch —
                you can save your email as a template after.
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`text-left p-4 rounded-md border-2 transition-all ${
                    templateId === t.id
                      ? "border-[#FF005A] bg-[#FF005A]/5"
                      : "border-black/10 hover:border-black/30 bg-white"
                  }`}
                >
                  <div className="font-semibold text-sm">{t.name}</div>
                  <div className="text-xs text-black/80 mt-1 line-clamp-2">{t.subject}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className="bg-black/5 text-black/80 text-[0.6rem]">{t.category}</Badge>
                    <span className="text-[0.6rem] text-black/80">
                      {t._count.campaigns} campaign{t._count.campaigns === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
          {templateId && (
            <Button onClick={() => loadTemplate(templateId)}>
              <Check className="h-4 w-4 mr-1" /> Load template & continue
            </Button>
          )}
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold">Compose the email</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Campaign name (internal)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Feb 2026 Event Invite"
              />
            </div>
            <div>
              <Label>From name</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>From email</Label>
              <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
            </div>
            <div>
              <Label>Reply-to</Label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. You're invited — AI Salon Tel Aviv #3"
            />
            <p className="text-xs text-black/50 mt-1">
              Merge tags: <code>{"{{first_name}}"}</code> <code>{"{{full_name}}"}</code>{" "}
              <code>{"{{email}}"}</code>
            </p>
          </div>

          <div>
            <Label>Email body (HTML)</Label>
            <Textarea
              rows={14}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="<h1>Hi {{first_name}},</h1><p>You're invited to...</p>"
              className="font-mono text-xs"
            />
            <p className="text-xs text-black/50 mt-1">
              Write HTML directly. All <code>&lt;a href="https://..."&gt;</code> links are
              automatically wrapped in click-tracking. The open-tracking pixel and
              unsubscribe footer are added at send time.
            </p>
          </div>

          <div>
            <Label>Signature (HTML, appended at end)</Label>
            <Textarea
              rows={6}
              value={signatureHtml}
              onChange={(e) => setSignatureHtml(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="p-4 bg-black/[0.02] rounded-md">
            <div className="font-semibold text-sm mb-2 flex items-center gap-1">
              <Sparkles className="h-4 w-4" /> Quick preview
            </div>
            <div
              className="bg-white border border-black/10 rounded-md p-4 text-sm overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: bodyHtml + (signatureHtml ? `<div>${signatureHtml}</div>` : "") }}
            />
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold">Review & send</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <ReviewItem label="Campaign name" value={name} />
            <ReviewItem label="Audience" value={listSource.replace("_", " ")} />
            <ReviewItem label="Recipients" value={preview?.total?.toString() ?? "—"} />
            <ReviewItem label="From" value={`${fromName} <${fromEmail}>`} />
            <ReviewItem label="Reply-to" value={replyTo} />
            <ReviewItem label="Subject" value={subject} />
          </div>

          <div className="p-4 bg-black/[0.02] rounded-md">
            <div className="font-semibold text-sm mb-2">Body preview</div>
            <div
              className="bg-white border border-black/10 rounded-md p-4 text-sm overflow-x-auto max-h-72"
              dangerouslySetInnerHTML={{
                __html: bodyHtml + (signatureHtml ? `<div>${signatureHtml}</div>` : ""),
              }}
            />
          </div>

          {/* Send options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={handleTestSend}
              disabled={sending}
              className="h-auto py-4 flex flex-col items-center gap-1"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mail className="h-5 w-5" />
              )}
              <span className="font-semibold">Send test</span>
              <span className="text-xs text-black/50">to {replyTo}</span>
            </Button>

            <Button
              onClick={handleSendNow}
              disabled={sending}
              className="h-auto py-4 flex flex-col items-center gap-1 bg-[#FF005A] hover:bg-[#FF005A]/90"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              <span className="font-semibold">Send now</span>
              <span className="text-xs opacity-80">to all {preview?.total ?? 0} recipients</span>
            </Button>

            <div className="p-3 border-2 border-black/10 rounded-md flex flex-col gap-2">
              <div className="flex items-center gap-1 text-sm font-semibold">
                <Calendar className="h-4 w-4" /> Schedule
              </div>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="text-xs"
              />
              <Button
                size="sm"
                onClick={handleSchedule}
                disabled={scheduling || !scheduledAt}
              >
                {scheduling ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Calendar className="h-3 w-3 mr-1" />
                )}
                Schedule
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Footer nav */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 1 ? onCancel() : setStep((step - 1) as Step))}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        {step < 4 && (
          <Button onClick={() => setStep((step + 1) as Step)} disabled={!canProceed()}>
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ListSourceCard({
  selected,
  onClick,
  title,
  description,
  icon: Icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  icon: any;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-md border-2 transition-all ${
        selected
          ? "border-[#FF005A] bg-[#FF005A]/5"
          : "border-black/10 hover:border-black/30 bg-white"
      }`}
    >
      <Icon className="h-5 w-5 mb-2" />
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-black/80 mt-1">{description}</div>
    </button>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-black/[0.02] rounded-md">
      <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
        {label}
      </div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
