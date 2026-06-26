import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { getPublicSettings } from "@/lib/site-settings";

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
