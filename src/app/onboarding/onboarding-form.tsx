"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowRight, Check } from "lucide-react";

type Props = {
  initial: {
    name: string;
    email: string;
    company: string;
    mobile: string;
    linkedinUrl: string;
    bio: string;
    title?: string;
  };
  interestedInOptions: string[];
  profileCategoriesOptions: string[];
};

/**
 * OnboardingForm — the AI Salon TLV intake form.
 *
 * Ten questions, mirroring the original Google Form / Excel intake:
 *   1. Full Name *            [short text]
 *   2. Company name *         [short text]
 *   3. Title / Role *         [short text — e.g. "CEO", "Engineer"]
 *   4. email *                [email, read-only — bound to session email]
 *   5. Mobile *               [phone, with helper text]
 *   6. Linkedin profile *     [URL]
 *   7. I am interested in... * [multi-checkbox + "Other: ___"]
 *   8. Tell us more about yourself * [multi-checkbox]
 *   9. I would like to apply for * [single-select: Fast pitch / Presentation/Lecture / None]
 *  10. Tell us more about yourself :) [long text — optional]
 *
 * Submits to POST /api/user/onboarding, which validates, persists to
 * the User row, and sets `onboardedAt`. On success we push the user
 * to /events.
 */
export function OnboardingForm({
  initial,
  interestedInOptions,
  profileCategoriesOptions,
}: Props) {
  const router = useRouter();

  const [name, setName] = useState(initial.name);
  const [company, setCompany] = useState(initial.company);
  const [title, setTitle] = useState(initial.title || "");
  // email is read-only (it's the identity), but we keep it in state
  // for the submit payload.
  const [email] = useState(initial.email);
  const [mobile, setMobile] = useState(initial.mobile);
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl);
  const [interestedIn, setInterestedIn] = useState<Set<string>>(new Set());
  const [interestedInOther, setInterestedInOther] = useState("");
  const [profileCategories, setProfileCategories] = useState<Set<string>>(new Set());
  const [appliedFor, setAppliedFor] = useState<string>("");
  const [bio, setBio] = useState(initial.bio);
  const [submitting, setSubmitting] = useState(false);

  function toggle(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const t = toast.loading("Saving your profile…");

    try {
      const res = await fetch(`/api/user/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company,
          title,
          email,
          mobile,
          linkedinUrl,
          interestedIn: Array.from(interestedIn),
          interestedInOther,
          profileCategories: Array.from(profileCategories),
          appliedFor,
          bio,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        toast.error(msg, { id: t, duration: 8000 });
        setSubmitting(false);
        return;
      }

      toast.success("Welcome to AI Salon Tel Aviv! Redirecting…", { id: t });
      // Small delay so the toast has time to show before navigation.
      setTimeout(() => {
        router.push("/events");
        router.refresh();
      }, 700);
    } catch (err) {
      toast.error(
        `Couldn't reach the server: ${(err as Error).message}. Please try again.`,
        { id: t, duration: 8000 }
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden"
    >
      {/* Required-question legend */}
      <div className="px-6 sm:px-8 py-4 bg-black/[0.02] border-b border-black/10 text-xs text-black/50">
        <span className="text-[#FF005A] font-bold">*</span> Indicates required question
      </div>

      <div className="px-6 sm:px-8 py-6 space-y-8">
        {/* 1. Full Name */}
        <ShortText
          n={1}
          label="Full Name"
          required
          value={name}
          onChange={setName}
          placeholder="e.g. Ezequiel Sznaider"
          autoComplete="name"
        />

        {/* 2. Company name */}
        <ShortText
          n={2}
          label="Company name"
          required
          value={company}
          onChange={setCompany}
          placeholder="e.g. MassaPro"
          autoComplete="organization"
        />

        {/* 3. Title / Role */}
        <ShortText
          n={3}
          label="Title / Role"
          required
          value={title}
          onChange={setTitle}
          placeholder="e.g. CEO, Engineer, Designer, Investor"
          autoComplete="organization-title"
        />

        {/* 4. email (read-only) */}
        <Field n={4} label="email" required>
          <input
            type="email"
            value={email}
            readOnly
            disabled
            className="w-full rounded-md border border-black/15 bg-black/[0.04] px-3 py-2.5 text-sm text-black/80 outline-none cursor-not-allowed"
          />
          <p className="mt-1.5 text-xs text-black/80">
            This is the email you signed in with — it can&rsquo;t be changed.
          </p>
        </Field>

        {/* 5. Mobile */}
        <Field n={5} label="Mobile" required>
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="+972 50 123 4567"
            autoComplete="tel"
            required
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors"
          />
          <p className="mt-1.5 text-xs text-black/50">
            We will only contact you about relevant events.
          </p>
        </Field>

        {/* 6. Linkedin profile */}
        <Field n={6} label="Linkedin profile" required>
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://www.linkedin.com/in/your-handle"
            required
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors"
          />
        </Field>

        {/* 7. I am interested in... */}
        <CheckboxGroup
          n={7}
          label="I am interested in…"
          required
          options={interestedInOptions}
          selected={interestedIn}
          onToggle={(v) => toggle(interestedIn, v, setInterestedIn)}
          otherLabel="Other:"
          otherValue={interestedInOther}
          onOtherChange={setInterestedInOther}
          otherPlaceholder="Tell us what you have in mind"
        />

        {/* 8. Tell us more about yourself (checkboxes) */}
        <CheckboxGroup
          n={8}
          label="Tell us more about yourself"
          required
          options={profileCategoriesOptions}
          selected={profileCategories}
          onToggle={(v) => toggle(profileCategories, v, setProfileCategories)}
        />

        {/* 9. I would like to apply for (single-select) */}
        <Field n={9} label="I would like to apply for" required>
          <div className="space-y-2">
            {[
              { value: "", label: "Nothing — I'm here as a member" },
              { value: "Fast pitch", label: "Fast pitch (3-min startup pitch on stage)" },
              { value: "Presentation/Lecture", label: "Presentation / Lecture (20-30 min talk)" },
            ].map((opt) => {
              const checked = appliedFor === opt.value;
              return (
                <label
                  key={opt.value || "none"}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    checked
                      ? "border-[#FF005A] bg-[#FF005A]/5 text-black"
                      : "border-black/10 bg-white text-black/80 hover:border-black/30 hover:bg-black/[0.02]"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                      checked
                        ? "border-[#FF005A] bg-[#FF005A] text-white"
                        : "border-black/25 bg-white"
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <input
                    type="radio"
                    name="appliedFor"
                    value={opt.value}
                    checked={checked}
                    onChange={() => setAppliedFor(opt.value)}
                    className="sr-only"
                  />
                  <span className="flex-1">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </Field>

        {/* 10. Tell us more about yourself :) (long text — optional) */}
        <Field n={10} label="Tell us more about yourself :)">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Anything else you'd like the AI Salon team to know? Your background, what you're building, what you're looking for in the community…"
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors resize-y"
          />
          <p className="mt-1.5 text-xs text-black/80 text-right">{bio.length} / 2000</p>
        </Field>
      </div>

      {/* Submit footer */}
      <div className="px-6 sm:px-8 py-5 bg-black/[0.02] border-t border-black/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-black/50 text-center sm:text-left">
          Your answers will be visible to the AI Salon admin team and used to match you
          with relevant events and speakers.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-6 py-3 text-sm hover:bg-black/90 disabled:opacity-50 ais-lift transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              Submit <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({
  n,
  label,
  required,
  children,
}: {
  n: number;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs font-bold text-black/30 tabular-nums">{n}.</span>
        <h3 className="text-sm sm:text-base font-semibold text-black">
          {label}
          {required && <span className="text-[#FF005A] ml-1">*</span>}
        </h3>
      </div>
      {children}
    </div>
  );
}

function ShortText({
  n,
  label,
  required,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  n: number;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <Field n={n} label={label} required={required}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors"
      />
    </Field>
  );
}

function CheckboxGroup({
  n,
  label,
  required,
  options,
  selected,
  onToggle,
  otherLabel,
  otherValue,
  onOtherChange,
  otherPlaceholder,
}: {
  n: number;
  label: string;
  required?: boolean;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  otherLabel?: string;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
  otherPlaceholder?: string;
}) {
  return (
    <Field n={n} label={label} required={required}>
      <div className="space-y-2">
        {options.map((opt) => {
          const checked = selected.has(opt);
          return (
            <label
              key={opt}
              className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                checked
                  ? "border-[#FF005A] bg-[#FF005A]/5 text-black"
                  : "border-black/10 bg-white text-black/80 hover:border-black/30 hover:bg-black/[0.02]"
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                  checked
                    ? "border-[#FF005A] bg-[#FF005A] text-white"
                    : "border-black/25 bg-white"
                }`}
              >
                {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(opt)}
                className="sr-only"
              />
              <span className="flex-1">{opt}</span>
            </label>
          );
        })}

        {otherLabel !== undefined && onOtherChange !== undefined && (
          <label
            className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
              otherValue && otherValue.trim()
                ? "border-[#FF005A] bg-[#FF005A]/5 text-black"
                : "border-black/10 bg-white text-black/80 hover:border-black/30 hover:bg-black/[0.02]"
            }`}
          >
            <span
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                otherValue && otherValue.trim()
                  ? "border-[#FF005A] bg-[#FF005A] text-white"
                  : "border-black/25 bg-white"
              }`}
            >
              {otherValue && otherValue.trim() && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="flex-1 flex items-center gap-2 flex-wrap">
              <span className="font-semibold whitespace-nowrap">{otherLabel}</span>
              <input
                type="text"
                value={otherValue || ""}
                onChange={(e) => onOtherChange(e.target.value)}
                placeholder={otherPlaceholder}
                className="flex-1 min-w-[120px] rounded border border-black/15 bg-white px-2 py-1 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10"
              />
            </span>
          </label>
        )}
      </div>
    </Field>
  );
}
