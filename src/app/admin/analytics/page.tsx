import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { AdminAnalyticsClient } from "./analytics-client";
import Link from "next/link";
import { BarChart3, ArrowLeft } from "lucide-react";

export const metadata = { title: "Analytics — Admin — AI Salon Tel Aviv" };

/**
 * /admin/analytics — UTM referral analytics dashboard.
 *
 * Shows:
 *   - Summary cards (total visits / new visitors / signups / RSVPs / active referrers)
 *   - 30-day visits + signups trend chart
 *   - Top referrers table
 *   - Recent visits feed + recent signups feed
 *   - Top landing pages
 *
 * Auth: ADMIN or SUPER_ADMIN only. CO_HOST gets redirected to /admin
 * (they only have event-scoped access, not site-wide analytics).
 */
export default async function AdminAnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/analytics");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true },
  });
  if (!me) redirect("/login?callbackUrl=/admin/analytics");

  if (me.role !== ROLES.ADMIN && me.role !== ROLES.SUPER_ADMIN) {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <AdminTabs role={me.role} />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-black/50 hover:text-black mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to admin
          </Link>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Admin Panel
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-[#FF005A]" />
            Referral <span className="ais-gradient-text">Analytics</span>
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl">
            Track how members are driving traffic and signups via their unique share links.
            Each member has a unique <code className="text-xs font-mono bg-black/5 px-1 py-0.5 rounded">utm_uid</code>{" "}
            (12-char hex) — every visit, signup, and event RSVP attributed to a share link
            appears here in real time.
          </p>
        </div>

        <AdminAnalyticsClient />
      </main>
      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/80 underline-offset-4 hover:underline"
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
