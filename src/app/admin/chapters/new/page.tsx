import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdminEmail, ROLES, getEffectiveRole} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ChapterEditor } from "../chapter-editor";

export const metadata = { title: "New chapter — AI Salon" };

export default async function NewChapterPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/chapters/new");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    // Phase 2: include brandSlug so ChapterEditor can build brand-aware share URLs.
    select: { id: true, email: true, role: true, countryId: true, brandSlug: true },
  });
  if (!me) redirect("/login");


  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  const isSuperAdmin = isSuperAdminEmail(me.email) || me.role === ROLES.SUPER_ADMIN;
  const isBrandAdmin = me.role === ROLES.BRAND_ADMIN;
  // Admin can create chapters only in their own country.
  // BRAND_ADMIN (Round 2, 2026-09-30) can create chapters in ANY country
  // — their brand might span multiple countries. Their chapters are auto-
  // tagged with me.brandId via the chapter-create API.
  if (!isSuperAdmin && !isBrandAdmin && me.role !== ROLES.ADMIN) redirect("/admin/chapters");

  // BRAND_ADMIN sees all countries (their brand might span multiple).
  // Country-scoped ADMINs see only their own country.
  // Super Admin sees everything.
  const countries = await db.country.findMany({
    where: isSuperAdmin || isBrandAdmin ? {} : { id: me.countryId ?? "___NEVER___" },
    select: { id: true, name: true, code: true, flagEmoji: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-black">New chapter</h1>
          <p className="mt-1 text-sm text-black/70">
            Create a new chapter under a country. Once created, you can attach events, members, and
            email flows to this chapter.
          </p>
        </div>
        <ChapterEditor mode="new" countries={countries} isSuperAdmin={isSuperAdmin} brandSlug={me.brandSlug ?? "aisalon"} />
      </main>
    </div>
  );
}
