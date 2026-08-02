import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdmin, isSuperAdminEmail, canSeeAdminNav, ROLES, getEffectiveRole} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ImagesGallery } from "./images-gallery";
import { WhatsAppLinkEditor } from "./whatsapp-link-editor";
import { LinkedInLinkEditor } from "./linkedin-link-editor";
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
 *     — globally AND per-chapter (chapter overrides take precedence when
 *       a visitor is on /c/[chapterSlug] or /login?chapterSlug=…)
 *
 * Global selections are stored in the SiteSetting table.
 * Per-chapter overrides are stored in the ChapterSetting table.
 * Both are read by layout.tsx + login/page.tsx + /c/[slug] (server-side).
 * Changes take effect immediately on the next page load — no redeploy needed.
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


  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
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

  // TSK-0056: Allow ANY admin (SUPER_ADMIN, ADMIN, CHAPTER_ORGANIZER,
  // CO_HOST) to view the brand-images gallery. The previous gate used
  // `can(role, "members.view")` which requires ADMIN+ rank, excluding
  // CHAPTER_ORGANIZER (rank 2) — so they got redirected to /events
  // before ever reaching the gallery. Now they can view; write buttons
  // remain SUPER_ADMIN-only at the API layer (POST /api/admin/brand-images
  // still uses isSuperAdmin()).
  if (!canSeeAdminNav(effectiveRole)) {
    redirect("/events");
  }

  const isSuper = isSuperAdmin({ email: me.email, role: me.role });

  // Load the current WhatsApp link so the editor can pre-fill the input.
  const settings = await getPublicSettings();

  // Load countries + chapters for the new chapter-scoped image filter.
  // Scope: Super Admin sees all; Admin sees own country; Chapter
  // Organizer sees own chapter only.
  // PER USER SPEC 2026-08-02: chapter admins can edit their own chapter's
  // favicon, login hero, and login banner via the chapter-scoped select
  // buttons. The dropdown is pre-filtered so they only see chapters they
  // can actually edit (no 403 surprises).
  const chapterFilter =
    isSuper
      ? { isActive: true }
      : me.role === ROLES.CHAPTER_ORGANIZER || me.role === ROLES.CO_HOST
        ? { isActive: true, id: me.chapterId ?? "___NEVER___" }
        : { isActive: true };
  const countries = await db.country.findMany({
    where: isSuper
      ? {}
      : { id: me.countryId ?? "___NEVER___" },
    select: {
      id: true,
      name: true,
      code: true,
      flagEmoji: true,
      chapters: {
        where: chapterFilter,
        select: { id: true, name: true, slug: true, city: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />

        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Brand Assets
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Brand images
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Upload brand images and choose which one is used as the site&rsquo;s{" "}
            <strong>favicon</strong>, <strong>login hero</strong>, and{" "}
            <strong>login banner</strong>. Stock images from the{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.85em]">.images/</code>{" "}
            folder (admin-only) are automatically copied to Vercel Blob when
            you select them, so they become publicly accessible. Changes take
            effect immediately on the next page load — no redeploy needed.
          </p>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Use the <strong>chapter filter</strong> below to set per-chapter
            overrides for the favicon, login hero, and login banner. Chapter
            overrides take precedence over the global defaults when a visitor
            is on the chapter&rsquo;s landing page (<code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.85em]">/c/&lt;slug&gt;</code>){" "}
            or signs in via{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.85em]">/login?chapterSlug=&lt;slug&gt;</code>.
          </p>
          {!isSuper && (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              You are signed in as <strong>{me.role === ROLES.ADMIN ? "Admin" : "Chapter Organizer"}</strong>.
              The gallery below shows the <strong>global brand library</strong>{" "}
              (curated logos, mascots, and banners) plus the 3 globally-selected
              defaults. Pick from these to set the favicon, login hero, and{" "}
              login banner for{" "}
              {me.role === ROLES.ADMIN
                ? "chapters in your country"
                : "your own chapter"}{" "}
              using the chapter filter below. Global brand image selections
              + uploads remain Super-Admin-only.
            </div>
          )}
        </div>

        <ImagesGallery countries={countries} isSuperAdmin={isSuper} />

        {/* WhatsApp group link editor — sits below the brand images gallery.
            SUPER_ADMIN-only writes (enforced by the API), but visible to any
            admin viewer so they can see the current value. */}
        <div className="mt-8">
          <WhatsAppLinkEditor
            currentUrl={settings.whatsappGroupUrl}
            canEdit={isSuper}
          />
        </div>

        {/* LinkedIn "Join us" link editor — sits below the WhatsApp editor.
            SUPER_ADMIN-only writes (enforced by the API), but visible to any
            admin viewer so they can see the current value. */}
        <div className="mt-6">
          <LinkedInLinkEditor
            currentUrl={settings.linkedinUrl}
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
