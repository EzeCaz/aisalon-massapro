import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/ais/app-header";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { MemberDashboard } from "./member-dashboard";

export const metadata = { title: "Member Dashboard — AI Salon Tel Aviv" };

/**
 * /admin/dashboard — admin-only analytics dashboard built from the
 * onboarding form data + spreadsheet import data. Shows breakdowns
 * of "interested in", "profile categories", "applied for", source
 * (imported vs self-registered), tag distribution, signups over time,
 * plus a filterable / sortable members table.
 */
export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/dashboard");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/events");

  // Fetch all members with the fields the dashboard cares about.
  const members = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      tags: true,
      _count: { select: { images: true, presentations: true, speakers: true } },
    },
  });

  // Serialize (Date -> ISO string) for the client component.
  const membersJson = JSON.parse(JSON.stringify(members));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-semibold text-black/50 hover:text-black mb-3"
          >
            <ArrowLeft className="h-3 w-3" /> Back to admin
          </Link>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            <BarChart3 className="inline h-3 w-3 mr-1" />
            Admin Panel · Member Dashboard
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Community <span className="ais-gradient-text">insights</span>
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Breakdown of the {members.length} members in the platform — pulled from both
            the AI Salon TLV intake spreadsheet (imported members) and the self-service
            onboarding form (self-registered members). Use the filters on the right to
            slice the data.
          </p>
        </div>

        <MemberDashboard members={membersJson} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI Connections</span>
          <span>
            Platform by{" "}
            <a
              href="https://massapro.com"
              className="text-black/60 underline-offset-4 hover:underline"
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
