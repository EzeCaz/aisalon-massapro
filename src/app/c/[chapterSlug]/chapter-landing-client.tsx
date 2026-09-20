"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Loader2,
  ArrowRight,
  Mail,
  User,
  CheckCircle2,
  MessageCircle,
  Linkedin,
  Sparkles,
  Lock,
} from "lucide-react";
import { AiSalonLogo } from "@/components/brand/aisalon-logo";
import { displayFlag } from "@/lib/country-flag";
import { BrandHeaderLogo } from "@/components/brand/brand-header-logo";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Country = {
  id: string;
  name: string;
  code: string;
  flagEmoji: string | null;
};

type UpcomingEvent = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  city: string | null;
  mainImageUrl: string | null;
  rsvpCount: number;
};

type Chapter = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  timezone: string;
  whatsappGroupUrl: string | null;
  linkedinUrl: string | null;
  heroImageUrl: string | null;
  country: Country;
  memberCount: number;
  eventCount: number;
  events: UpcomingEvent[];
};

type Props = {
  chapter: Chapter;
  /** BRAND-AWARE (Phase 3): resolved brand display name passed from the
   *  server parent (c/[chapterSlug]/page.tsx). Drives the toast, hero
   *  eyebrow, sign-up card, and footer so Coma visitors on
   *  coma.massapro.com never see hard-coded "AI Salon" strings. */
  brandName?: string;
  /** Full brand config — drives the header logo (Coma vs AIS meerkat),
   *  hero gradient color, and signup-card accent. When omitted, the
   *  client falls back to a neutral black/white treatment. */
  brand?: {
    slug: string;
    wordmark: string;
    tagline: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    gradient: string;
  } | null;
  /**
   * SIGNED-IN USER (2026-09-19): when present, the right-hand card swaps
   * the editable sign-up form for a masked read-only identity summary +
   * a single "Join {chapter}" button. Anonymous visitors see the form.
   * `isMember: true` shows a "You're a member" state instead.
   */
  me?: {
    name: string | null;
    email: string;
    isMember: boolean;
  } | null;
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Normalize a URL string to ensure it has an http:// or https:// prefix.
 *
 * Why: when an admin enters `linkedin.com/company/foo` (no scheme) in the
 * chapter editor, the browser treats it as a relative path and the link
 * resolves to `https://aisalon.massapro.com/c/linkedin.com/company/foo`
 * instead of `https://linkedin.com/company/foo`. This is defense-in-depth
 * on the render side — the admin API also normalizes at save time, but
 * existing rows that were saved without a scheme need to render correctly
 * too.
 *
 * Behavior:
 *   - null/empty → null (so the link is not rendered)
 *   - already has http:// or https:// → returned as-is
 *   - "linkedin.com/..." → "https://linkedin.com/..."
 *   - "ftp://..." → returned as-is (we don't strip non-http schemes; the
 *     admin API blocks them at save time anyway)
 */
function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Strip any leading protocol that isn't http/https (e.g. javascript:,
  // data: — security hygiene, even though the admin API blocks them).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return `https://${trimmed}`;
}

function fmtDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}
function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function ChapterLandingClient({
  chapter,
  brandName = "AI Salon",
  brand = null,
  me,
}: Props) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // ── SIGNED-IN JOIN CARD (2026-09-19) ──────────────────────────────
  // Rendered only when `me` is passed from the server. The user's
  // identity is shown read-only, partially masked (like a password
  // input) — nothing editable, nothing forgeable. A single button
  // POSTs to /api/chapters/[slug]/membership; the server copies the
  // details from the profile record itself.
  const [joining, setJoining] = React.useState(false);
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joined, setJoined] = React.useState(false);
  // If the server already considered the user a member on first render,
  // skip straight to the "you're a member" state.
  const isMember = !!me?.isMember || joined;

  function maskName(v: string): string {
    const s = v.trim();
    if (!s) return "—";
    const words = s.split(/\s+/);
    if (words.length > 1 && words[0].length >= 2) return `${words[0]} •••`;
    if (s.length <= 3) return `${s[0]}•••`;
    return `${s.slice(0, 3)}•••`;
  }
  function maskEmail(v: string): string {
    const s = v.trim();
    const at = s.indexOf("@");
    if (at <= 0) return `${s.slice(0, 2)}•••`;
    return `${s.slice(0, Math.min(2, at))}•••${s.slice(at)}`;
  }

  async function handleJoin() {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await fetch(
        `/api/chapters/${encodeURIComponent(chapter.slug)}/membership`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJoinError(data?.error || `Could not join (HTTP ${res.status}).`);
        return;
      }
      setJoined(true);
    } catch {
      setJoinError("Network error — please try again.");
    } finally {
      setJoining(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !name) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          chapterSlug: chapter.slug,
          // Forward the resolved brand so new users get stamped with the
          // right brandId at signup — otherwise they default to AIS via
          // FALLBACK_DEFAULT_BRAND even when signing up via a Coma /c/ page.
          brandSlug: brand?.slug,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign-up failed.");
      } else {
        setSuccess(
          data.message ||
            `Welcome to ${brandName} ${chapter.name}! Check your email for your password.`
        );
        setName("");
        setEmail("");
      }
    } catch (err) {
      console.error(err);
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Some Country rows were seeded with the ISO code in flagEmoji (e.g.
  // "CA" instead of "🇨🇦") — displayFlag derives the real emoji from
  // country.code when flagEmoji is malformed or missing.
  const flag = displayFlag(chapter.country.code, chapter.country.flagEmoji);

  // BRAND-AWARE ACCENTS: when a brand is provided, use its secondary
  // color for the "Join the chapter" eyebrow, hover states, and the
  // signup-card border. When brand is null (legacy callers), keep the
  // legacy AIS magenta (#FF005A / #820A7D) so AIS pages look unchanged.
  const accent = brand?.secondaryColor ?? "#FF005A";
  const accentDeep = brand?.primaryColor ?? "#820A7D";

  // Normalize social URLs at render time so links like "linkedin.com/foo"
  // (entered without https://) still resolve to the external site instead
  // of being treated as a relative path on aisalon.massapro.com.
  const whatsappUrl = normalizeUrl(chapter.whatsappGroupUrl);
  const linkedinUrl = normalizeUrl(chapter.linkedinUrl);
  // Normalize hero image URL too — admin may paste a schemeless URL.
  const heroImageUrl = normalizeUrl(chapter.heroImageUrl);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {brand ? (
              <BrandHeaderLogo brand={brand} />
            ) : (
              <AiSalonLogo />
            )}
          </Link>
          <Link
            href={`/login?chapterSlug=${encodeURIComponent(chapter.slug)}&city=${encodeURIComponent(chapter.name)}`}
            className="text-sm font-semibold text-black/70 hover:text-black"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero — chapter identity. Two-column on lg+ when a hero image
          is set; single-column (gradient-only) when no image.
          BRAND-AWARE (2026-09-19): the hero gradient comes from
          brand.gradient when a brand is provided, so Coma visitors see
          the Coma gradient instead of the legacy AIS magenta. */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: brand?.gradient
            ? brand.gradient
            : "linear-gradient(to bottom right, #820A7D, #5b0758, #FF005A)",
        }}
      >
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0,230,255,0.3) 0%, transparent 50%)",
        }} />
        <div className={`relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 ${heroImageUrl ? "grid lg:grid-cols-2 gap-8 lg:gap-12 items-center" : ""}`}>
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 mb-4">
              <span className="text-2xl">{flag}</span>
              {brandName} · {chapter.country.name}
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-3">
              {chapter.name} Chapter
            </h1>
            {chapter.city && (
              <p className="text-lg sm:text-xl text-white/90 mb-6 flex items-center gap-2">
                <MapPin className="h-5 w-5" /> {chapter.city}
              </p>
            )}
            <p className="text-base sm:text-lg text-white/80 max-w-2xl mb-8">
              {brandName === "AI Salon" ? (
                <>
                  Join the local AI community in {chapter.name}. Sign up to
                  register for upcoming events, connect with other members,
                  and get invited to invite-only salons.
                </>
              ) : (
                <>
                  Join the {brandName} community in {chapter.name}. Sign up to
                  register for upcoming events and connect with other
                  community builders near you.
                </>
              )}
            </p>

            {/* Quick stats */}
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="font-semibold">{chapter.memberCount}</span>
                <span className="text-white/70">members</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="font-semibold">{chapter.eventCount}</span>
                <span className="text-white/70">events hosted</span>
              </div>
            </div>

            {/* Community links */}
            {(whatsappUrl || linkedinUrl) && (
              <div className="flex flex-wrap items-center gap-3 mt-6">
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 hover:bg-white/25 px-4 py-2 text-xs font-semibold backdrop-blur transition"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp group
                  </a>
                )}
                {linkedinUrl && (
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 hover:bg-white/25 px-4 py-2 text-xs font-semibold backdrop-blur transition"
                  >
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Hero image — right column on lg+. Renders inside a rounded
              white card so the brand image is the visual focal point of
              the chapter identity. Skipped entirely when no URL is set
              (gradient-only hero, single-column layout). */}
          {heroImageUrl && (
            <div className="relative">
              <div className="relative aspect-square w-full max-w-md mx-auto rounded-2xl overflow-hidden border border-white/20 bg-white shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImageUrl}
                  alt={`${chapter.name} chapter hero`}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Left: Upcoming events */}
          <div className="lg:col-span-3 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-black mb-1">
                Upcoming events
              </h2>
              <p className="text-sm text-black/60">
                Sign up to register for any of these.
              </p>
            </div>

            {chapter.events.length === 0 ? (
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-8 text-center">
                <Calendar className="h-8 w-8 text-black/40 mx-auto mb-3" />
                <p className="text-sm text-black/70">
                  No upcoming events scheduled yet. Sign up to be notified
                  when the next salon is announced.
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {chapter.events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/e/${event.slug}`}
                      className="group block rounded-lg border border-black/10 bg-white hover:border-[#FF005A]/40 hover:shadow-md transition p-4"
                    >
                      <div className="flex gap-4">
                        {event.mainImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={event.mainImageUrl}
                            alt={event.title}
                            className="h-16 w-16 sm:h-20 sm:w-20 rounded-md object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-md bg-gradient-to-br from-[#820A7D] to-[#FF005A] flex items-center justify-center flex-shrink-0">
                            <Calendar className="h-6 w-6 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-black group-hover:text-[#FF005A] transition line-clamp-1">
                            {event.title}
                          </h3>
                          {event.subtitle && (
                            <p className="text-sm text-black/60 line-clamp-2 mt-0.5">
                              {event.subtitle}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-black/60">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {fmtDate(new Date(event.startsAt), chapter.timezone)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmtTime(new Date(event.startsAt), chapter.timezone)}
                            </span>
                            {event.venue && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.venue}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {event.rsvpCount} RSVPs
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-black/30 group-hover:text-[#FF005A] transition flex-shrink-0 mt-1" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right: Sign-up form (anon) OR Join card (signed-in) */}
          <aside className="lg:col-span-2">
            <div className="lg:sticky lg:top-8 rounded-xl border bg-gradient-to-b to-white p-6 shadow-sm" style={{ borderColor: `${accentDeep}33`, backgroundImage: `linear-gradient(to bottom, ${accentDeep}0A, white)` }}>
              {me ? (
                // ── SIGNED-IN JOIN CARD ─────────────────────────────
                // Read-only masked identity + single Join button. No
                // editable fields. The server reads the real values
                // from the profile on POST.
                <>
                  <div className="mb-5">
                    <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>
                      <Sparkles className="h-3 w-3" /> Join the chapter
                    </p>
                    <h3 className="text-xl font-bold text-black">
                      Join {brandName} {chapter.name}
                    </h3>
                    <p className="text-xs text-black/60 mt-1">
                      Your account details come straight from your profile.
                      After joining you&apos;ll see all community members
                      and be able to register for events.
                    </p>
                  </div>

                  {isMember ? (
                    <div className="text-center space-y-4 py-6">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#007E72]/10">
                        <CheckCircle2 className="h-7 w-7 text-[#007E72]" />
                      </div>
                      <h3 className="text-lg font-bold text-black">
                        You&apos;re a member
                      </h3>
                      <p className="text-sm text-black/70">
                        You can now see all members of {chapter.name} and
                        register for their events.
                      </p>
                      <Link
                        href="/events"
                        className="inline-flex items-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2 text-sm hover:bg-black/90"
                      >
                        Browse events <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-md border border-black/10 divide-y divide-black/[0.06] overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-black/[0.02]">
                          <span className="text-xs font-semibold text-black/60">
                            Name
                          </span>
                          <span
                            className="text-xs font-mono text-black/80 tracking-wide select-none"
                            aria-label="Name (hidden for privacy)"
                          >
                            {maskName(me.name || me.email.split("@")[0])}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-black/[0.02]">
                          <span className="text-xs font-semibold text-black/60">
                            Email
                          </span>
                          <span
                            className="text-xs font-mono text-black/80 tracking-wide select-none"
                            aria-label="Email (hidden for privacy)"
                          >
                            {maskEmail(me.email)}
                          </span>
                        </div>
                      </div>

                      <p className="flex items-center justify-center gap-1.5 text-[0.65rem] text-black/50 text-center">
                        <Lock className="h-3 w-3" />
                        Details are from your profile and can&apos;t be
                        edited here.
                      </p>

                      {joinError && (
                        <div className="rounded-md border px-3 py-2 text-xs" style={{ backgroundColor: `${accent}1A`, borderColor: `${accent}4D`, color: accent }}>
                          {joinError}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleJoin}
                        disabled={joining}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-md text-white font-semibold px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: accentDeep }}
                      >
                        {joining ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Joining…
                          </>
                        ) : (
                          <>
                            Join {chapter.name}{" "}
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : success ? (
                // ── ANON SUCCESS (post-signup confirmation) ─────────
                <div className="text-center space-y-4 py-6">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#007E72]/10">
                    <CheckCircle2 className="h-7 w-7 text-[#007E72]" />
                  </div>
                  <h3 className="text-lg font-bold text-black">
                    You&apos;re in!
                  </h3>
                  <p className="text-sm text-black/70">{success}</p>
                  <Link
                    href={`/login?chapterSlug=${encodeURIComponent(chapter.slug)}&city=${encodeURIComponent(chapter.name)}`}
                    className="inline-flex items-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2 text-sm hover:bg-black/90"
                  >
                    Sign in <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                // ── ANON SIGN-UP FORM ────────────────────────────────
                <>
                  <div className="mb-5">
                    <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>
                      <Sparkles className="h-3 w-3" /> Join the chapter
                    </p>
                    <h3 className="text-xl font-bold text-black">
                      Sign up for {brandName} {chapter.name}
                    </h3>
                    <p className="text-xs text-black/60 mt-1">
                      Your account will be tagged to{" "}
                      <strong>{chapter.name}</strong>, {chapter.country.name}.
                      You&apos;ll get a password by email — use it to sign in
                      and register for events.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-black/70 mb-1.5">
                        Your name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Jane Cohen"
                          autoComplete="name"
                          required
                          className="w-full rounded-md border border-black/15 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                          style={{ "--tw-ring-color": accent } as React.CSSProperties}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-black/70 mb-1.5">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                          required
                          className="w-full rounded-md border border-black/15 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                          style={{ "--tw-ring-color": accent } as React.CSSProperties}
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-md border px-3 py-2 text-xs" style={{ backgroundColor: `${accent}1A`, borderColor: `${accent}4D`, color: accent }}>
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !email || !name}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md text-white font-semibold px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: accentDeep }}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Creating
                          your account…
                        </>
                      ) : (
                        <>
                          Sign up for {chapter.name}{" "}
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>

                  <p className="text-xs text-black/50 mt-4 text-center">
                    Already have an account?{" "}
                    <Link
                      href={`/login?chapterSlug=${encodeURIComponent(chapter.slug)}&city=${encodeURIComponent(chapter.name)}${brand ? `&brand=${encodeURIComponent(brand.slug)}` : ""}`}
                      className="font-semibold hover:underline"
                      style={{ color: accentDeep }}
                    >
                      Sign in
                    </Link>
                  </p>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-black/10 bg-white mt-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/60 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            © {new Date().getFullYear()} {brandName} · {chapter.name} Chapter
          </span>
          <Link
            href="/"
            className="text-black/60 hover:text-black underline-offset-4 hover:underline"
          >
            All chapters
          </Link>
        </div>
      </footer>
    </div>
  );
}
