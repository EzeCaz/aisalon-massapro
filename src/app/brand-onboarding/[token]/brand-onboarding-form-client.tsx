"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Send, CheckCircle2, AlertCircle, Lock } from "lucide-react";

type Props = {
  token: string;
  inviteeEmail: string;
  prefillBrandName: string | null;
  prefillBrandSlug: string | null;
  expiresAt: string;
  isExpired: boolean;
  isSubmitted: boolean;
  submittedAt: string | null;
  submission: Record<string, unknown> | null;
};

/**
 * BrandOnboardingFormClient — the public form filled by brand leads.
 *
 * Mirrors the chapter-onboarding pattern. Required fields: brandName,
 * brandSlug, leadName, leadEmail. Everything else is optional and
 * inherits from Coma defaults at provision time.
 *
 * The form is divided into sections matching the BrandOnboardingFormData
 * type. On submit, POSTs to /api/brand-onboarding/[token]. On success,
 * shows a "submission received" view.
 */
export function BrandOnboardingFormClient({
  token,
  inviteeEmail,
  prefillBrandName,
  prefillBrandSlug,
  expiresAt,
  isExpired,
  isSubmitted,
  submittedAt,
  submission,
}: Props) {
  if (isExpired) {
    return <ExpiredState expiresAt={expiresAt} />;
  }
  if (isSubmitted) {
    return <SubmittedState submittedAt={submittedAt} submission={submission} />;
  }

  return (
    <Form
      token={token}
      inviteeEmail={inviteeEmail}
      prefillBrandName={prefillBrandName}
      prefillBrandSlug={prefillBrandSlug}
    />
  );
}

// ------------------------------------------------------------------
// Form
// ------------------------------------------------------------------

