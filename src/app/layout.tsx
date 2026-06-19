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

export const metadata: Metadata = {
  title: "AI Salon Tel Aviv — MassaPro",
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
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Salon Tel Aviv — MassaPro",
    description: "Empowering AI connections.",
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
