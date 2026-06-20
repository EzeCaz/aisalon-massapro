import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

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

export const metadata: Metadata = {
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
        url: "/images/falafel-tlv-ai-salon.png",
        width: 1200,
        height: 630,
        alt: "AI Salon Tel Aviv — Falafel Meerkat mascot",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Salon Tel Aviv — MassaPro",
    description: "Empowering AI connections.",
    images: ["/images/falafel-tlv-ai-salon.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/falafel-meerkat.png", type: "image/png" },
    ],
    apple: [{ url: "/images/falafel-meerkat.png" }],
  },
};

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
