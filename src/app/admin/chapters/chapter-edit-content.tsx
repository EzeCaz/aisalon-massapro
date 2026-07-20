import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ChapterEditor } from "./chapter-editor";

/**
 * Shared server component for the chapter edit page.
 *
 * Used by both:
 *   - /admin/chapters/[id]      (lookup by ID — legacy/internal)
 *   - /admin/c/[chapterSlug]    (lookup by slug — admin-friendly URL,
 *                                stable across ID changes)
 *
 * Auth + scope rules (identical for both routes):
 *   - Must be signed in (else → /login?callbackUrl=…)
 *   - SUPER_ADMIN  → can edit any chapter
 *   - ADMIN        → can edit chapters in their own country only
 *   - CHAPTER_ORGANIZER → can edit their own chapter only
 *   - Anyone else  → redirected to /admin/chapters
 *
 * The `lookup` prop is one of:
 *   - { byId: "<cuid>" }     resolve by primary key
 *   - { bySlug: "tel-aviv" } resolve by unique slug
 *
 * IMPORTANT: the slug → ID resolution happens AFTER the auth check,
 * so unauthenticated visitors are redirected to /login without
 * touching the DB. This matches the behavior of the legacy
 * /admin/chapters/[id] route (which also does auth first).
 */
export async function ChapterEditContent({
  lookup,
}: {
  lookup: { byId: string } | { bySlug: string };
}) {
  // ── 1. AUTH ────────────────────────────────────────────────────────
  // Build a sensible callback URL for the login redirect based on the
  // lookup key. If the visitor used the slug URL, send them back to
  // the slug URL after login (preserves the friendly URL).
  const callbackUrl =
    "bySlug" in lookup
      ? `/admin/c/${lookup.bySlug}`
      : `/admin/chapters/${lookup.byId}`;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, countryId: true, chapterId: true },
  });
  if (!me) redirect("/login");

  const isSuperAdmin = isSuperAdminEmail(me.email) || me.role === ROLES.SUPER_ADMIN;
  const isAdmin = me.role === ROLES.ADMIN;

  if (!isSuperAdmin && !isAdmin && me.role !== ROLES.CHAPTER_ORGANIZER) {
    redirect("/admin/chapters");
  }

  // ── 2. RESOLVE CHAPTER ─────────────────────────────────────────────
  // Lookup by slug OR by ID. Both return the same shape; if not found,
  // 404.
  const chapter =
    "bySlug" in lookup
      ? await db.chapter.findUnique({
          where: { slug: lookup.bySlug },
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            timezone: true,
            countryId: true,
            whatsappGroupUrl: true,
            linkedinUrl: true,
            isActive: true,
          },
        })
      : await db.chapter.findUnique({
          where: { id: lookup.byId },
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            timezone: true,
            countryId: true,
            whatsappGroupUrl: true,
            linkedinUrl: true,
            isActive: true,
          },
        });
  if (!chapter) notFound();

  // ── 3. SCOPE CHECK ─────────────────────────────────────────────────
  // Admin can only edit chapters in their country. Chapter Organizer
  // can only edit their own chapter.
  if (!isSuperAdmin) {
    if (isAdmin && chapter.countryId !== me.countryId) redirect("/admin/chapters");
    if (me.role === ROLES.CHAPTER_ORGANIZER && chapter.id !== me.chapterId) {
      redirect("/admin/chapters");
    }
  }

  // ── 4. LOAD COUNTRIES (for the country <select>) ───────────────────
  const countries = await db.country.findMany({
    where: isSuperAdmin ? {} : { id: me.countryId ?? "___NEVER___" },
    select: { id: true, name: true, code: true, flagEmoji: true },
    orderBy: { name: "asc" },
  });

  // ── 5. RENDER ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-black">Edit chapter</h1>
          <p className="mt-1 text-sm text-black/70">
            Update chapter details. Changes take effect immediately for all members, events, and
            emails scoped to this chapter.
          </p>
        </div>
        <ChapterEditor
          mode="edit"
          chapterId={chapter.id}
          initial={{
            name: chapter.name,
            slug: chapter.slug,
            city: chapter.city,
            timezone: chapter.timezone,
            countryId: chapter.countryId,
            whatsappGroupUrl: chapter.whatsappGroupUrl,
            linkedinUrl: chapter.linkedinUrl,
            isActive: chapter.isActive,
          }}
          countries={countries}
          isSuperAdmin={isSuperAdmin}
        />
      </main>
    </div>
  );
}
