import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/permissions";
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
 * Super-Admin-only page that:
 *   - Shows the brand's current state (palette, status, mascot metadata)
 *   - Renders 6 asset tiles (logo, hero, favicon, emailLogo, mascot, brandBook)
 *     with drag/drop upload + live preview + "Replace" / "Clear" buttons
 *   - Shows live mockup previews (4 thumbnails) rendered with the brand's
 *     assets — so the admin can see how mockups will look with the new
 *     brand before going live
 *   - Triggers a test email send (Welcome / Reminder / Go-live)
 *   - Activates the brand (sets status=ACTIVE)
 *
 * Resolution:
 *   - All assets resolve through resolveBrandAssets() — if a column is
 *     null, the resolver falls back to Coma's defaults ("if blank, show
 *     coma theme images not uploaded yet" per user spec).
 *
 * Auth:
 *   - Super Admin only. Non-super-admins are redirected to /admin.
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
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=/onboarding/${(await params).brandSlug}`);
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true, brandSlug: true },
  });
  if (!me) redirect("/login");

  if (!isSuperAdmin({ email: me.email, role: me.role }) && !isSuperAdminEmail(me.email)) {
    redirect("/admin");
  }

  const { brandSlug } = await params;

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
        <OnboardingHubClient brandAssets={brandAssets} adminEmail={me.email} />
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
