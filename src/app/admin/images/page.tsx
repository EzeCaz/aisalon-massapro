import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdmin, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ImagesGallery } from "./images-gallery";
import { WhatsAppLinkEditor } from "./whatsapp-link-editor";
import { AnalyticsSettingsEditor } from "./analytics-settings-editor";
import { getPublicSettings } from "@/lib/site-settings";

export const metadata = { title: "Brand Images — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/images
 *
 * Super-Admin page that manages the site's brand images:
 *   - View every image in the hidden `.images/` stock folder
 *   - View every uploaded image in Vercel Blob (brand-assets/ prefix)
 *   - Upload new brand images to Vercel Blob (drag-and-drop or click)
 *   - Select any image as the favicon, login-page hero, or login-page banner
 *
 * Selections are stored in the SiteSetting table and read by layout.tsx +
 * login/page.tsx (server-side) via /api/site-settings. Changes take effect
 * immediately on the next page load — no redeploy needed.
 *
 * Permission gate: SUPER_ADMIN only (writes affect every page on the site).
 * Regular ADMINs can still VIEW the stock images via the legacy
 * /api/admin/hidden-images route, but the upload + select buttons on this
 * page are only functional for SUPER_ADMIN.
 */
export default async function AdminImagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/images");

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // Auto-sync: if the user's email is in the SUPER_ADMIN_EMAILS allowlist
  // but their DB role isn't SUPER_ADMIN yet, upgrade it inline so the UI
  // immediately reflects their true role. (Same pattern as /admin.)
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Allow view access for any admin (consistent with /admin), but the
  // upload + select buttons in ImagesGallery are SUPER_ADMIN-only at the
  // API layer, so a non-super-admin viewing the page will see the gallery
  // but get 403s if they try to write.
  if (!can(me.role, "members.view") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  const isSuper = isSuperAdmin({ email: me.email, role: me.role });

  // Load the current WhatsApp link so the editor can pre-fill the input.
  const settings = await getPublicSettings();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Brand Assets
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Brand images
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Upload brand images and choose which one is used as the site&rsquo;s{" "}
            <strong>favicon</strong>, <strong>login hero</strong>, and{" "}
            <strong>login banner</strong>. Stock images from the{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.85em]">.images/</code>{" "}
            folder (admin-only) are automatically copied to Vercel Blob when
            you select them, so they become publicly accessible. Changes take
            effect immediately on the next page load — no redeploy needed.
          </p>
          {!isSuper && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You are signed in as <strong>Admin</strong> (not Super Admin).
              You can view the gallery, but only Super Admins can upload images
              or change the favicon / login hero / login banner selections.
            </div>
          )}
        </div>

        <ImagesGallery />

        {/* WhatsApp group link editor — sits below the brand images gallery.
            SUPER_ADMIN-only writes (enforced by the API), but visible to any
            admin viewer so they can see the current value. */}
        <div className="mt-8">
          <WhatsAppLinkEditor
            currentUrl={settings.whatsappGroupUrl}
            canEdit={isSuper}
          />
        </div>

        {/* Analytics IDs editor — GA4 + Meta Pixel. Scripts only load
            after visitor consent (cookie banner). SUPER_ADMIN-only writes. */}
        <div className="mt-6">
          <AnalyticsSettingsEditor
            currentGa4Id={settings.ga4MeasurementId}
            currentMetaPixelId={settings.metaPixelId}
            canEdit={isSuper}
          />
        </div>
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
