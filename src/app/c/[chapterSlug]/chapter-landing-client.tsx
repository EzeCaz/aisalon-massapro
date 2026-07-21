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
} from "lucide-react";
import { AiSalonLogo } from "@/components/brand/aisalon-logo";

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
  country: Country;
  memberCount: number;
  eventCount: number;
  events: UpcomingEvent[];
};

type Props = { chapter: Chapter };

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

export function ChapterLandingClient({ chapter }: Props) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign-up failed.");
      } else {
        setSuccess(
          data.message ||
            `Welcome to AI Salon ${chapter.name}! Check your email for your password.`
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

  const flag = chapter.country.flagEmoji || "🌍";

  // Normalize social URLs at render time so links like "linkedin.com/foo"
  // (entered without https://) still resolve to the external site instead
  // of being treated as a relative path on aisalon.massapro.com.
  const whatsappUrl = normalizeUrl(chapter.whatsappGroupUrl);
  const linkedinUrl = normalizeUrl(chapter.linkedinUrl);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <AiSalonLogo />
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-black/70 hover:text-black"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero — chapter identity */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#820A7D] via-[#5b0758] to-[#FF005A] text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0,230,255,0.3) 0%, transparent 50%)",
        }} />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 mb-4">
            <span className="text-2xl">{flag}</span>
            AI Salon · {chapter.country.name}
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
            Join the local AI community in {chapter.name}. Sign up to register
            for upcoming events, connect with other members, and get invited
            to invite-only salons.
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

          {/* Right: Sign-up form */}
          <aside className="lg:col-span-2">
            <div className="lg:sticky lg:top-8 rounded-xl border border-[#820A7D]/20 bg-gradient-to-b from-[#820A7D]/[0.04] to-white p-6 shadow-sm">
              {success ? (
                <div className="text-center space-y-4 py-6">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#007E72]/10">
                    <CheckCircle2 className="h-7 w-7 text-[#007E72]" />
                  </div>
                  <h3 className="text-lg font-bold text-black">
                    You&apos;re in!
                  </h3>
                  <p className="text-sm text-black/70">{success}</p>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2 text-sm hover:bg-black/90"
                  >
                    Sign in <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-5">
                    <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
                      <Sparkles className="h-3 w-3" /> Join the chapter
                    </p>
                    <h3 className="text-xl font-bold text-black">
                      Sign up for AI Salon {chapter.name}
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
                          className="w-full rounded-md border border-black/15 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
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
                          className="w-full rounded-md border border-black/15 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-md bg-[#FF005A]/10 border border-[#FF005A]/30 px-3 py-2 text-xs text-[#FF005A]">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !email || !name}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#820A7D] text-white font-semibold px-4 py-3 text-sm hover:bg-[#820A7D]/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      href={`/login?callbackUrl=/c/${chapter.slug}`}
                      className="font-semibold text-[#820A7D] hover:underline"
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
            © {new Date().getFullYear()} AI Salon · {chapter.name} Chapter
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
