/**
 * /admin/chapter-onboarding — admin view of all chapter onboarding invites.
 *
 * Lists every invite the current admin can see (all invites for SUPER_ADMIN/ADMIN,
 * scoped-to-chapter for CHAPTER_ORGANIZER — though in practice CHAPTER_ORGANIZER
 * wouldn't be sending onboarding invites, so we just gate to ADMIN+ for simplicity).
 *
 * Click into a submission to see the full form data.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getUserScope, normalizeRole, ROLES, isSuperAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ChapterOnboardingAdminList } from "./chapter-onboarding-admin-list";
import { PreviewComaFormButton } from "./preview-coma-form-button";
import { Globe2 } from "lucide-react";

export const dynamic = "force-dynamic";

// Hardcoded Coma preview email — only used when the caller is SUPER_ADMIN.
// The Super Admin uses this to preview the Coma-branded onboarding form
// (the original use case for this button). For BRAND_ADMIN, we use the
// brand admin's own email so they preview their own brand's form.
const COMA_PREVIEW_EMAIL = "eze@cazhype.com";

export default async function ChapterOnboardingAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/chapter-onboarding");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    // Phase 2: include brandSlug so ChapterOnboardingAdminList can build brand-aware URLs.
    select: { id: true, email: true, role: true, name: true, brandSlug: true },
  });
  if (!me) redirect("/login?callbackUrl=/admin/chapter-onboarding");

  if (!can(me.role, "members.edit")) {
    redirect("/admin");
  }

  // BRAND-SCOPE GUARD (2026-10-02): BRAND_ADMIN sees only invites sent to
  // users in their own brand. ChapterOnboardingInvite has no direct brand
  // relation, but it has userId → User.brandSlug. For SUPER_ADMIN (global
  // scope) the filter is {} (no restriction). For BRAND_ADMIN we filter
  // by user.brandSlug === me.brandSlug. Without this, BRAND_ADMIN sees
  // EVERY onboarding invite on the platform — a brand leak.
  const scope = await getUserScope(me.id);
  const inviteWhere =
    scope.kind === "global"
      ? {}
      : scope.kind === "brand"
      ? { user: { brandSlug: scope.brandSlug } }
      : scope.kind === "country"
      ? { user: { countryId: scope.countryId } }
      : scope.kind === "chapter"
      ? { user: { chapterId: scope.chapterId } }
      : { id: "___NEVER___" };

  // Load all invites (newest first).
  const invites = await db.chapterOnboardingInvite.findMany({
    where: inviteWhere,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      status: true,
      inviteeEmail: true,
      prefillChapterName: true,
      prefillChapterSlug: true,
      sentAt: true,
      openedAt: true,
      submittedAt: true,
      expiresAt: true,
      appliedChapterId: true,
      appliedAt: true,
      submissionJson: true,
      userId: true,
      user: { select: { name: true } },
      invitedById: true,
      invitedBy: { select: { name: true, email: true } },
    },
  });

  // Serialize dates for the client component.
  const serialized = invites.map((i) => ({
    ...i,
    sentAt: i.sentAt.toISOString(),
    openedAt: i.openedAt?.toISOString() ?? null,
    submittedAt: i.submittedAt?.toISOString() ?? null,
    expiresAt: i.expiresAt.toISOString(),
    appliedAt: i.appliedAt?.toISOString() ?? null,
    inviteeName: i.user?.name ?? null,
    invitedByName: i.invitedBy?.name ?? i.invitedBy?.email ?? null,
  }));

  // ── Phase 4 (2026-10-02): brand-aware preview button props ───────────
  // For SUPER_ADMIN: preview the Coma-branded form (the original use case).
  // For BRAND_ADMIN: preview their own brand's form. We look up the brand's
  // display name from the DB so the button label is "Preview Cazhype
  // onboarding form" (not "Preview ch onboarding form"). Falls back to the
  // slug-based label if the brand row doesn't exist.
  const isBa = normalizeRole(me.role) === ROLES.BRAND_ADMIN && !!me.brandSlug;
  const isSa = isSuperAdmin({ email: me.email, role: me.role });
  let previewEmail: string | null = null;
  let previewBrandSlug: string | null = null;
  let previewBrandDisplayName: string | null = null;
  if (isSa) {
    // Super Admin: preview Coma.
    previewEmail = COMA_PREVIEW_EMAIL;
    previewBrandSlug = "coma";
    previewBrandDisplayName = "Coma";
  } else if (isBa && me.brandSlug) {
    // Brand Admin: preview their own brand using their own email.
    previewEmail = me.email;
    previewBrandSlug = me.brandSlug;
    try {
      const dbBrand = await db.brand.findUnique({
        where: { slug: me.brandSlug },
        select: { displayName: true },
      });
      previewBrandDisplayName = dbBrand?.displayName ?? me.brandSlug;
    } catch {
      // DB lookup failed (sandbox) — fall back to the slug.
      previewBrandDisplayName = me.brandSlug;
    }
  }

  return (
    <>
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AdminTabs role={me.role} />
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-1">
            <Globe2 className="w-5 h-5 text-[#820A7D]" />
            <h1 className="text-xl font-bold text-slate-900">Chapter Onboarding</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            Track every chapter onboarding form you&apos;ve sent. Click a row to see the full submission.
          </p>

          {/* Quick preview button — opens the brand-aware onboarding form
              in a new tab without sending an email. For Super Admin this
              previews the Coma-branded form (eze@cazhype.com); for
              BRAND_ADMIN this previews their own brand's form using
              their own email. Phase 4 (2026-10-02). */}
          {previewEmail && previewBrandSlug && (
            <div className="mb-4">
              <PreviewComaFormButton
                previewEmail={previewEmail}
                brandSlug={previewBrandSlug}
                brandDisplayName={previewBrandDisplayName ?? undefined}
              />
            </div>
          )}

          <ChapterOnboardingAdminList invites={serialized} currentAdminEmail={me.email} brandSlug={me.brandSlug ?? "aisalon"} />
        </div>
      </div>
    </>
  );
}
