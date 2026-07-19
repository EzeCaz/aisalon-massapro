import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ChapterEditor } from "../chapter-editor";

export const metadata = { title: "New chapter — AI Salon" };

export default async function NewChapterPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/chapters/new");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, countryId: true },
  });
  if (!me) redirect("/login");

  const isSuperAdmin = isSuperAdminEmail(me.email) || me.role === ROLES.SUPER_ADMIN;
  // Admin can create chapters only in their own country.
  if (!isSuperAdmin && me.role !== ROLES.ADMIN) redirect("/admin/chapters");

  const countries = await db.country.findMany({
    where: isSuperAdmin ? {} : { id: me.countryId ?? "___NEVER___" },
    select: { id: true, name: true, code: true, flagEmoji: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-black">New chapter</h1>
          <p className="mt-1 text-sm text-black/70">
            Create a new chapter under a country. Once created, you can attach events, members, and
            email flows to this chapter.
          </p>
        </div>
        <ChapterEditor mode="new" countries={countries} isSuperAdmin={isSuperAdmin} />
      </main>
    </div>
  );
}
