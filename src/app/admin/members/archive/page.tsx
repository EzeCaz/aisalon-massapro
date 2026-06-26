import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import Link from "next/link";
import { ArrowLeft, Archive as ArchiveIcon, RotateCcw } from "lucide-react";
import { ArchiveListClient } from "./archive-list-client";

export const metadata = { title: "Archived Members — Admin — AI Salon Tel Aviv" };

/**
 * /admin/members/archive — Super-Admin-only view of all archived members.
 *
 * Archived members are users with archivedAt != null. They're excluded
 * from the main members list at /admin. This page is the ONLY place to
 * see and restore them.
 *
 * Permission gate: SUPER_ADMIN only (hard-coded by email). ADMIN, CO_HOST,
 * and MEMBER roles are redirected to /admin.
 */
export default async function ArchivedMembersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/members/archive");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!me) redirect("/login");

  // Hard gate — only Super Admins can see archived members.
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    redirect("/admin");
  }

  // Fetch all archived members, newest archive first.
  const archived = await db.user.findMany({
    where: { archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    include: {
      tags: true,
      archiver: { select: { id: true, email: true, name: true } },
      _count: { select: { images: true, speakers: true } },
    },
  });

  // Serialize to plain JSON (Date -> ISO string) so the client component
  // types match what Prisma returns at runtime.
  const archivedJson = JSON.parse(JSON.stringify(archived));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-semibold text-black/50 hover:text-black mb-3"
          >
            <ArrowLeft className="h-3 w-3" /> Back to members
          </Link>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#820A7D] mb-2">
            <ArchiveIcon className="inline h-3 w-3 mr-1" />
            Admin Panel · Archived Members (Super Admin only)
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Archived <span className="ais-gradient-text">members</span>
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            {archived.length === 0
              ? "No archived members yet. When you archive a member, they will appear here and can be restored at any time."
              : `${archived.length} archived member${archived.length === 1 ? "" : "s"}. Archived members are hidden from the main list — their data is preserved for audit. Click Restore to return them to the active members list.`}
          </p>
        </div>

        {archived.length === 0 ? (
          <div className="rounded-md border border-black/10 bg-white p-12 text-center">
            <ArchiveIcon className="h-10 w-10 text-black/20 mx-auto mb-3" />
            <p className="text-sm text-black/50">
              The archive is empty. Archive a member from the{" "}
              <Link
                href="/admin"
                className="text-[#820A7D] hover:underline font-semibold"
              >
                members list
              </Link>{" "}
              to see them here.
            </p>
          </div>
        ) : (
          <ArchiveListClient members={archivedJson} />
        )}
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
