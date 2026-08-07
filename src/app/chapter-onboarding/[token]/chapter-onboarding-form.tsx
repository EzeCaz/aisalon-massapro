"use client";

/**
 * ChapterOnboardingForm — client component for the public chapter lead
 * onboarding form at /chapter-onboarding/[token].
 *
 * Multi-section form, single page (no stepper — the form is short enough
 * that one scrollable page with section headings is more usable than a
 * 9-step wizard). Sections match the DOCX onboarding form:
 *   1. Chapter Basics
 *   2. Contact channels (WhatsApp URL, LinkedIn, chapter name — top 3)
 *   3. Languages & Audience
 *   4. Brand assets (URLs)
 *   5. Email config
 *   6. Lead info (pre-filled from invite)
 *   7. Launch plan
 *   8. Additional notes
 *
 * Validation: required fields marked with *. On submit, we POST to
 * /api/chapter-onboarding/[token]. On success, show a thank-you view.
 */

import { useState, FormEvent, useRef } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Globe2, MessageCircle, Users, Image as ImageIcon,
  Mail, Calendar, FileText, Send, Loader2, CheckCircle2,
  Upload,
} from "lucide-react";
import {
  AUDIENCE_OPTIONS, COMMON_TIMEZONES, COMMON_LANGUAGES,
  type ChapterOnboardingFormData,
} from "@/lib/chapter-onboarding-types";

type Props = {
  token: string;
  inviteeName: string | null;
  inviteeEmail: string;
  prefillChapterName: string | null;
  prefillChapterSlug: string | null;
  expiresAt: Date;
};

