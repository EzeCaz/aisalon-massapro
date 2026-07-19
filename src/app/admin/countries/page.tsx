import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { CountriesManager } from "./countries-manager";
import { Globe2 } from "lucide-react";

export const metadata = { title: "Countries — Admin — AI Salon" };

export default async function AdminCountriesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/countries");

  let me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN role
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({ where: { id: me.id }, data: { role: ROLES.SUPER_ADMIN } });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Only Super Admin can access this page.
  if (!isSuperAdminEmail(me.email)) {
    redirect("/admin/chapters");
  }

  const countries = await db.country.findMany({
    include: {
      _count: { select: { chapters: true, users: true } },
    },
    orderBy: { name: "asc" },
  });

  const countriesJson = JSON.parse(JSON.stringify(countries));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2 flex items-center gap-2">
            <Globe2 className="h-3 w-3" />
            V7 Hierarchy · Super Admin
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Manage countries
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl">
            Create new countries to expand the platform&apos;s geographic scope. Each country can
            contain multiple chapters (cities). Once a country exists, use the Chapters page to add
            chapters inside it and assign members.
          </p>
        </div>

        <CountriesManager countries={countriesJson} />
      </main>
    </div>
  );
}
