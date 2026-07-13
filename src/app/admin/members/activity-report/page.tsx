import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ActivityReportClient } from "./activity-report-client";
import Link from "next/link";
import { Activity, ArrowLeft } from "lucide-react";

export const metadata = { title: "Member Activity Report — Admin — AI Salon Tel Aviv" };

/**
 * /admin/members/activity-report?email=<email>
 *
 * Per-member activity report. Aggregates every observable action the
 * platform records for a single user (looked up by primary or secondary
 * email) and renders it as a chronological feed.
 *
 * Auth: ADMIN or SUPER_ADMIN only.
 */
export default async function ActivityReportPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/members/activity-report");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true },
  });
  if (!me) redirect("/login?callbackUrl=/admin/members/activity-report");

  if (me.role !== ROLES.ADMIN && me.role !== ROLES.SUPER_ADMIN) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const email = sp.email || "";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <AdminTabs role={me.role} />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
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
            <Activity className="h-8 w-8 text-[#FF005A]" />
            Member <span className="ais-gradient-text">Activity Report</span>
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl">
            Aggregated chronological activity for a single member, looked up by email.
            Includes emails sent/opened/clicked, RSVPs, check-ins, co-host assignments,
            speaker slots, referral traffic driven, direct messages, and more.
          </p>
          <p className="mt-2 text-xs text-black/50 max-w-3xl">
            Note: page-level view tracking (which tabs/pages the user opened inside the app)
            is currently not persisted — only email opens/clicks and referral-link visits
            are recorded. See the API route source for details.
          </p>
        </div>

        <ActivityReportClient initialEmail={email} />
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