export function ChapterOnboardingForm({
  token, inviteeName, inviteeEmail,
  prefillChapterName, prefillChapterSlug, expiresAt,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [data, setData] = useState<ChapterOnboardingFormData>({
    chapterName: prefillChapterName ?? "",
    chapterSlug: prefillChapterSlug ?? "",
    country: "",
    city: "",
    timezone: "Asia/Jerusalem",
    whatsappGroupUrl: "",
    linkedinUrl: "",
    primaryLanguage: "en",
    secondaryLanguage: "",
    targetAudience: [],
    leadName: inviteeName ?? "",
    leadEmail: inviteeEmail,
  });

  const set = <K extends keyof ChapterOnboardingFormData>(
    key: K,
    value: ChapterOnboardingFormData[K],
  ) => setData((prev) => ({ ...prev, [key]: value }));

  const toggleAudience = (label: string) => {
    setData((prev) => ({
      ...prev,
      targetAudience: prev.targetAudience.includes(label)
        ? prev.targetAudience.filter((x) => x !== label)
        : [...prev.targetAudience, label],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const t = toast.loading("Submitting your onboarding form…");

    try {
      const res = await fetch(`/api/chapter-onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      toast.success("Onboarding form submitted!", { id: t });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error((err as Error).message, { id: t, duration: 8000 });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-xl text-slate-900">
                You&apos;re all set, {inviteeName?.split(" ")[0] || "there"}!
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                We received your onboarding form for{" "}
                <span className="font-semibold text-slate-700">{data.chapterName}</span>.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
            The global AI Salon team will review your submission within 2
            business days. We&apos;ll reach out to{" "}
            <span className="font-medium">{inviteeEmail}</span> with next steps
            and your admin access.
          </div>
          <p className="text-xs text-slate-500">
            Need to make changes? Just reply to the original onboarding email,
            or reach us at{" "}
            <a href="mailto:aisalon@massapro.com" className="text-slate-700 underline">
              aisalon@massapro.com
            </a>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const expiresLabel = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Chapter Onboarding Form
        </h1>
        <p className="text-base text-slate-600 max-w-xl mx-auto">
          Welcome to the AI Salon global community! Fill out this form once and
          we&apos;ll provision your chapter — landing page, login page, brand
          assets, email templates, everything.
        </p>
        <p className="text-xs text-slate-400">
          For {inviteeName || inviteeEmail} · ⏱️ ~10–15 minutes · 🔒 Private
          to you + the global team · Link expires {expiresLabel}
        </p>
      </div>

      {/* ─── Section 1: Chapter Basics ─────────────────────────────────── */}
      <SectionCard
        icon={<Globe2 className="w-5 h-5" />}
        title="Chapter Basics"
        description="The core identity of your chapter. Powers the public landing page and login page."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Chapter name" required>
            <Input
              required
              value={data.chapterName}
              onChange={(e) => set("chapterName", e.target.value)}
              placeholder="e.g. Tel Aviv, Montreal, São Paulo"
            />
          </Field>
          <Field label="URL slug" required hint="lowercase, hyphenated — used in URLs">
            <Input
              required
              value={data.chapterSlug}
              onChange={(e) => set("chapterSlug", e.target.value
                .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
              placeholder="e.g. tel-aviv, mtl, sao-paulo"
              className="font-mono"
            />
          </Field>
          <Field label="Country" required>
            <Input
              required
              value={data.country}
              onChange={(e) => set("country", e.target.value)}
              placeholder="e.g. Israel, Canada, Brazil"
            />
          </Field>
          <Field label="City">
            <Input
              value={data.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="e.g. Tel Aviv-Yafo, Montréal"
            />
          </Field>
          <Field label="Timezone" required>
            <select
              required
              value={data.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* ─── Section 2: Contact Channels (TOP 3 emphasized) ───────────── */}
      <SectionCard
        icon={<MessageCircle className="w-5 h-5" />}
        title="Contact Channels"
        description="The top 3 fields — fill these in first and the global team can start setup immediately."
        emphasis
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="WhatsApp group URL" required>
            <Input
              required
              type="url"
              value={data.whatsappGroupUrl}
              onChange={(e) => set("whatsappGroupUrl", e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
            />
          </Field>
          <Field label="LinkedIn page URL" required>
            <Input
              required
              type="url"
              value={data.linkedinUrl}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              placeholder="https://www.linkedin.com/showcase/ai-salon-..."
            />
          </Field>
        </div>
        <Field label="Other social channels" hint="Instagram, X, Telegram, YouTube, etc. — admin will configure manually">
          <Input
            value={data.otherSocials ?? ""}
            onChange={(e) => set("otherSocials", e.target.value)}
            placeholder="@aisalon.mtl on Instagram, t.me/aisalon_mtl, ..."
          />
        </Field>
      </SectionCard>

      {/* ─── Section 3: Languages & Audience ───────────────────────────── */}
      <SectionCard
        icon={<Users className="w-5 h-5" />}
        title="Languages & Audience"
        description="Bilingual chapters (e.g. Montreal EN+FR) are fully supported."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Primary language" required>
            <select
              required
              value={data.primaryLanguage}
              onChange={(e) => set("primaryLanguage", e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
            >
              {COMMON_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Secondary language" hint="leave blank if monolingual">
            <select
              value={data.secondaryLanguage ?? ""}
              onChange={(e) => set("secondaryLanguage", e.target.value || undefined)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
            >
              <option value="">— none —</option>
              {COMMON_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Separator className="my-4" />

        <Label className="text-sm font-medium text-slate-900 mb-3 block">
          Target audience <span className="text-slate-400 font-normal">(check all that apply)</span>
        </Label>
        <div className="grid sm:grid-cols-2 gap-2">
          {AUDIENCE_OPTIONS.map((label) => (
            <label
              key={label}
              className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded-md px-2 py-1.5 transition-colors"
            >
              <Checkbox
                checked={data.targetAudience.includes(label)}
                onCheckedChange={() => toggleAudience(label)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="Audience seniority" hint="optional">
            <Input
              value={data.audienceSeniority ?? ""}
              onChange={(e) => set("audienceSeniority", e.target.value)}
              placeholder="e.g. mixed, senior-only, early-career focus"
            />
          </Field>
        </div>

        <Field label="Chapter tagline" hint="optional — used on landing page hero">
          <Input
            value={data.chapterTagline ?? ""}
            onChange={(e) => set("chapterTagline", e.target.value)}
            placeholder='e.g. "The community for AI builders in Montréal."'
          />
        </Field>
        <Field label="Chapter description (1–2 sentences)">
          <Textarea
            value={data.chapterDescription ?? ""}
            onChange={(e) => set("chapterDescription", e.target.value)}
            placeholder="e.g. AI Salon Montréal brings together founders, researchers, and investors building the future of AI in Québec."
            rows={3}
          />
        </Field>
      </SectionCard>

      {/* ─── Section 4: Brand Assets ──────────────────────────────────── */}
      <SectionCard
        icon={<ImageIcon className="w-5 h-5" />}
        title="Brand Assets"
        description="Upload your chapter's brand images. Each asset has a global default — leave blank to use the default. Uploaded images will appear on the Brand Images admin page once your chapter is provisioned."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <ImageUploadField
            label="Favicon"
            hint="optional — 32×32 px or larger, square"
            token={token}
            value={data.faviconUrl ?? ""}
            onChange={(url) => set("faviconUrl", url)}
          />
          <ImageUploadField
            label="Login hero image"
            hint="optional — square, transparent PNG"
            token={token}
            value={data.loginHeroUrl ?? ""}
            onChange={(url) => set("loginHeroUrl", url)}
          />
          <ImageUploadField
            label="Login banner"
            hint="optional — 1200×630, OG image"
            token={token}
            value={data.loginBannerUrl ?? ""}
            onChange={(url) => set("loginBannerUrl", url)}
          />
          <ImageUploadField
            label="Landing page hero"
            hint="optional — landscape 4:3 or 16:9"
            token={token}
            value={data.landingHeroUrl ?? ""}
            onChange={(url) => set("landingHeroUrl", url)}
          />
          <Field label="Brand color (primary)" hint="hex — optional">
            <Input
              value={data.brandColorPrimary ?? ""}
              onChange={(e) => set("brandColorPrimary", e.target.value)}
              placeholder="#00E6FF"
              className="font-mono"
            />
          </Field>
          <Field label="Brand color (secondary)" hint="hex — optional">
            <Input
              value={data.brandColorSecondary ?? ""}
              onChange={(e) => set("brandColorSecondary", e.target.value)}
              placeholder="#FF005A"
              className="font-mono"
            />
          </Field>
        </div>
      </SectionCard>

      {/* ─── Section 5: Email Config ──────────────────────────────────── */}
      <SectionCard
        icon={<Mail className="w-5 h-5" />}
        title="Email Configuration"
        description="Default sender identity + chapter email logo. Optional — global defaults work."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="From name" hint="optional">
            <Input
              value={data.fromName ?? ""}
              onChange={(e) => set("fromName", e.target.value)}
              placeholder='e.g. "AI Salon Montreal"'
            />
          </Field>
          <Field label="From email" hint="optional — needs SMTP config">
            <Input
              type="email"
              value={data.fromEmail ?? ""}
              onChange={(e) => set("fromEmail", e.target.value)}
              placeholder="montreal@aisalon.co"
            />
          </Field>
          <Field label="Reply-to email" hint="optional">
            <Input
              type="email"
              value={data.replyToEmail ?? ""}
              onChange={(e) => set("replyToEmail", e.target.value)}
              placeholder="montreal@aisalon.co"
            />
          </Field>
        </div>
        <ImageUploadField
          label="Email logo"
          hint="optional — ~200×60 px. Defaults to the standard AI Salon email logo when not provided."
          token={token}
          value={data.emailLogoUrl ?? ""}
          onChange={(url) => set("emailLogoUrl", url)}
        />
        <Field label="Email template notes" hint="optional">
          <Textarea
            value={data.emailTemplateOverrides ?? ""}
            onChange={(e) => set("emailTemplateOverrides", e.target.value)}
            placeholder="e.g. We want bilingual subject lines, or custom footer text..."
            rows={2}
          />
        </Field>
      </SectionCard>

      {/* ─── Section 6: Lead Info ─────────────────────────────────────── */}
      <SectionCard
        icon={<Users className="w-5 h-5" />}
        title="Chapter Lead Info"
        description="Your contact details. Pre-filled from your invite — edit if needed."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Lead name" required>
            <Input
              required
              value={data.leadName}
              onChange={(e) => set("leadName", e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </Field>
          <Field label="Lead email" required>
            <Input
              required
              type="email"
              value={data.leadEmail}
              onChange={(e) => set("leadEmail", e.target.value)}
              placeholder="jane@example.com"
            />
          </Field>
          <Field label="Phone" hint="optional — with country code">
            <Input
              value={data.leadPhone ?? ""}
              onChange={(e) => set("leadPhone", e.target.value)}
              placeholder="+1 514-555-1234"
            />
          </Field>
          <Field label="Role / title" hint="optional">
            <Input
              value={data.leadRole ?? ""}
              onChange={(e) => set("leadRole", e.target.value)}
              placeholder="e.g. Chapter Lead, Co-Founder"
            />
          </Field>
          <Field label="LinkedIn URL" hint="optional">
            <Input
              type="url"
              value={data.leadLinkedinUrl ?? ""}
              onChange={(e) => set("leadLinkedinUrl", e.target.value)}
              placeholder="https://linkedin.com/in/..."
            />
          </Field>
        </div>
        <Field label="Co-leads / admin team" hint="optional — name + email + role for each">
          <Textarea
            value={data.coLeads ?? ""}
            onChange={(e) => set("coLeads", e.target.value)}
            placeholder={"Jane Smith, jane@example.com, Co-lead\nBob Lee, bob@example.com, Operations"}
            rows={3}
          />
        </Field>
      </SectionCard>

      {/* ─── Section 7: Launch Plan ───────────────────────────────────── */}
      <SectionCard
        icon={<Calendar className="w-5 h-5" />}
        title="Launch Plan"
        description="When do you want to go live? When's the first event?"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Target launch date" required>
            <Input
              required
              type="date"
              value={data.targetLaunchDate ?? ""}
              onChange={(e) => set("targetLaunchDate", e.target.value)}
            />
          </Field>
          <Field label="First event date">
            <Input
              type="date"
              value={data.firstEventDate ?? ""}
              onChange={(e) => set("firstEventDate", e.target.value)}
            />
          </Field>
          <Field label="First event title">
            <Input
              value={data.firstEventTitle ?? ""}
              onChange={(e) => set("firstEventTitle", e.target.value)}
              placeholder='e.g. "AI Salon Montreal #1 — Generative AI in Québec"'
            />
          </Field>
          <Field label="First event venue">
            <Input
              value={data.firstEventVenue ?? ""}
              onChange={(e) => set("firstEventVenue", e.target.value)}
              placeholder="e.g. Notman House, Montréal"
            />
          </Field>
          <Field label="Expected attendance">
            <Input
              type="number"
              min="1"
              value={data.firstEventExpectedAttendance ?? ""}
              onChange={(e) => set("firstEventExpectedAttendance", e.target.value)}
              placeholder="e.g. 50, 100, 200"
            />
          </Field>
          <Field label="Event frequency">
            <Input
              value={data.eventFrequency ?? ""}
              onChange={(e) => set("eventFrequency", e.target.value)}
              placeholder="e.g. monthly, bi-monthly, quarterly"
            />
          </Field>
          <Field label="Typical event day/time">
            <Input
              value={data.typicalEventDayTime ?? ""}
              onChange={(e) => set("typicalEventDayTime", e.target.value)}
              placeholder="e.g. 3rd Tuesday of each month, 6:30 PM"
            />
          </Field>
          <Field label="Typical event format">
            <Input
              value={data.typicalEventFormat ?? ""}
              onChange={(e) => set("typicalEventFormat", e.target.value)}
              placeholder="e.g. keynote + panel + networking"
            />
          </Field>
        </div>
      </SectionCard>

      {/* ─── Section 8: Additional Notes ──────────────────────────────── */}
      <SectionCard
        icon={<FileText className="w-5 h-5" />}
        title="Additional Notes"
        description="Anything else we should know? Cultural considerations, partnerships, open questions."
      >
        <Field label="Operational notes">
          <Textarea
            value={data.operationalNotes ?? ""}
            onChange={(e) => set("operationalNotes", e.target.value)}
            placeholder="Local regulations, accessibility, dietary, etc."
            rows={3}
          />
        </Field>
        <Field label="Cultural / linguistic considerations">
          <Textarea
            value={data.culturalConsiderations ?? ""}
            onChange={(e) => set("culturalConsiderations", e.target.value)}
            placeholder="e.g. Montreal: events should be bilingual EN+FR..."
            rows={3}
          />
        </Field>
        <Field label="Partnership / cross-chapter opportunities">
          <Textarea
            value={data.partnershipOpportunities ?? ""}
            onChange={(e) => set("partnershipOpportunities", e.target.value)}
            placeholder="Local VCs, universities, accelerators..."
            rows={2}
          />
        </Field>
        <Field label="Open questions for the global team">
          <Textarea
            value={data.openQuestions ?? ""}
            onChange={(e) => set("openQuestions", e.target.value)}
            placeholder="What do you need from us?"
            rows={2}
          />
        </Field>
      </SectionCard>

      {/* ─── Submit ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 z-10">
        <Card className="border-slate-300 shadow-lg">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{data.chapterName || "Untitled chapter"}</span>
              <span className="text-slate-400"> · </span>
              <span className="font-mono text-xs">{data.chapterSlug || "no-slug"}</span>
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white font-semibold min-w-[180px]"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Submit form</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

// ─── Helper components ──────────────────────────────────────────────────

function SectionCard({
  icon, title, description, children, emphasis,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-[#FF005A]/30 bg-gradient-to-b from-[#FF005A]/[0.02] to-white" : undefined}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className={
            "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 " +
            (emphasis ? "bg-[#FF005A] text-white" : "bg-slate-100 text-slate-700")
          }>
            {icon}
          </div>
          <div>
            <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
              {title}
              {emphasis && (
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#FF005A] bg-[#FF005A]/10 px-2 py-0.5 rounded-full">
                  Top 3
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 mt-1">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  );
}

function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-900">
        {label}
        {required && <span className="text-[#FF005A] ml-1">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * ImageUploadField — file-upload replacement for the URL inputs that used
 * to back each brand-asset field in the onboarding form.
 *
 * Behavior:
 *   - Click "Upload" → opens file picker → uploads to
 *     /api/chapter-onboarding/[token]/upload-image → stores returned URL
 *     on the form data via `onChange`.
 *   - If `value` is already set (e.g. a previously uploaded URL), show a
 *     small preview thumbnail + a "Remove" button to clear it.
 *   - Drag-and-drop supported on the drop zone.
 *   - Errors surface as toast.error + inline red text.
 *
 * The actual upload bytes are stored under `chapter-onboarding/<token>/`
 * (Vercel Blob prefix or local sandbox folder). The provision step later
 * re-bundles them under the chapter's permanent `chapter-brand/<chapterId>/`
 * prefix when the chapter is created.
 */
function ImageUploadField({
  label, hint, token, value, onChange,
}: {
  label: string;
  hint?: string;
  token: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/chapter-onboarding/${token}/upload-image`, {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      onChange(d.url);
      toast.success(`${label} uploaded`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    // Basic client-side validation (server validates too, but fast-fail here).
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowed.includes(file.type)) {
      setError(`Unsupported file type: ${file.type}. Use JPG, PNG, WebP, GIF, or AVIF.`);
      toast.error(`Unsupported file type for ${label}`);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("File too large (max 8MB)");
      toast.error(`${label}: file too large (max 8MB)`);
      return;
    }
    void upload(file);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-900">{label}</Label>

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
          {/* Use plain <img> rather than next/image because uploaded
              images live on Vercel Blob (different host) and we don't
              want to deal with next/image remotePatterns config for an
              admin-only flow. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className="w-12 h-12 object-contain rounded border border-slate-200 bg-white"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-600 truncate font-mono">{value.split("/").pop()}</div>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-red-600 hover:text-red-700 underline mt-0.5"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            handleFile(f);
          }}
          className={
            "flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 cursor-pointer transition-colors " +
            (dragOver
              ? "border-[#FF005A] bg-[#FF005A]/5"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50")
          }
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-4 h-4 text-slate-500" />
          <span className="text-xs text-slate-600">
            {uploading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
              </span>
            ) : (
              "Click to upload or drag & drop"
            )}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              handleFile(f);
              // Reset so the same file can be picked again after a remove.
              e.target.value = "";
            }}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
