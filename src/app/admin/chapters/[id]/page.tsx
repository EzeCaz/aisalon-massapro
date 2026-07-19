import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ChapterEditor } from "../chapter-editor";

export const metadata = { title: "Edit chapter — AI Salon" };

export default async function EditChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect(`/login?callbackUrl=/admin/chapters/${id}`);

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

  const chapter = await db.chapter.findUnique({
    where: { id },
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

  // Scope check: Admin can only edit chapters in their country. Chapter Organizer
  // can only edit their own chapter.
  if (!isSuperAdmin) {
    if (isAdmin && chapter.countryId !== me.countryId) redirect("/admin/chapters");
    if (me.role === ROLES.CHAPTER_ORGANIZER && chapter.id !== me.chapterId) redirect("/admin/chapters");
  }

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
