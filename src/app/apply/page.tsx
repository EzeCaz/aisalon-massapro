import Link from "next/link";
import { db } from "@/lib/db";
import { BRANDS } from "@/lib/brand/brand-config";
import { BrandGradientText } from "@/components/brand/brand-logo";
import { BrandHeaderLogo } from "@/components/brand/brand-header-logo";
import type { Metadata } from "next";

/**
 * /apply — public landing page for community leads.
 *
 * Anyone visiting this page (no auth required) learns what Coma offers
 * to community builders + can click "Apply now" → /apply/login → /apply/form.
 *
 * The page shows:
 *   - The Coma value prop (what we do for communities)
 *   - The branding material we ask for (brand book, colors, mascot,
 *     slogan, logo) — so leads know what to prepare
 *   - A "What you get" section (per-brand login, emails, chapters,
 *     events, mockups, knowledge base — all separated per brand)
 *   - A "How the process works" timeline (apply → review → provision → launch)
 *   - Existing brands as social proof (loaded from the DB)
 *   - Final CTA → /apply/login
 *
 * The page is brand-aware: it renders in the resolved brand's palette
 * (Coma on platform.joincoma.com, AIS on aisalon.massapro.com — though
 * AIS visitors see this page too since it's a platform-wide surface).
 */
export const metadata: Metadata = {
  title: "Bring your community to Coma",
  description:
    "Apply to bring your community to Coma. Get your own brand on the platform — login page, emails, events, members, knowledge base — all separated and customized to your brand.",
};

export const dynamic = "force-dynamic";

