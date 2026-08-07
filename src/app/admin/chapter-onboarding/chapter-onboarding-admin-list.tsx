"use client";

/**
 * ChapterOnboardingAdminList — client component showing all chapter
 * onboarding invites in a filterable table. Clicking a row opens a
 * detail dialog with the full submission.
 */

import { useState, useMemo } from "react";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Search, Copy, ExternalLink, Clock, CheckCircle2, AlertCircle,
  Mail, Globe2, MessageCircle, Users, Calendar, Loader2, Rocket,
  AlertTriangle,
} from "lucide-react";
import type { ChapterOnboardingFormData } from "@/lib/chapter-onboarding-types";

type Invite = {
  id: string;
  token: string;
  status: string;
  inviteeEmail: string;
  inviteeName: string | null;
  prefillChapterName: string | null;
  prefillChapterSlug: string | null;
  sentAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
  appliedChapterId: string | null;
  appliedAt: string | null;
  submissionJson: string | null;
  invitedByName: string | null;
  userId: string;
};

export function ChapterOnboardingAdminList({
  invites,
}: {
  invites: Invite[];
  currentAdminEmail: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<Invite | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invites.filter((i) => {
      if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.inviteeEmail.toLowerCase().includes(q) ||
        i.inviteeName?.toLowerCase().includes(q) ||
        i.prefillChapterName?.toLowerCase().includes(q) ||
        i.prefillChapterSlug?.toLowerCase().includes(q) ||
        i.token.toLowerCase().includes(q)
      );
    });
  }, [invites, query, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: invites.length, PENDING: 0, SUBMITTED: 0, EXPIRED: 0, REVOKED: 0 };
    for (const i of invites) {
      // Auto-expire
      const effective =
        i.status === "PENDING" && new Date(i.expiresAt) < new Date() ? "EXPIRED" : i.status;
      c[effective] = (c[effective] || 0) + 1;
    }
    return c;
  }, [invites]);

  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://aisalon.massapro.com";

  // Provisioning state lives at the list level so the button inside the
  // detail dialog can drive it.
  const [provisioning, setProvisioning] = useState(false);
  const [provisionedChapterId, setProvisionedChapterId] = useState<string | null>(null);
  // Confirmation gate: when set, the AlertDialog is open and the user is
  // reviewing the provisioning summary before clicking "Confirm".
  const [confirmTarget, setConfirmTarget] = useState<Invite | null>(null);

  const handleProvisionRequest = (invite: Invite) => {
    // Open the confirmation dialog — the actual fetch runs in confirmProvision.
    setConfirmTarget(invite);
  };

  const confirmProvision = async () => {
    const invite = confirmTarget;
    if (!invite) return;
    // Close the confirmation dialog immediately so the user sees the
    // underlying detail dialog with the "Provisioning…" spinner state.
    setConfirmTarget(null);
    setProvisioning(true);
    const t = toast.loading("Provisioning chapter…");
    try {
      const res = await fetch(`/api/admin/chapter-onboarding/${invite.id}/provision`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      // Build a richer success message that reflects whether the lead
      // notification email was sent. The provisioning itself succeeded
      // regardless — email failure is non-fatal.
      const notify = d?.lead?.notificationEmail;
      if (notify?.ok) {
        toast.success(
          `Chapter "${d.chapter.name}" provisioned! Notification email sent to ${notify.sentTo}.`,
          { id: t, duration: 9000 },
        );
      } else if (notify && !notify.ok) {
        toast.warning(
          `Chapter "${d.chapter.name}" provisioned, but the notification email couldn't be sent (${notify.error || "unknown error"}). The lead can still be reached via the original onboarding email.`,
          { id: t, duration: 12000 },
        );
      } else {
        toast.success(`Chapter "${d.chapter.name}" provisioned!`, { id: t, duration: 8000 });
      }
      setProvisionedChapterId(d.chapter.id);
      // Reload after a short delay so the new state (appliedChapterId) shows up.
      setTimeout(() => window.location.reload(), 2500);
    } catch (err) {
      toast.error(`Provision failed: ${err instanceof Error ? err.message : String(err)}`, {
        id: t,
        duration: 10000,
      });
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by email, name, chapter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(["ALL", "PENDING", "SUBMITTED", "EXPIRED"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className={
                statusFilter === s
                  ? "bg-slate-900 text-white hover:bg-slate-900/90"
                  : "text-slate-700"
              }
            >
              {s} <span className="ml-1.5 text-xs opacity-70">({counts[s] || 0})</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Chapter</th>
                  <th className="px-4 py-3 font-medium">Invitee</th>
                  <th className="px-4 py-3 font-medium">Sent by</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      {invites.length === 0
                        ? "No chapter onboarding invites yet. Send one from a member's edit dialog."
                        : "No invites match your filter."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((i) => {
                    const effective =
                      i.status === "PENDING" && new Date(i.expiresAt) < new Date()
                        ? "EXPIRED"
                        : i.status;
                    const submission: ChapterOnboardingFormData | null =
                      i.submissionJson ? JSON.parse(i.submissionJson) : null;
                    return (
                      <tr
                        key={i.id}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => setSelected(i)}
                      >
                        <td className="px-4 py-3">
                          <StatusBadge status={effective} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {submission?.chapterName || i.prefillChapterName || "—"}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            {submission?.chapterSlug || i.prefillChapterSlug || ""}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900">{i.inviteeName || "—"}</div>
                          <div className="text-xs text-slate-500">{i.inviteeEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {i.invitedByName || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {new Date(i.sentAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {i.submittedAt
                            ? new Date(i.submittedAt).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                              })
                            : "—"}
                          {i.appliedChapterId && (
                            <Badge className="ml-1.5 bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[0.65rem]">
                              Provisioned
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => {
                                const url = `${siteUrl}/chapter-onboarding/${i.token}`;
                                navigator.clipboard.writeText(url);
                                toast.success("Form URL copied");
                              }}
                              title="Copy form URL"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => window.open(`${siteUrl}/chapter-onboarding/${i.token}`, "_blank")}
                              title="Open form"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <InviteDetailDialog
        invite={selected}
        onClose={() => setSelected(null)}
        siteUrl={siteUrl}
        onProvision={handleProvisionRequest}
        provisioning={provisioning}
        provisionedChapterId={provisionedChapterId}
      />

      {/* Provisioning confirmation dialog — gated by `confirmTarget`. The
          actual provision fetch only runs after the user clicks "Confirm
          & Provision chapter" below. */}
      <ProvisionConfirmDialog
        invite={confirmTarget}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={confirmProvision}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PENDING":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
          <Clock className="w-3 h-3 mr-1" /> Pending
        </Badge>
      );
    case "SUBMITTED":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Submitted
        </Badge>
      );
    case "EXPIRED":
      return (
        <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-0">
          <AlertCircle className="w-3 h-3 mr-1" /> Expired
        </Badge>
      );
    case "REVOKED":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">
          <AlertCircle className="w-3 h-3 mr-1" /> Revoked
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function InviteDetailDialog({
  invite, onClose, siteUrl, onProvision, provisioning, provisionedChapterId,
}: {
  invite: Invite | null;
  onClose: () => void;
  siteUrl: string;
  onProvision: (invite: Invite) => void;
  provisioning: boolean;
  provisionedChapterId: string | null;
}) {
  if (!invite) return null;
  const submission: ChapterOnboardingFormData | null =
    invite.submissionJson ? JSON.parse(invite.submissionJson) : null;
  const formUrl = `${siteUrl}/chapter-onboarding/${invite.token}`;

  const effectiveStatus =
    invite.status === "PENDING" && new Date(invite.expiresAt) < new Date()
      ? "EXPIRED"
      : invite.status;
  const canProvision = effectiveStatus === "SUBMITTED" && !invite.appliedChapterId;
  const alreadyProvisioned = !!invite.appliedChapterId;

  return (
    <Dialog open={!!invite} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-[#820A7D]" />
            Onboarding submission
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {invite.inviteeName || invite.inviteeEmail} · sent{" "}
            {new Date(invite.sentAt).toLocaleDateString()}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status + meta */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={effectiveStatus} />
            <span className="text-xs text-slate-500">
              Expires {new Date(invite.expiresAt).toLocaleDateString()}
            </span>
            {invite.openedAt && (
              <span className="text-xs text-slate-500">
                · Opened {new Date(invite.openedAt).toLocaleDateString()}
              </span>
            )}
            {invite.submittedAt && (
              <span className="text-xs text-slate-500">
                · Submitted {new Date(invite.submittedAt).toLocaleDateString()}
              </span>
            )}
            {alreadyProvisioned && invite.appliedAt && (
              <span className="text-xs text-green-700 font-medium">
                · ✅ Provisioned {new Date(invite.appliedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Form URL */}
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 space-y-2">
            <div className="text-xs font-medium text-slate-700">Form URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-slate-200 px-2 py-1.5 rounded font-mono break-all">
                {formUrl}
              </code>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(formUrl);
                  toast.success("URL copied");
                }}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => window.open(formUrl, "_blank")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Submission data */}
          {submission ? (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Submission
              </h3>

              <SubmissionSection
                icon={<Globe2 className="w-4 h-4" />}
                title="Chapter Basics"
                rows={[
                  ["Chapter name", submission.chapterName],
                  ["Slug", submission.chapterSlug],
                  ["Country", submission.country],
                  ["City", submission.city],
                  ["Timezone", submission.timezone],
                ]}
              />

              <SubmissionSection
                icon={<MessageCircle className="w-4 h-4" />}
                title="Contact Channels"
                rows={[
                  ["WhatsApp URL", submission.whatsappGroupUrl],
                  ["LinkedIn URL", submission.linkedinUrl],
                  ["Other socials", submission.otherSocials],
                ]}
              />

              <SubmissionSection
                icon={<Users className="w-4 h-4" />}
                title="Languages & Audience"
                rows={[
                  ["Primary language", submission.primaryLanguage],
                  ["Secondary language", submission.secondaryLanguage],
                  ["Audience", submission.targetAudience.join(", ")],
                  ["Seniority", submission.audienceSeniority],
                  ["Tagline", submission.chapterTagline],
                  ["Description", submission.chapterDescription],
                ]}
              />

              {submission.faviconUrl || submission.loginHeroUrl || submission.loginBannerUrl || submission.landingHeroUrl ? (
                <SubmissionSection
                  icon={<Globe2 className="w-4 h-4" />}
                  title="Brand Assets"
                  rows={[
                    ["Favicon", submission.faviconUrl],
                    ["Login hero", submission.loginHeroUrl],
                    ["Login banner", submission.loginBannerUrl],
                    ["Landing hero", submission.landingHeroUrl],
                    ["Primary color", submission.brandColorPrimary],
                    ["Secondary color", submission.brandColorSecondary],
                  ]}
                />
              ) : null}

              {submission.fromName || submission.fromEmail || submission.emailLogoUrl ? (
                <SubmissionSection
                  icon={<Mail className="w-4 h-4" />}
                  title="Email Config"
                  rows={[
                    ["From name", submission.fromName],
                    ["From email", submission.fromEmail],
                    ["Reply-to", submission.replyToEmail],
                    ["Email logo", submission.emailLogoUrl],
                    ["Template notes", submission.emailTemplateOverrides],
                  ]}
                />
              ) : null}

              <SubmissionSection
                icon={<Users className="w-4 h-4" />}
                title="Lead Info"
                rows={[
                  ["Name", submission.leadName],
                  ["Email", submission.leadEmail],
                  ["Phone", submission.leadPhone],
                  ["Role", submission.leadRole],
                  ["LinkedIn", submission.leadLinkedinUrl],
                  ["Co-leads", submission.coLeads],
                ]}
              />

              {submission.targetLaunchDate || submission.firstEventDate ? (
                <SubmissionSection
                  icon={<Calendar className="w-4 h-4" />}
                  title="Launch Plan"
                  rows={[
                    ["Target launch date", submission.targetLaunchDate],
                    ["First event date", submission.firstEventDate],
                    ["First event title", submission.firstEventTitle],
                    ["First event venue", submission.firstEventVenue],
                    ["Expected attendance", submission.firstEventExpectedAttendance],
                    ["Frequency", submission.eventFrequency],
                    ["Day/time", submission.typicalEventDayTime],
                    ["Format", submission.typicalEventFormat],
                  ]}
                />
              ) : null}

              {submission.operationalNotes || submission.culturalConsiderations || submission.partnershipOpportunities || submission.openQuestions ? (
                <SubmissionSection
                  icon={<Mail className="w-4 h-4" />}
                  title="Additional Notes"
                  rows={[
                    ["Operational notes", submission.operationalNotes],
                    ["Cultural considerations", submission.culturalConsiderations],
                    ["Partnership opportunities", submission.partnershipOpportunities],
                    ["Open questions", submission.openQuestions],
                  ]}
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <Clock className="w-4 h-4 inline mr-1" />
              This invite hasn&apos;t been submitted yet. The chapter lead will see a
              form when they open the link.
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {alreadyProvisioned && invite.appliedChapterId ? (
            <a
              href={`/admin/chapters/${invite.appliedChapterId}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900/90"
            >
              <ExternalLink className="w-4 h-4" />
              Open chapter admin
            </a>
          ) : canProvision ? (
            <Button
              disabled={provisioning}
              onClick={() => onProvision(invite)}
              className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white font-semibold"
            >
              {provisioning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Provisioning…</>
              ) : (
                <><Rocket className="w-4 h-4 mr-2" /> Approve &amp; Provision…</>
              )}
            </Button>
          ) : null}
          {provisionedChapterId && (
            <span className="text-xs text-green-700">
              ✅ Chapter created — page reloading…
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmissionSection({
  icon, title, rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: [string, string | undefined][];
}) {
  const filled = rows.filter(([, v]) => v && v.trim());
  if (filled.length === 0) return null;
  return (
    <div className="rounded-md border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
        <div className="text-slate-600">{icon}</div>
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      </div>
      <div className="divide-y divide-slate-100">
        {filled.map(([label, value]) => (
          <div key={label} className="px-3 py-2 grid grid-cols-3 gap-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 self-start mt-0.5">
              {label}
            </div>
            <div className="col-span-2 text-slate-900 break-words whitespace-pre-wrap">
              {isImageUrl(value) ? (
                <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={value}
                    alt={label}
                    className="w-16 h-16 object-contain rounded border border-slate-200 bg-white"
                  />
                  <span className="text-xs text-slate-500 group-hover:text-slate-700 group-hover:underline break-all">
                    {value.split("/").pop()}
                  </span>
                </a>
              ) : (
                value
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Heuristic: returns true if the value looks like an image URL we can
 * preview inline (http(s):// + image file extension). Used by
 * SubmissionSection to render uploaded brand images as thumbnails in the
 * admin review dialog.
 */
function isImageUrl(value: string | undefined): value is string {
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  return /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(value);
}

/**
 * ProvisionConfirmDialog — modal "are you sure?" gate before the
 * Approve & Provision action actually fires.
 *
 * Shows a concise summary of what will be created:
 *   - Chapter name + slug
 *   - Country + city
 *   - Lead email + role to be assigned (CHAPTER_ORGANIZER)
 *   - Brand images uploaded vs falling back to defaults
 *   - Email infra clone summary
 *
 * Confirms via the destructive-styled "Confirm & Provision chapter"
 * button. Cancel closes the dialog without calling onConfirm.
 *
 * Uses AlertDialog (not Dialog) because this is a destructive /
 * non-reversible action — Radix AlertDialog blocks pointer events
 * outside the dialog and is the platform-correct pattern for
 * confirmation modals.
 */
function ProvisionConfirmDialog({
  invite,
  onCancel,
  onConfirm,
}: {
  invite: Invite | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!invite) return null;
  const submission: ChapterOnboardingFormData | null =
    invite.submissionJson ? JSON.parse(invite.submissionJson) : null;
  if (!submission) {
    // Defensive: should never happen because the trigger button is only
    // shown for SUBMITTED invites. If we ever get here, just bail.
    return null;
  }

  // Brand-image summary — which were uploaded vs which fall back to defaults.
  const brandImages: Array<{ label: string; uploaded: boolean }> = [
    { label: "Favicon", uploaded: !!submission.faviconUrl },
    { label: "Login hero", uploaded: !!submission.loginHeroUrl },
    { label: "Login banner", uploaded: !!submission.loginBannerUrl },
    { label: "Landing hero", uploaded: !!submission.landingHeroUrl },
    { label: "Email logo", uploaded: !!submission.emailLogoUrl },
  ];
  const uploadedCount = brandImages.filter((b) => b.uploaded).length;
  const defaultCount = brandImages.length - uploadedCount;

  const summaryRows: Array<[string, string]> = [
    ["Chapter name", submission.chapterName],
    ["Slug", submission.chapterSlug],
    ["Country", submission.country],
    ["City", submission.city || "—"],
    ["Timezone", submission.timezone],
    ["Lead email", submission.leadEmail],
    ["Lead name", submission.leadName || "—"],
    ["WhatsApp URL", submission.whatsappGroupUrl ? "✓ provided" : "—"],
    ["LinkedIn URL", submission.linkedinUrl ? "✓ provided" : "—"],
  ];

  return (
    <AlertDialog open={!!invite} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Approve &amp; Provision chapter?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                This will <strong className="text-slate-900">permanently create a new chapter</strong>{" "}
                on the platform from this onboarding submission. The action is
                not reversible — once provisioned, the chapter is live at{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono">
                  /c/{submission.chapterSlug}
                </code>{" "}
                and the lead is granted admin access.
              </p>

              <div className="rounded-md border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Will be created
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {summaryRows.map(([label, value]) => (
                    <div key={label} className="px-3 py-1.5 grid grid-cols-3 gap-3 text-xs">
                      <div className="font-medium uppercase tracking-wider text-slate-500">
                        {label}
                      </div>
                      <div className="col-span-2 text-slate-900 break-words">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Brand images · {uploadedCount} uploaded, {defaultCount} defaults
                  </h4>
                </div>
                <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {brandImages.map((b) => (
                    <div key={b.label} className="flex items-center gap-1.5">
                      {b.uploaded ? (
                        <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                      ) : (
                        <span className="w-3 h-3 flex-shrink-0 text-slate-400 text-center leading-none">·</span>
                      )}
                      <span className="text-slate-700">{b.label}</span>
                      <span className="text-slate-400 ml-auto">
                        {b.uploaded ? "uploaded" : "default"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                <Rocket className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                After provisioning, the lead will receive a{" "}
                <strong>&quot;chapter is live&quot;</strong> notification email with
                a link to the admin dashboard. Email audiences, flows, and draft
                campaigns will be cloned from the Tel Aviv source chapter.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white font-semibold"
          >
            <Rocket className="w-4 h-4 mr-2" />
            Confirm &amp; Provision chapter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
