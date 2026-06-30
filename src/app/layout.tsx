import type { Metadata } from "next";
import Script from "next/script";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { getPublicSettings } from "@/lib/site-settings";
import {
  GTM_ID,
  GA4_MEASUREMENT_ID,
  META_PIXEL_ID,
} from "@/lib/tracking/tracking-ids";

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

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");

/**
 * generateMetadata — pulls the current favicon + login banner from the
 * SiteSetting table so the Super Admin can change them at runtime via
 * /admin/images WITHOUT a redeploy.
 *
 * The function is async + DB-backed, but the underlying getPublicSettings()
 * is wrapped in try/catch and returns sensible DEFAULTS if the DB is
 * unreachable (so the build never fails on a fresh DB).
 *
 * Revalidated every 5 minutes (matches the /api/site-settings cache
 * header) — admin changes propagate within 5 minutes to all clients.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();

  // Normalize the favicon URL — if it's a relative path ("/images/..."),
  // it works as-is. If it's an absolute URL (Vercel Blob), also works.
  // If the admin somehow cleared the row, fall back to the default.
  const faviconUrl = settings.favicon || "/images/favicon.webp";
  const bannerUrl = settings.loginBanner || "/images/falafel-meerkat.jpg";

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "AI Salon Tel Aviv — MassaPro",
      template: "%s — AI Salon Tel Aviv",
    },
    description:
      "AI Salon Tel Aviv — the community platform for AI Salon's Tel Aviv chapter. Empowering AI connections.",
    keywords: [
      "AI Salon",
      "Tel Aviv",
      "MassaPro",
      "AI community",
      "Israel AI",
      "Empowering AI Connections",
    ],
    authors: [{ name: "MassaPro" }],
    openGraph: {
      title: "AI Salon Tel Aviv — MassaPro",
      description: "Empowering AI connections. Tel Aviv chapter platform.",
      siteName: "AI Salon Tel Aviv",
      type: "website",
      url: siteUrl,
      images: [
        {
          url: bannerUrl,
          width: 1200,
          height: 630,
          alt: "AI Salon Tel Aviv — brand image",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "AI Salon Tel Aviv — MassaPro",
      description: "Empowering AI connections.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Tracking scripts — loaded with strategy="afterInteractive"
            so they don't block First Contentful Paint. All three are
            gated by cookie consent inside their respective tracker
            modules (ga4.ts / meta-pixel.ts check consent before firing). */}

        {/* Google Tag Manager — kicks off GA4 + any future GTM tags. */}
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>

        {/* GA4 — direct gtag fallback in case GTM is blocked. */}
        <Script
          id="ga4-init"
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
        />
        <Script id="ga4-config" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('consent', 'default', {
              'analytics_storage': 'denied',
              'ad_storage': 'denied',
            });
            gtag('config', '${GA4_MEASUREMENT_ID}', { send_page_view: false });
          `}
        </Script>

        {/* Meta Pixel (Facebook) — for ad attribution. */}
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      </head>
      <body
        className={`${plusJakarta.variable} ${inter.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
        <SonnerToaster position="top-right" />
      </body>
    </html>
  );
}