export default async function ApplyLandingPage() {
  // Load existing brands (excluding Coma — the platform parent — since
  // it's not a "customer"). AIS counts as social proof.
  const brands = await db.brand.findMany({
    where: {
      status: "ACTIVE",
      slug: { not: "coma" },
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      wordmark: true,
      tagline: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      mascotName: true,
      mascotImageUrl: true,
      _count: { select: { chapters: true, users: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const coma = BRANDS.coma;

  return (
    <div className="min-h-screen bg-white">
      {/* Header — Coma brand logo */}
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandHeaderLogo
              brand={{
                slug: coma.slug,
                wordmark: coma.wordmark,
                tagline: coma.tagline,
                primaryColor: coma.primaryColor,
                secondaryColor: coma.secondaryColor,
                accentColor: coma.accentColor,
                gradient: coma.gradient,
              }}
            />
          </Link>
          <Link
            href="/apply/login"
            className="text-sm font-semibold text-white px-4 py-2 rounded-md"
            style={{ backgroundColor: coma.primaryColor }}
          >
            Apply now
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: coma.gradient }}
      >
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.3) 0%, transparent 50%)",
        }} />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 mb-4">
            For community builders
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-4 leading-tight">
            Bring your community to{" "}
            <BrandGradientText gradient="linear-gradient(90deg, #fff 0%, #fff8 100%)">
              Coma
            </BrandGradientText>
          </h1>
          <p className="text-lg sm:text-xl text-white/90 mb-8 max-w-2xl">
            Get your own brand on the platform — a customized login page,
            your colors + logo + mascot, your own email templates + chapter
            events + member directory + knowledge base. All in one place.
            Skipped fields inherit Coma defaults so you can launch fast.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/apply/login"
              className="inline-flex items-center gap-2 rounded-md bg-white text-black font-bold px-6 py-3 text-sm hover:bg-white/90 transition"
              style={{ color: coma.primaryColor }}
            >
              Apply now →
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-md bg-white/10 backdrop-blur text-white font-semibold px-5 py-3 text-sm hover:bg-white/20 transition"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 space-y-16">
        {/* What we ask for — branding material checklist */}
        <section>
          <h2 className="text-3xl font-extrabold text-black mb-2">
            What to prepare
          </h2>
          <p className="text-base text-black/70 mb-8 max-w-2xl">
            Everything you need to apply for your brand. All optional
            except your name, email, brand name, and brand slug — skipped
            fields inherit Coma's defaults.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BRANDING_MATERIALS.map((m) => (
              <div
                key={m.title}
                className="rounded-xl border border-black/10 bg-white p-5"
              >
                <div
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md mb-3"
                  style={{ backgroundColor: m.iconBg, color: m.iconColor }}
                >
                  {m.emoji}
                </div>
                <h3 className="text-base font-bold text-black mb-1">
                  {m.title}
                </h3>
                <p className="text-xs text-black/70 leading-relaxed">
                  {m.description}
                </p>
                {m.optional && (
                  <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: coma.secondaryColor }}>
                    Optional
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* What you get */}
        <section>
          <h2 className="text-3xl font-extrabold text-black mb-2">
            What you get
          </h2>
          <p className="text-base text-black/70 mb-8 max-w-2xl">
            Every brand on Coma gets its own isolated instance of these
            surfaces — configured by your branding, not shared with other
            brands.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {WHAT_YOU_GET.map((w) => (
              <div
                key={w.title}
                className="rounded-xl border border-black/10 bg-white p-5 flex items-start gap-3"
              >
                <div
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md flex-shrink-0"
                  style={{ backgroundColor: coma.primaryColor, color: "#fff" }}
                >
                  {w.emoji}
                </div>
                <div>
                  <h3 className="text-base font-bold text-black mb-1">
                    {w.title}
                  </h3>
                  <p className="text-xs text-black/70 leading-relaxed">
                    {w.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works">
          <h2 className="text-3xl font-extrabold text-black mb-2">
            How the process works
          </h2>
          <p className="text-base text-black/70 mb-8 max-w-2xl">
            From application to launch, in four steps. Typical turnaround:
            2 business days from application to provisioned brand.
          </p>
          <ol className="space-y-4">
            {STEPS.map((s, idx) => (
              <li key={s.title} className="flex items-start gap-4">
                <div
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full font-bold text-sm flex-shrink-0"
                  style={{
                    backgroundColor: coma.primaryColor,
                    color: "#fff",
                  }}
                >
                  {idx + 1}
                </div>
                <div>
                  <h3 className="text-base font-bold text-black mb-1">
                    {s.title}
                  </h3>
                  <p className="text-sm text-black/70 leading-relaxed max-w-2xl">
                    {s.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Existing brands as social proof */}
        {brands.length > 0 && (
          <section>
            <h2 className="text-3xl font-extrabold text-black mb-2">
              Communities already on Coma
            </h2>
            <p className="text-base text-black/70 mb-6">
              {brands.length} brand{brands.length === 1 ? "" : "s"} running on the platform today.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {brands.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-black/10 bg-white p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {b.mascotImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.mascotImageUrl}
                        alt={b.mascotName || b.displayName}
                        className="h-9 w-9 rounded-md object-contain"
                      />
                    ) : (
                      <span
                        className="inline-flex items-center justify-center h-9 w-9 rounded-md text-white text-sm font-bold"
                        style={{ backgroundColor: b.primaryColor }}
                      >
                        {b.wordmark.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <div className="font-bold text-black text-sm">{b.displayName}</div>
                      <div className="text-[0.7rem] text-black/60 font-mono">/{b.slug}</div>
                    </div>
                  </div>
                  <p className="text-[0.75rem] text-black/70 leading-snug mb-2">
                    {b.tagline}
                  </p>
                  <div className="text-[0.65rem] text-black/50">
                    {b._count.chapters} chapter{b._count.chapters === 1 ? "" : "s"} · {b._count.users} member{b._count.users === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section
          className="rounded-2xl p-8 sm:p-12 text-center text-white"
          style={{ background: coma.gradient }}
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">
            Ready to bring your community?
          </h2>
          <p className="text-base sm:text-lg text-white/90 mb-6 max-w-2xl mx-auto">
            Apply now — the form takes ~10 minutes. You can save and come
            back to it later. We review applications within 2 business days.
          </p>
          <Link
            href="/apply/login"
            className="inline-flex items-center gap-2 rounded-md bg-white font-bold px-7 py-3.5 text-sm hover:bg-white/90 transition"
            style={{ color: coma.primaryColor }}
          >
            Apply now →
          </Link>
        </section>
      </main>

      <footer className="border-t border-black/10 bg-white mt-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/60 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            © {new Date().getFullYear()} {coma.displayName} · {coma.tagline}
          </span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              MassaPro
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

// ── Static content (kept at the bottom for readability) ──────────────

const BRANDING_MATERIALS: {
  title: string;
  description: string;
  emoji: string;
  iconBg: string;
  iconColor: string;
  optional?: boolean;
}[] = [
  {
    title: "Brand name + slug",
    description:
      "Your brand's display name + a URL-friendly slug (e.g. 'danone'). Required.",
    emoji: "🏷️",
    iconBg: "#FFE5E5",
    iconColor: "#E84855",
  },
  {
    title: "Tagline / slogan",
    description:
      "Short line under the wordmark (e.g. 'One Planet. One Health'). Skip → Coma's tagline.",
    emoji: "💬",
    iconBg: "#FFF4D6",
    iconColor: "#F5A623",
    optional: true,
  },
  {
    title: "Color palette",
    description:
      "Primary, secondary, accent hex colors + a hero gradient. Skip → Coma's navy/amber/red palette.",
    emoji: "🎨",
    iconBg: "#E5E5FF",
    iconColor: "#0A1F44",
    optional: true,
  },
  {
    title: "Logo assets",
    description:
      "URLs for your favicon, square logo mark, hero banner, email logo. Skip → text wordmark is used.",
    emoji: "🖼️",
    iconBg: "#D6F5E5",
    iconColor: "#007E72",
    optional: true,
  },
  {
    title: "Mascot",
    description:
      "Optional character representing your brand (name + image URL + 1-sentence backstory). e.g. AIS has the falafel meerkat.",
    emoji: "🦊",
    iconBg: "#FFE5D6",
    iconColor: "#820A7D",
    optional: true,
  },
  {
    title: "Brand book / style guide",
    description:
      "Link to your full brand guidelines (PDF/DOC/Figma) — typography, logo usage, do/don'ts. Super Admin references this when provisioning.",
    emoji: "📘",
    iconBg: "#E5F0FF",
    iconColor: "#004F98",
    optional: true,
  },
  {
    title: "Login page copy",
    description:
      "Eyebrow, H1 headline template, subtitle, form heading, footer credit. Skip → Coma's templates with your brand name interpolated.",
    emoji: "✍️",
    iconBg: "#F5E5FF",
    iconColor: "#7C3AED",
    optional: true,
  },
  {
    title: "Email config",
    description:
      "From: name (e.g. 'Danone <noreply@danone.com>') + contact email. Skip → Coma's defaults (coma@massapro.com).",
    emoji: "📧",
    iconBg: "#FFE5F5",
    iconColor: "#E84855",
    optional: true,
  },
  {
    title: "Launch plan",
    description:
      "Target launch date + first chapter's city + country. Helps us plan your onboarding.",
    emoji: "🚀",
    iconBg: "#E5FFF4",
    iconColor: "#007E72",
    optional: true,
  },
];

const WHAT_YOU_GET: { title: string; description: string; emoji: string }[] = [
  {
    title: "Custom login page",
    description:
      "Your brand's hero banner, colors, mascot, tagline, and login copy on /login?brand=<your-slug>.",
    emoji: "🔑",
  },
  {
    title: "Branded emails",
    description:
      "Transactional emails (password reset, RSVP confirmations, onboarding) sent with your From name + colors.",
    emoji: "✉️",
  },
  {
    title: "Chapter landing pages",
    description:
      "Public /c/<your-chapter> pages with your brand's header logo + colors. One per city.",
    emoji: "📍",
  },
  {
    title: "Event pages + RSVPs",
    description:
      "Per-event pages with your branding, RSVP flow, check-in codes, photo galleries.",
    emoji: "🎟️",
  },
  {
    title: "Member directory",
    description:
      "Members-only directory scoped to your brand's chapters. Cross-brand isolation enforced.",
    emoji: "👥",
  },
  {
    title: "Knowledge base",
    description:
      "Per-brand knowledge docs (Branding, Marketing, Event Mgmt, Sponsorship, Governance) — Super Admin editable per brand.",
    emoji: "📚",
  },
  {
    title: "Mockups hub",
    description:
      "Speaker intro, agenda, event profile, QR salon mockups — your brand's assets + colors per mockup.",
    emoji: "🖼️",
  },
  {
    title: "Brand-switch tabs",
    description:
      "Super Admin can switch between brands in /admin/images, /admin/email, /admin/knowledge-base, /admin/mockups — each brand's content isolated.",
    emoji: "🔀",
  },
];

const STEPS: { title: string; description: string }[] = [
  {
    title: "Sign in or create an account",
    description:
      "Click 'Apply now' → sign in with Google or email + password. Your account is what we use to identify you as the brand lead.",
  },
  {
    title: "Fill the application form",
    description:
      "~10 minutes. Enter your brand name, slug, colors, logo URLs, mascot, brand book URL, login copy, launch plan. Everything except name + slug is optional.",
  },
  {
    title: "We review your application",
    description:
      "Super Admin reviews within 2 business days. We may reach out via email with clarifying questions or suggested edits.",
  },
  {
    title: "Your brand goes live",
    description:
      "We provision your Brand row with your branding (Coma defaults for anything you skipped). You get admin access + your first chapter landing page. Launch.",
  },
];