function Form({
  token,
  inviteeEmail,
  prefillBrandName,
  prefillBrandSlug,
}: {
  token: string;
  inviteeEmail: string;
  prefillBrandName: string | null;
  prefillBrandSlug: string | null;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Section 1: Brand basics
  const [brandName, setBrandName] = React.useState(prefillBrandName || "");
  const [brandSlug, setBrandSlug] = React.useState(prefillBrandSlug || "");
  const [tagline, setTagline] = React.useState("");
  const [wordmark, setWordmark] = React.useState("");

  // Section 2: Colors
  const [primaryColor, setPrimaryColor] = React.useState("");
  const [secondaryColor, setSecondaryColor] = React.useState("");
  const [accentColor, setAccentColor] = React.useState("");
  const [gradient, setGradient] = React.useState("");

  // Section 3: Brand assets
  const [heroBannerUrl, setHeroBannerUrl] = React.useState("");
  const [faviconUrl, setFaviconUrl] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [emailLogoUrl, setEmailLogoUrl] = React.useState("");

  // Section 4: Login copy
  const [loginEyebrowTemplate, setLoginEyebrowTemplate] = React.useState("");
  const [loginHeadlineTemplate, setLoginHeadlineTemplate] = React.useState("");
  const [loginSubtitle, setLoginSubtitle] = React.useState("");
  const [loginFormHeading, setLoginFormHeading] = React.useState("");
  const [loginFormSubheadingTemplate, setLoginFormSubheadingTemplate] = React.useState("");
  const [footerCredit, setFooterCredit] = React.useState("");

  // Section 5: Email config
  const [emailFromName, setEmailFromName] = React.useState("");
  const [emailContactEmail, setEmailContactEmail] = React.useState("");

  // Section 6: Domain
  const [apexDomain, setApexDomain] = React.useState("");

  // Section 7: Lead info
  const [leadName, setLeadName] = React.useState("");
  const [leadEmail, setLeadEmail] = React.useState(inviteeEmail);
  const [leadPhone, setLeadPhone] = React.useState("");
  const [leadRole, setLeadRole] = React.useState("");
  const [leadLinkedinUrl, setLeadLinkedinUrl] = React.useState("");

  // Section 8: Launch plan
  const [targetLaunchDate, setTargetLaunchDate] = React.useState("");
  const [firstChapterCity, setFirstChapterCity] = React.useState("");
  const [firstChapterCountryCode, setFirstChapterCountryCode] = React.useState("");
  const [launchNotes, setLaunchNotes] = React.useState("");

  // Section 9: Notes
  const [operationalNotes, setOperationalNotes] = React.useState("");
  const [partnershipOpportunities, setPartnershipOpportunities] = React.useState("");
  const [openQuestions, setOpenQuestions] = React.useState("");

  // Auto-derive slug from brandName when slug is empty
  React.useEffect(() => {
    if (!brandSlug && brandName) {
      setBrandSlug(brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40));
    }
  }, [brandName, brandSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!brandName.trim() || brandName.trim().length < 2) {
      setError("Brand name is required (min 2 characters).");
      return;
    }
    if (!brandSlug.trim() || !/^[a-z0-9-]{2,40}$/.test(brandSlug.trim().toLowerCase())) {
      setError("Brand slug is required (2-40 lowercase letters/digits/hyphens).");
      return;
    }
    if (!leadName.trim()) {
      setError("Your name is required.");
      return;
    }
    if (!leadEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail.trim())) {
      setError("A valid lead email is required.");
      return;
    }
    // Color hex validation (optional fields)
    for (const [k, v] of [
      ["primaryColor", primaryColor],
      ["secondaryColor", secondaryColor],
      ["accentColor", accentColor],
    ] as const) {
      if (v && !/^#[0-9A-Fa-f]{6}$/.test(v.trim())) {
        setError(`${k} must be a 6-digit hex color (e.g. "#0A1F44") or empty.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/brand-onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          brandSlug: brandSlug.trim().toLowerCase(),
          tagline: tagline.trim() || undefined,
          wordmark: wordmark.trim().toLowerCase() || undefined,
          primaryColor: primaryColor.trim() || undefined,
          secondaryColor: secondaryColor.trim() || undefined,
          accentColor: accentColor.trim() || undefined,
          gradient: gradient.trim() || undefined,
          heroBannerUrl: heroBannerUrl.trim() || undefined,
          faviconUrl: faviconUrl.trim() || undefined,
          logoUrl: logoUrl.trim() || undefined,
          emailLogoUrl: emailLogoUrl.trim() || undefined,
          loginEyebrowTemplate: loginEyebrowTemplate.trim() || undefined,
          loginHeadlineTemplate: loginHeadlineTemplate.trim() || undefined,
          loginSubtitle: loginSubtitle.trim() || undefined,
          loginFormHeading: loginFormHeading.trim() || undefined,
          loginFormSubheadingTemplate: loginFormSubheadingTemplate.trim() || undefined,
          footerCredit: footerCredit.trim() || undefined,
          emailFromName: emailFromName.trim() || undefined,
          emailContactEmail: emailContactEmail.trim() || undefined,
          apexDomain: apexDomain.trim() || undefined,
          leadName: leadName.trim(),
          leadEmail: leadEmail.trim().toLowerCase(),
          leadPhone: leadPhone.trim() || undefined,
          leadRole: leadRole.trim() || undefined,
          leadLinkedinUrl: leadLinkedinUrl.trim() || undefined,
          targetLaunchDate: targetLaunchDate || undefined,
          firstChapterCity: firstChapterCity.trim() || undefined,
          firstChapterCountryCode: firstChapterCountryCode.trim().toUpperCase() || undefined,
          launchNotes: launchNotes.trim() || undefined,
          operationalNotes: operationalNotes.trim() || undefined,
          partnershipOpportunities: partnershipOpportunities.trim() || undefined,
          openQuestions: openQuestions.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (HTTP ${res.status}).`);
        return;
      }
      // Reload to show the submitted state.
      window.location.reload();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-black lowercase">coma</span>
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-black/60 ml-2">
              Platform parent brand
            </span>
          </div>
          <span className="text-xs text-black/60">Brand onboarding form</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Welcome
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Set up your brand on Coma
          </h1>
          <p className="mt-3 text-sm text-black/80 max-w-2xl leading-relaxed">
            Fill in your brand's identity, colors, logo URLs, login copy, and
            launch plan. <strong>Required fields only</strong> — everything
            you skip will inherit from Coma's defaults. You can edit your
            branding later via the Super Admin. Once you submit, the Coma
            team reviews your submission and provisions your brand.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Section title="1. Brand basics" required>
            <Field label="Brand name" required>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Danone"
                required
                className={inputCls}
              />
            </Field>
            <Field label="Brand slug (URL)" required hint="2-40 lowercase letters, digits, or hyphens. Used in ?brand=<slug>.">
              <input
                type="text"
                value={brandSlug}
                onChange={(e) => setBrandSlug(e.target.value)}
                placeholder="danone"
                pattern="[a-z0-9-]{2,40}"
                required
                className={inputCls}
              />
            </Field>
            <Field label="Tagline" hint="Shown under the wordmark. Skip → 'Building the Operating System for Communities'.">
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Empowering AI Connections"
                className={inputCls}
              />
            </Field>
            <Field label="Wordmark" hint="Lowercase text shown in the header. Skip → lowercased brand name.">
              <input
                type="text"
                value={wordmark}
                onChange={(e) => setWordmark(e.target.value)}
                placeholder="danone"
                className={inputCls}
              />
            </Field>
          </Section>

          <Section title="2. Color palette" hint="All optional — skipped fields inherit Coma's navy/amber/red palette.">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Primary color" hint="Hex (e.g. #0A1F44)">
                <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#0A1F44" pattern="^#[0-9A-Fa-f]{6}$" className={inputCls} />
              </Field>
              <Field label="Secondary color" hint="Hex (e.g. #E84855)">
                <input type="text" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="#E84855" pattern="^#[0-9A-Fa-f]{6}$" className={inputCls} />
              </Field>
              <Field label="Accent color" hint="Hex (e.g. #F5A623)">
                <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#F5A623" pattern="^#[0-9A-Fa-f]{6}$" className={inputCls} />
              </Field>
            </div>
            <Field label="Gradient" hint="CSS gradient string for hero backgrounds + button backgrounds. Skip → Coma's gradient.">
              <input
                type="text"
                value={gradient}
                onChange={(e) => setGradient(e.target.value)}
                placeholder="linear-gradient(to bottom right, #0A1F44, #E84855)"
                className={`${inputCls} font-mono text-xs`}
              />
            </Field>
          </Section>

          <Section title="3. Brand assets (URLs)" hint="All optional — skipped fields fall back to text wordmark or Coma defaults.">
            <Field label="Hero banner URL" hint="Wide transparent PNG for the login left panel.">
              <input type="url" value={heroBannerUrl} onChange={(e) => setHeroBannerUrl(e.target.value)} placeholder="https://...png" className={inputCls} />
            </Field>
            <Field label="Favicon URL" hint="Browser tab icon.">
              <input type="url" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://...ico" className={inputCls} />
            </Field>
            <Field label="Logo URL" hint="Square logo mark (optional — text wordmark is the default).">
              <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://...png" className={inputCls} />
            </Field>
            <Field label="Email logo URL" hint="Shown at the top of transactional emails.">
              <input type="url" value={emailLogoUrl} onChange={(e) => setEmailLogoUrl(e.target.value)} placeholder="https://...png" className={inputCls} />
            </Field>
          </Section>

          <Section title="4. Login page copy" hint="All optional — skipped fields use Coma's templates with your brand name interpolated.">
            <Field label="Eyebrow template" hint="Small text above the H1. Skip → '{brandName} community'.">
              <input type="text" value={loginEyebrowTemplate} onChange={(e) => setLoginEyebrowTemplate(e.target.value)} placeholder="{brandName} community" className={inputCls} />
            </Field>
            <Field label="Headline template" hint="H1. Skip → 'The {brandName} home for community builders...'.">
              <input type="text" value={loginHeadlineTemplate} onChange={(e) => setLoginHeadlineTemplate(e.target.value)} placeholder="The {brandName} home for {accentSpanOpen}community builders{accentSpanClose}{cityClause}" className={inputCls} />
            </Field>
            <Field label="Subtitle" hint="Plain text below the H1.">
              <input type="text" value={loginSubtitle} onChange={(e) => setLoginSubtitle(e.target.value)} placeholder="" className={inputCls} />
            </Field>
            <Field label="Form heading" hint="Skip → 'Welcome to {brandName}'.">
              <input type="text" value={loginFormHeading} onChange={(e) => setLoginFormHeading(e.target.value)} placeholder="Welcome to Danone" className={inputCls} />
            </Field>
            <Field label="Footer credit" hint="Skip → 'Platform by MassaPro · Powered by {brandName}'.">
              <input type="text" value={footerCredit} onChange={(e) => setFooterCredit(e.target.value)} placeholder="Platform by MassaPro · Powered by Danone" className={inputCls} />
            </Field>
          </Section>

          <Section title="5. Email config" hint="All optional — skipped fields use Coma's email defaults.">
            <Field label="From: header" hint="Transactional emails From: name. Skip → 'Coma <coma@massapro.com>'.">
              <input type="text" value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="Danone <noreply@danone.com>" className={inputCls} />
            </Field>
            <Field label="Contact email" hint="Shown to recipients as the reply-to address. Skip → 'coma@massapro.com'.">
              <input type="email" value={emailContactEmail} onChange={(e) => setEmailContactEmail(e.target.value)} placeholder="noreply@danone.com" className={inputCls} />
            </Field>
          </Section>

          <Section title="6. Lead info" required>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Your name" required>
                <input type="text" value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Jane Cohen" required className={inputCls} />
              </Field>
              <Field label="Your email" required>
                <input type="email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} placeholder={inviteeEmail} required className={inputCls} />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Phone (optional)">
                <input type="tel" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} placeholder="+1 555 555 5555" className={inputCls} />
              </Field>
              <Field label="Role (optional)">
                <input type="text" value={leadRole} onChange={(e) => setLeadRole(e.target.value)} placeholder="Community Lead" className={inputCls} />
              </Field>
            </div>
            <Field label="LinkedIn (optional)">
              <input type="url" value={leadLinkedinUrl} onChange={(e) => setLeadLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className={inputCls} />
            </Field>
          </Section>

          <Section title="7. Launch plan" hint="All optional — helps the Coma team plan your onboarding.">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Target launch date">
                <input type="date" value={targetLaunchDate} onChange={(e) => setTargetLaunchDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="First chapter country">
                <select value={firstChapterCountryCode} onChange={(e) => setFirstChapterCountryCode(e.target.value)} className={inputCls}>
                  <option value="">Select country…</option>
                  <option value="IL">Israel</option>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="FR">France</option>
                  <option value="DE">Germany</option>
                  <option value="ES">Spain</option>
                  <option value="PT">Portugal</option>
                  <option value="IT">Italy</option>
                  <option value="NL">Netherlands</option>
                  <option value="BR">Brazil</option>
                  <option value="MX">Mexico</option>
                  <option value="AE">United Arab Emirates</option>
                  <option value="SG">Singapore</option>
                  <option value="JP">Japan</option>
                  <option value="AU">Australia</option>
                </select>
              </Field>
            </div>
            <Field label="First chapter city">
              <input type="text" value={firstChapterCity} onChange={(e) => setFirstChapterCity(e.target.value)} placeholder="Tel Aviv" className={inputCls} />
            </Field>
            <Field label="Launch plan notes">
              <textarea
                value={launchNotes}
                onChange={(e) => setLaunchNotes(e.target.value)}
                rows={3}
                placeholder="Anything we should know about your launch plans?"
                className={`${inputCls} resize-none`}
              />
            </Field>
          </Section>

          <Section title="8. Additional notes" hint="All optional.">
            <Field label="Operational notes">
              <textarea value={operationalNotes} onChange={(e) => setOperationalNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Partnership opportunities">
              <textarea value={partnershipOpportunities} onChange={(e) => setPartnershipOpportunities(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Open questions">
              <textarea value={openQuestions} onChange={(e) => setOpenQuestions(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
            </Field>
          </Section>

          {error && (
            <div className="rounded-md bg-[#FF005A]/10 border border-[#FF005A]/30 px-3 py-2 text-sm text-[#FF005A] flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pb-12">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-[#0A1F44] text-white font-semibold px-6 py-3 text-sm hover:bg-[#0A1F44]/90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit to Coma team
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-states
// ------------------------------------------------------------------

function ExpiredState({ expiresAt }: { expiresAt: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="max-w-md text-center space-y-3">
        <AlertCircle className="h-10 w-10 text-amber-600 mx-auto" />
        <h1 className="text-2xl font-bold text-black">This invite has expired</h1>
        <p className="text-sm text-black/70">
          The link expired on {new Date(expiresAt).toLocaleDateString()}.
          Contact the Coma team for a new invite.
        </p>
      </div>
    </div>
  );
}

function SubmittedState({
  submittedAt,
  submission,
}: {
  submittedAt: string | null;
  submission: Record<string, unknown> | null;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="max-w-lg text-center space-y-4 py-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#007E72]/10">
          <CheckCircle2 className="h-7 w-7 text-[#007E72]" />
        </div>
        <h1 className="text-2xl font-bold text-black">Submission received</h1>
        <p className="text-sm text-black/70">
          {submittedAt
            ? `Submitted on ${new Date(submittedAt).toLocaleDateString()}.`
            : "Your submission has been received."}
          {" "}
          The Coma team will review your branding and reach out within 2
          business days to provision your brand.
        </p>
        {submission && (
          <div className="text-left rounded-md border border-black/10 bg-black/[0.02] p-4 mt-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-black/50 mb-2">
              Your submission
            </p>
            <dl className="text-xs space-y-1">
              {Object.entries(submission).slice(0, 8).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="font-semibold text-black/60">{k}:</dt>
                  <dd className="text-black/80 break-words">
                    {v === null || v === undefined || v === ""
                      ? <span className="italic text-black/40">—</span>
                      : typeof v === "object"
                        ? JSON.stringify(v)
                        : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const inputCls =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40";

function Section({
  title,
  required,
  hint,
  children,
}: {
  title: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
      <div>
        <h2 className="text-base font-bold text-black">
          {title}
          {required && <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wider text-[#FF005A]">required</span>}
        </h2>
        {hint && <p className="text-xs text-black/60 mt-0.5">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-black/80">
        {label}
        {required && <span className="text-[#FF005A]"> *</span>}
      </span>
      {children}
      {hint && <span className="block mt-1 text-[0.65rem] text-black/50">{hint}</span>}
    </label>
  );
}
