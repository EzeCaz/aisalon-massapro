"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Send, CheckCircle2, AlertCircle, Lock, Eye } from "lucide-react";

type Props = {
  leadName: string;
  leadEmail: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandAccentColor: string;
  brandGradient: string;
  existingSubmission: Record<string, unknown> | null;
  existingStatus: "SUBMITTED" | "PROVISIONED" | null;
  existingSubmittedAt: string | null;
};

/**
 * ApplyFormClient — the application form for community leads.
 *
 * Required: brandName, brandSlug, leadName (pre-filled), leadEmail (pre-filled).
 * Everything else is optional — skipped fields inherit Coma defaults.
 *
 * Sections:
 *   1. Brand basics (name, slug, tagline, wordmark)
 *   2. Color palette (primary, secondary, accent, gradient)
 *   3. Brand assets (hero banner, favicon, logo, email logo)
 *   3b. Mascot (name, image URL, backstory)
 *   3c. Brand book URL
 *   4. Login page copy (eyebrow, headline, subtitle, form heading, footer credit)
 *   5. Email config (From name, contact email)
 *   6. Lead info (name, email, phone, role, LinkedIn)
 *   7. Launch plan (target date, first chapter city, country, notes)
 *   8. Additional notes
 *
 * On submit, POST /api/apply creates a BrandOnboardingInvite with
 * source=SELF_SERVE + status=SUBMITTED. Re-visits show the submitted
 * state read-only.
 */
export function ApplyFormClient({
  leadName,
  leadEmail,
  brandPrimaryColor,
  brandSecondaryColor,
  brandAccentColor,
  brandGradient,
  existingSubmission,
  existingStatus,
  existingSubmittedAt,
}: Props) {
  if (existingStatus === "PROVISIONED") {
    return <ProvisionedState submittedAt={existingSubmittedAt} />;
  }
  if (existingStatus === "SUBMITTED") {
    return <SubmittedState submittedAt={existingSubmittedAt} submission={existingSubmission} />;
  }
  return (
    <Form
      leadName={leadName}
      leadEmail={leadEmail}
      brandPrimaryColor={brandPrimaryColor}
      brandSecondaryColor={brandSecondaryColor}
      brandAccentColor={brandAccentColor}
      brandGradient={brandGradient}
    />
  );
}

// ------------------------------------------------------------------
// Form
// ------------------------------------------------------------------

