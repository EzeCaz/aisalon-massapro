import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { getPublicSettings } from "@/lib/site-settings";
import { CookieConsentBanner } from "@/components/ais/cookie-consent-banner";
import { AnalyticsScripts } from "@/components/ais/analytics-scripts";
import {
  resolveBrandMetadata,
  brandDescription,
} from "@/lib/brand/brand-metadata";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * generateMetadata — BRAND-AWARE (Phase 2 of Coma brand isolation).
 *
 * Previously this hard-coded "AI Salon Tel Aviv" in the default title,
 * title template, description, and OG tags — which leaked AIS branding
 * to every page a Coma user visited on coma.massapro.com (browser tab
 * + social shares).
 *
 * Now: brand resolves from the request host (coma.massapro.com → coma)
 * or `?brand=` param, and the per-host siteUrl drives metadataBase so
 * OG URLs resolve against the domain the visitor is actually on.
 *
 * Child pages that return `{ title: "Events" }` inherit the brand-aware
 * template → "Events — Coma Tel Aviv" / "Events — AI Salon Tel Aviv".
 *
 * The function remains async + DB-backed for the favicon/banner (admin
 * editable at /admin/images), with try/catch-safe defaults so the build
 * never fails on a fresh DB.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const { brand, siteUrl, displayTitle, city } = await resolveBrandMetadata();

  // Favicon resolution chain (highest precedence first):
  //   1. Brand-level favicon (brand-config.ts: `brand.favicon`).
  //      For Coma this is /brand/coma/favicon-32.png — every Coma
  //      browser tab shows the Coma mark, not the AIS meerkat.
  //   2. Global SiteSetting.favicon (admin-editable at /admin/images).
  //      Single global row, currently the AIS Blob URL — this is the
  //      legacy tier that AIS still uses today.
  //   3. Hard-coded fallback /images/favicon.webp (the AIS webp file).
  //
  // The brand tier is checked first so a brand can override the global
  // favicon without an admin having to set it. AIS has `favicon: ""`
  // today, so it falls through to the global SiteSetting tier — i.e.
  // AIS behavior is unchanged.
  const faviconUrl = brand.favicon || settings.favicon || "/images/favicon.webp";

  // OG / Twitter banner resolution chain (unchanged from Phase 2 of
  // Coma brand isolation):
  //   1. Brand-level hero (brand.heroBanner) — only for Coma today.
  //   2. Global SiteSetting.loginBanner — admin-editable, AIS uses this.
  //   3. Hard-coded fallback /images/falafel-meerkat.jpg.
  const bannerUrl =
    (brand.slug === "coma" && brand.heroBanner) ||
    settings.loginBanner ||
    "/images/falafel-meerkat.jpg";

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: `${displayTitle} — MassaPro`,
      template: `%s — ${displayTitle}`,
    },
    description: brandDescription(brand),
    keywords: [
      brand.displayName,
      city,
      "MassaPro",
      "AI community",
      "Israel AI",
      brand.tagline,
    ],
    authors: [{ name: "MassaPro" }],
    openGraph: {
      title: `${displayTitle} — MassaPro`,
      description: brandDescription(brand),
      siteName: displayTitle,
      type: "website",
      url: siteUrl,
      images: [
        {
          url: bannerUrl,
          width: 1200,
          height: 630,
          alt: `${displayTitle} — brand image`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayTitle} — MassaPro`,
      description: brandDescription(brand),
      images: [bannerUrl],
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        // Dynamic favicon — admin can change via /admin/images.
        // Type depends on extension; we send it without a type so the
        // browser sniffs from the URL (works for both .webp and .png/.jpg).
        { url: faviconUrl },
      ],
      apple: [{ url: faviconUrl }],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pull GA4 + Meta Pixel IDs from SiteSetting so the admin can enable
  // them at /admin/images without a redeploy.
  const settings = await getPublicSettings();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${plusJakarta.variable} ${inter.variable} font-sans antialiased bg-background text-foreground`}
        // `suppressHydrationWarning` is REQUIRED on <body> because browser
        // extensions (e.g. Vietnamese-translation tool "NewVT" injects
        // `inject_newvt_svd="true"`) mutate the <body> attributes after SSR
        // but before React hydrates. Without this, React throws a
        // "tree hydrated but attributes didn't match" console error on
        // every page load for users with that extension installed. The
        // warning is benign (the injected attribute is cosmetic) and
        // suppressing it is the documented React/Next.js pattern for
        // third-party DOM mutation.
        suppressHydrationWarning
      >
        <Providers>
          {children}
          {/* Cookie consent banner — shows on first visit, stores choice
              in localStorage for 6 months. */}
          <CookieConsentBanner />
          {/* GA4 + Meta Pixel scripts — only loaded AFTER the user clicks
              "Accept All" on the consent banner. Both IDs come from
              SiteSetting (admin-editable at /admin/images). */}
          <AnalyticsScripts
            ga4MeasurementId={settings.ga4MeasurementId}
            metaPixelId={settings.metaPixelId}
          />
        </Providers>
        <Toaster />
        <SonnerToaster position="top-right" />
      </body>
    </html>
  );
}
