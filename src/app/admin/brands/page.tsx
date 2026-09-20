import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { BrandsAdminClient } from "./brands-admin-client";
import { resolveBrandMetadata } from "@/lib/brand/brand-metadata";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await resolveBrandMetadata();
  return {
    title: "Brands",
    description: `Manage ${brand.displayName} brand onboarding invites, review submissions, and provision new brands.`,
  };
}

/**
 * /admin/brands
 *
 * Super-Admin page for the brand-onboarding flow:
 *   - Create a brand-onboarding invite (emails the lead a /brand-onboarding/<token> URL)
 *   - Review submitted submissions
 *   - Provision a new Brand row from a submission (skipped fields inherit from Coma)
 *
 * Existing brands (Coma, AIS) are also listed for visibility — they're
 * managed via the DB / the brand-config.ts registry, not this page.
 */
export default async function AdminBrandsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/brands");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true, brandSlug: true },
  });
  if (!me) redirect("/login");

  if (!isSuperAdmin({ email: me.email, role: me.role }) && !isSuperAdminEmail(me.email)) {
    redirect("/admin");
  }

  // Load all invites (any status) for the admin list.
  const invites = await db.brandOnboardingInvite.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      inviteeEmail: true,
      prefillBrandName: true,
      prefillBrandSlug: true,
      status: true,
      sentAt: true,
      submittedAt: true,
      expiresAt: true,
      openedAt: true,
      appliedBrandId: true,
      appliedAt: true,
      submissionJson: true,
      invitedBy: { select: { name: true, email: true } },
    },
  });

  // Load all existing Brand rows (Coma, AIS, plus any provisioned via this flow).
  const brands = await db.brand.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      displayName: true,
      wordmark: true,
      tagline: true,
      status: true,
      parentBrandId: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      createdAt: true,
      onboardedAt: true,
      _count: { select: { chapters: true, users: true } },
    },
  });

  // Serialize dates for the client component.
  const serializedInvites = invites.map((i) => ({
    ...i,
    sentAt: i.sentAt.toISOString(),
    submittedAt: i.submittedAt?.toISOString() ?? null,
    expiresAt: i.expiresAt.toISOString(),
    openedAt: i.openedAt?.toISOString() ?? null,
    appliedAt: i.appliedAt?.toISOString() ?? null,
  }));
  const serializedBrands = brands.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
    onboardedAt: b.onboardedAt?.toISOString() ?? null,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={me.role} />
        <div className="mt-8">
          <div className="mb-6">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
              Super Admin
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
              Brands &amp; Onboarding
            </h1>
            <p className="mt-2 text-sm text-black/80 max-w-2xl">
              Invite a brand lead by email → they fill a public form with their
              branding → review the submission → provision a new Brand row.
              Skipped fields inherit from Coma (the platform parent brand).
            </p>
          </div>

          <BrandsAdminClient
            invites={serializedInvites}
            brands={serializedBrands}
          />
        </div>
      </main>
    </div>
  );
}