function Form({
  leadName,
  leadEmail,
  brandPrimaryColor,
  brandSecondaryColor,
  brandAccentColor,
  brandGradient,
}: {
  leadName: string;
  leadEmail: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandAccentColor: string;
  brandGradient: string;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Section 1: Brand basics
  const [brandName, setBrandName] = React.useState("");
  const [brandSlug, setBrandSlug] = React.useState("");
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

  // Section 3b: Mascot
  const [mascotName, setMascotName] = React.useState("");
  const [mascotImageUrl, setMascotImageUrl] = React.useState("");
  const [mascotBackstory, setMascotBackstory] = React.useState("");

  // Section 3c: Brand book
  const [brandBookUrl, setBrandBookUrl] = React.useState("");

  // Section 4: Login copy
  const [loginEyebrowTemplate, setLoginEyebrowTemplate] = React.useState("");
  const [loginHeadlineTemplate, setLoginHeadlineTemplate] = React.useState("");
  const [loginSubtitle, setLoginSubtitle] = React.useState("");
  const [loginFormHeading, setLoginFormHeading] = React.useState("");
  const [footerCredit, setFooterCredit] = React.useState("");

  // Section 5: Email config
  const [emailFromName, setEmailFromName] = React.useState("");
  const [emailContactEmail, setEmailContactEmail] = React.useState("");

  // Section 6: Lead info
  const [name, setName] = React.useState(leadName);
  const [email, setEmail] = React.useState(leadEmail);
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState("");
  const [linkedinUrl, setLinkedinUrl] = React.useState("");

  // Section 7: Launch plan
  const [targetLaunchDate, setTargetLaunchDate] = React.useState("");
  const [firstChapterCity, setFirstChapterCity] = React.useState("");
  const [firstChapterCountryCode, setFirstChapterCountryCode] = React.useState("");
  const [launchNotes, setLaunchNotes] = React.useState("");

  // Section 8: Notes
  const [operationalNotes, setOperationalNotes] = React.useState("");
  const [openQuestions, setOpenQuestions] = React.useState("");

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
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!brandSlug.trim() || !/^[a-z0-9-]{2,40}$/.test(brandSlug.trim().toLowerCase())) {
      setError("Brand slug is required (2-40 lowercase letters/digits/hyphens).");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!name.trim()) {
      setError("Your name is required.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("A valid email is required.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    for (const [k, v] of [
      ["primaryColor", primaryColor],
      ["secondaryColor", secondaryColor],
      ["accentColor", accentColor],
    ] as const) {
      if (v && !/^#[0-9A-Fa-f]{6}$/.test(v.trim())) {
        setError(`${k} must be a 6-digit hex color (e.g. "#0A1F44") or empty.`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
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
          mascotName: mascotName.trim() || undefined,
          mascotImageUrl: mascotImageUrl.trim() || undefined,
          mascotBackstory: mascotBackstory.trim() || undefined,
          brandBookUrl: brandBookUrl.trim() || undefined,
          loginEyebrowTemplate: loginEyebrowTemplate.trim() || undefined,
          loginHeadlineTemplate: loginHeadlineTemplate.trim() || undefined,
          loginSubtitle: loginSubtitle.trim() || undefined,
          loginFormHeading: loginFormHeading.trim() || undefined,
          footerCredit: footerCredit.trim() || undefined,
          emailFromName: emailFromName.trim() || undefined,
          emailContactEmail: emailContactEmail.trim() || undefined,
          leadName: name.trim(),
          leadEmail: email.trim().toLowerCase(),
          leadPhone: phone.trim() || undefined,
          leadRole: role.trim() || undefined,
          leadLinkedinUrl: linkedinUrl.trim() || undefined,
          targetLaunchDate: targetLaunchDate || undefined,
          firstChapterCity: firstChapterCity.trim() || undefined,
          firstChapterCountryCode: firstChapterCountryCode.trim().toUpperCase() || undefined,
          launchNotes: launchNotes.trim() || undefined,
          operationalNotes: operationalNotes.trim() || undefined,
          openQuestions: openQuestions.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (HTTP ${res.status}).`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Reload to show the submitted state.
      window.location.reload();
    } catch {
      setError("Network error — please try again.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {error && (
        <div
          className="mb-6 rounded-md border px-4 py-3 text-sm flex items-start gap-2 sticky top-0 z-10"
          style={{
            backgroundColor: `${brandSecondaryColor}1A`,
            borderColor: `${brandSecondaryColor}4D`,
            color: brandSecondaryColor,
          }}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-8">
        <p
          className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2"
          style={{ color: brandSecondaryColor }}
        >
          Application form
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-black mb-2">
          Bring your community to Coma
        </h1>
        <p className="text-sm text-black/70 max-w-2xl leading-relaxed">
          Fill in your brand&apos;s identity, colors, logo URLs, mascot,
          brand book, login copy, and launch plan. <strong>Required
          fields only</strong> — everything you skip will inherit
          Coma&apos;s defaults. Reviewed within 2 business days.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-16">
        <Section title="1. Brand basics" required accentColor={brandSecondaryColor}>
          <Field label="Brand name" required>
            <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Danone" required className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Brand slug (URL)" required hint="2-40 lowercase letters/digits/hyphens. Used in ?brand=<slug>.">
            <input type="text" value={brandSlug} onChange={(e) => setBrandSlug(e.target.value)} placeholder="danone" pattern="[a-z0-9-]{2,40}" required className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Tagline / slogan" hint="Shown under the wordmark. Skip → 'Building the Operating System for Communities'.">
            <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One Planet. One Health." className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Wordmark" hint="Lowercase text shown in the header. Skip → lowercased brand name.">
            <input type="text" value={wordmark} onChange={(e) => setWordmark(e.target.value)} placeholder="danone" className={inputCls(brandSecondaryColor)} />
          </Field>
        </Section>

        <Section title="2. Color palette" hint="All optional — skipped fields inherit Coma's navy/amber/red palette." accentColor={brandSecondaryColor}>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Primary color" hint="Hex (e.g. #0A1F44)">
              <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#0A1F44" pattern="^#[0-9A-Fa-f]{6}$" className={inputCls(brandSecondaryColor)} />
            </Field>
            <Field label="Secondary color" hint="Hex (e.g. #E84855)">
              <input type="text" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="#E84855" pattern="^#[0-9A-Fa-f]{6}$" className={inputCls(brandSecondaryColor)} />
            </Field>
            <Field label="Accent color" hint="Hex (e.g. #F5A623)">
              <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#F5A623" pattern="^#[0-9A-Fa-f]{6}$" className={inputCls(brandSecondaryColor)} />
            </Field>
          </div>
          <Field label="Gradient" hint="CSS gradient for hero + button backgrounds. Skip → Coma's gradient.">
            <input type="text" value={gradient} onChange={(e) => setGradient(e.target.value)} placeholder="linear-gradient(to bottom right, #0A1F44, #E84855)" className={`${inputCls(brandSecondaryColor)} font-mono text-xs`} />
          </Field>
        </Section>

        <Section title="3. Brand assets (URLs)" hint="All optional — skipped fields fall back to text wordmark or Coma defaults." accentColor={brandSecondaryColor}>
          <Field label="Hero banner URL" hint="Wide transparent PNG for the login left panel.">
            <input type="url" value={heroBannerUrl} onChange={(e) => setHeroBannerUrl(e.target.value)} placeholder="https://...png" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Favicon URL" hint="Browser tab icon.">
            <input type="url" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://...ico" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Logo URL (square mark)" hint="Optional — text wordmark is the default when skipped.">
            <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://...png" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Email logo URL" hint="Shown at the top of transactional emails.">
            <input type="url" value={emailLogoUrl} onChange={(e) => setEmailLogoUrl(e.target.value)} placeholder="https://...png" className={inputCls(brandSecondaryColor)} />
          </Field>
        </Section>

        <Section title="3b. Mascot (optional character)" hint="Optional — e.g. AIS has the falafel meerkat. Skipped → text wordmark only." accentColor={brandSecondaryColor}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Mascot name" hint="e.g. 'Falafel Meerkat'.">
              <input type="text" value={mascotName} onChange={(e) => setMascotName(e.target.value)} placeholder="Falafel Meerkat" className={inputCls(brandSecondaryColor)} />
            </Field>
            <Field label="Mascot image URL" hint="PNG/SVG, transparent preferred.">
              <input type="url" value={mascotImageUrl} onChange={(e) => setMascotImageUrl(e.target.value)} placeholder="https://...png" className={inputCls(brandSecondaryColor)} />
            </Field>
          </div>
          <Field label="Mascot backstory" hint="1-2 sentences shown on the about page.">
            <textarea value={mascotBackstory} onChange={(e) => setMascotBackstory(e.target.value)} rows={2} placeholder="Born in the streets of Tel Aviv, the falafel meerkat represents..." className={`${inputCls(brandSecondaryColor)} resize-none`} />
          </Field>
        </Section>

        <Section title="3c. Brand book / style guide" hint="Link to your full brand guidelines (PDF/DOC/Figma). Super Admin references this when reviewing + provisioning." accentColor={brandSecondaryColor}>
          <Field label="Brand book URL" hint="Logo usage, typography, color palette, do/don'ts.">
            <input type="url" value={brandBookUrl} onChange={(e) => setBrandBookUrl(e.target.value)} placeholder="https://...pdf or https://figma.com/file/..." className={inputCls(brandSecondaryColor)} />
          </Field>
        </Section>

        <Section title="4. Login page copy" hint="All optional — skipped fields use Coma's templates with your brand name interpolated." accentColor={brandSecondaryColor}>
          <Field label="Eyebrow template" hint="Small text above the H1. Skip → '{brandName} community'.">
            <input type="text" value={loginEyebrowTemplate} onChange={(e) => setLoginEyebrowTemplate(e.target.value)} placeholder="{brandName} community" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Headline template" hint="H1. Skip → 'The {brandName} home for community builders...'.">
            <input type="text" value={loginHeadlineTemplate} onChange={(e) => setLoginHeadlineTemplate(e.target.value)} placeholder="The {brandName} home for {accentSpanOpen}community builders{accentSpanClose}{cityClause}" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Subtitle" hint="Plain text below the H1.">
            <input type="text" value={loginSubtitle} onChange={(e) => setLoginSubtitle(e.target.value)} placeholder="" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Form heading" hint="Skip → 'Welcome to {brandName}'.">
            <input type="text" value={loginFormHeading} onChange={(e) => setLoginFormHeading(e.target.value)} placeholder="Welcome to Danone" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Footer credit" hint="Skip → 'Platform by MassaPro · Powered by {brandName}'.">
            <input type="text" value={footerCredit} onChange={(e) => setFooterCredit(e.target.value)} placeholder="Platform by MassaPro · Powered by Danone" className={inputCls(brandSecondaryColor)} />
          </Field>
        </Section>

        <Section title="5. Email config" hint="All optional — skipped fields use Coma's email defaults." accentColor={brandSecondaryColor}>
          <Field label="From: header" hint="Transactional emails From: name. Skip → 'Coma <coma@massapro.com>'.">
            <input type="text" value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="Danone <noreply@danone.com>" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Contact email" hint="Shown to recipients as the reply-to address. Skip → 'coma@massapro.com'.">
            <input type="email" value={emailContactEmail} onChange={(e) => setEmailContactEmail(e.target.value)} placeholder="noreply@danone.com" className={inputCls(brandSecondaryColor)} />
          </Field>
        </Section>

        <Section title="6. Your info (lead)" required accentColor={brandSecondaryColor}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Your name" required>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Cohen" required className={inputCls(brandSecondaryColor)} />
            </Field>
            <Field label="Your email" required hint="Used to link the application to your account.">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={leadEmail} required className={inputCls(brandSecondaryColor)} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Phone (optional)">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 555 5555" className={inputCls(brandSecondaryColor)} />
            </Field>
            <Field label="Role (optional)">
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Community Lead" className={inputCls(brandSecondaryColor)} />
            </Field>
          </div>
          <Field label="LinkedIn (optional)">
            <input type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className={inputCls(brandSecondaryColor)} />
          </Field>
        </Section>

        <Section title="7. Launch plan" hint="All optional — helps us plan your onboarding." accentColor={brandSecondaryColor}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Target launch date">
              <input type="date" value={targetLaunchDate} onChange={(e) => setTargetLaunchDate(e.target.value)} className={inputCls(brandSecondaryColor)} />
            </Field>
            <Field label="First chapter country">
              <select value={firstChapterCountryCode} onChange={(e) => setFirstChapterCountryCode(e.target.value)} className={inputCls(brandSecondaryColor)}>
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
            <input type="text" value={firstChapterCity} onChange={(e) => setFirstChapterCity(e.target.value)} placeholder="Tel Aviv" className={inputCls(brandSecondaryColor)} />
          </Field>
          <Field label="Launch plan notes">
            <textarea value={launchNotes} onChange={(e) => setLaunchNotes(e.target.value)} rows={3} placeholder="Anything we should know about your launch plans?" className={`${inputCls(brandSecondaryColor)} resize-none`} />
          </Field>
        </Section>

        <Section title="8. Additional notes" hint="All optional." accentColor={brandSecondaryColor}>
          <Field label="Operational notes">
            <textarea value={operationalNotes} onChange={(e) => setOperationalNotes(e.target.value)} rows={2} className={`${inputCls(brandSecondaryColor)} resize-none`} />
          </Field>
          <Field label="Open questions for the Coma team">
            <textarea value={openQuestions} onChange={(e) => setOpenQuestions(e.target.value)} rows={2} className={`${inputCls(brandSecondaryColor)} resize-none`} />
          </Field>
        </Section>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-black/10 -mx-4 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-black/60">
            <Lock className="inline h-3 w-3 mr-1 -mt-0.5" />
            Your submission is private to you + the Coma team.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md text-white font-semibold px-6 py-3 text-sm disabled:opacity-50"
            style={{ backgroundColor: brandPrimaryColor }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit application
          </button>
        </div>
      </form>
    </>
  );
}

// ------------------------------------------------------------------
// Submitted state (read-only view)
// ------------------------------------------------------------------

function SubmittedState({
  submittedAt,
  submission,
}: {
  submittedAt: string | null;
  submission: Record<string, unknown> | null;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3 py-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#007E72]/10">
          <CheckCircle2 className="h-7 w-7 text-[#007E72]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-black">
          Application submitted
        </h1>
        <p className="text-sm text-black/70 max-w-xl mx-auto">
          {submittedAt
            ? `Submitted on ${new Date(submittedAt).toLocaleDateString()}.`
            : "Your application has been received."}
          {" "}
          The Coma team will review it within 2 business days and reach out
          via email. You can revisit this page anytime to see your submission.
        </p>
      </div>

      {submission && (
        <div className="rounded-lg border border-black/10 bg-white p-5">
          <h2 className="text-base font-bold text-black mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4" /> Your submission
          </h2>
          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {Object.entries(submission).map(([k, v]) => (
              <div key={k} className="border-b border-black/[0.06] pb-2">
                <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-black/50">{k}</dt>
                <dd className="text-black/80 mt-0.5 break-words">
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
  );
}

function ProvisionedState({ submittedAt }: { submittedAt: string | null }) {
  return (
    <div className="text-center space-y-3 py-12">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#007E72]/10">
        <CheckCircle2 className="h-7 w-7 text-[#007E72]" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-black">
        Your brand is live! 🎉
      </h1>
      <p className="text-sm text-black/70 max-w-xl mx-auto">
        Your application was reviewed and your brand is now provisioned on
        the platform. {submittedAt && `Originally submitted ${new Date(submittedAt).toLocaleDateString()}.`}
        {" "}Check your email for admin access details, or visit /events to
        start exploring.
      </p>
      <a
        href="/events"
        className="inline-flex items-center gap-2 rounded-md bg-[#007E72] text-white font-semibold px-5 py-2.5 text-sm hover:bg-[#007E72]/90"
      >
        Browse events →
      </a>
    </div>
  );
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function inputCls(accent: string): string {
  return `w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2`;
}

function Section({
  title,
  required,
  hint,
  accentColor,
  children,
}: {
  title: string;
  required?: boolean;
  hint?: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
      <div>
        <h2 className="text-base font-bold text-black">
          {title}
          {required && (
            <span
              className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wider"
              style={{ color: accentColor }}
            >
              required
            </span>
          )}
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
