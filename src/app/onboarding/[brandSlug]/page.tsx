import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail, normalizeRole, ROLES } from "@/lib/permissions";
import { resolveBrandAssets } from "@/lib/brand/brand-assets-resolver";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { OnboardingHubClient } from "./onboarding-hub-client";
import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  resolveBrand,
  getEnvDefaultBrandSlug,
} from "@/lib/brand/resolve-brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}): Promise<Metadata> {
  const { brandSlug } = await params;
  const upper = brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);
  return {
    title: `${upper} onboarding — Coma Admin`,
    description: `Upload brand assets, configure palette, and activate ${upper} on the Coma platform.`,
  };
}

/**
 * /onboarding/[brandSlug]
 *
 * The brand-onboarding hub for an approved brand (e.g. "cazhype").
 * Auth:
 *   - Super Admin: full access to all brands + can Activate (DRAFT→ACTIVE).
 *   - BRAND_ADMIN (Option 4, 2026-09-29): full edit access to their OWN
 *     brand only (must match me.brandSlug === brandSlug). Can upload
 *     assets, edit palette, edit mascot metadata, edit login copy. The
 *     one thing they CANNOT do is "Activate brand" — that stays Super
 *     Admin only because it sends the Go-live email + flips the public
 *     status, which is a platform-level decision.
 *   - Other roles: redirected to /admin.
 *
 * Architecture note (2026-09-29):
 *   This is a NEW route (separate from /brand-onboarding/[token] which
 *   is the public invite-link form). /onboarding/[brandSlug] is the
 *   POST-approval admin hub — it operates on an already-provisioned
 *   Brand row, not on a pending BrandOnboardingInvite.
 */
export default async function OnboardingHubPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { brandSlug } = await params;
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=/onboarding/${brandSlug}`);
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true, brandSlug: true },
  });
  if (!me) redirect("/login");

  const isSa = isSuperAdmin({ email: me.email, role: me.role }) || isSuperAdminEmail(me.email);
  const isBa = normalizeRole(me.role) === ROLES.BRAND_ADMIN;
  if (!isSa && !isBa) {
    redirect("/admin");
  }
  // BRAND_ADMIN must be scoped to the same brand as the URL.
  // Super Admin can visit any /onboarding/[slug].
  if (!isSa && isBa && me.brandSlug !== brandSlug) {
    // Wrong brand — send them to their own.
    redirect(`/onboarding/${me.brandSlug ?? "coma"}`);
  } // Super Admin: can Activate + edit everything.
  // BRAND_ADMIN: can edit everything except Activate.

  // Resolve the brand's current asset state — this hits the DB and
  // falls back to brand-config.ts + Coma defaults for any null columns.
  const brandAssets = await resolveBrandAssets(brandSlug);

  // Also resolve the platform (Coma) brand for the admin shell header.
  const h = await headers();
  const host = h.get("host");
  const platformBrand = resolveBrand({
    urlBrandSlug: null,
    hostHeader: host,
    envDefaultSlug: getEnvDefaultBrandSlug(),
  });

  return (
    <main
      className="min-h-screen bg-background flex flex-col"
      style={
        {
          ["--brand-primary" as string]: platformBrand.primaryColor,
          ["--brand-accent" as string]: platformBrand.accentColor,
        } as React.CSSProperties
      }
    >
      <AppHeader />
      <AdminTabs />
      <section className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <OnboardingHubClient
          brandAssets={brandAssets}
          adminEmail={me.email}
          canActivate={isSa}
        />
      </section>
      <footer className="mt-auto border-t border-border bg-card py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-sm text-muted-foreground">
          <p>
            Brand onboarding hub ·{" "}
            <span className="font-mono">{brandSlug}</span> · Built by{" "}
            <span className="font-semibold">{me.email}</span>
          </p>
        </div>
      </footer>
    </main>
  );
}
