import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { NewEventForm, type ChapterOption } from "./new-event-form";

export const metadata = { title: "New event — Admin — AI Salon Tel Aviv" };

/**
 * Prisma's raw shape from `db.chapter.findMany` with the country relation
 * selected. We map this to the flat `ChapterOption` type expected by the
 * client form (which needs `countryName`/`countryCode`/`countryFlagEmoji`
 * as top-level fields so it can auto-fill Venue without a round-trip).
 */
type ChapterWithCountry = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  countryId: string;
  country: { name: string; code: string; flagEmoji: string | null };
};

function toChapterOption(c: ChapterWithCountry): ChapterOption {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    city: c.city,
    countryId: c.countryId,
    countryName: c.country.name,
    countryCode: c.country.code,
    countryFlagEmoji: c.country.flagEmoji,
  };
}

export default async function AdminNewEventPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/events/new");

  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) redirect("/login");
  if (!can(me.role, "members.view")) redirect("/events");

  // Auto-sync SUPER_ADMIN role from the allowlist (mirrors /admin/events).
  let myRole = me.role;
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    myRole = ROLES.SUPER_ADMIN;
  }

  // ---- Load chapters the current user can act on ----
  //   SUPER_ADMIN       → all active chapters (grouped by country on the client)
  //   ADMIN             → chapters in their country
  //   CHAPTER_ORGANIZER / CO_HOST → their own chapter only (select will be locked)
  //
  // Mirrors the scope logic in /admin/events/page.tsx but shaped for the
  // new-event form (single-select, includes country code/city for auto-fill).
  let rawChapters: ChapterWithCountry[] = [];

  if (myRole === ROLES.SUPER_ADMIN || isSuperAdminEmail(me.email)) {
    rawChapters = await db.chapter.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        countryId: true,
        country: { select: { name: true, code: true, flagEmoji: true } },
      },
      orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
    });
  } else if (myRole === ROLES.ADMIN && me.countryId) {
    rawChapters = await db.chapter.findMany({
      where: { countryId: me.countryId, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        countryId: true,
        country: { select: { name: true, code: true, flagEmoji: true } },
      },
      orderBy: { name: "asc" },
    });
  } else if ((myRole === ROLES.CHAPTER_ORGANIZER || myRole === ROLES.CO_HOST) && me.chapterId) {
    const single = await db.chapter.findUnique({
      where: { id: me.chapterId },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        countryId: true,
        country: { select: { name: true, code: true, flagEmoji: true } },
      },
    });
    if (single) rawChapters = [single];
  }

  const chaptersForForm: ChapterOption[] = rawChapters.map(toChapterOption);

  // Chapter Organizer / CO_HOST: the select is locked to their chapter.
  // We pass `lockedChapterId` so the client form can render the select as
  // disabled + pre-selected (and ignore any user attempt to change it).
  const lockedChapterId =
    (myRole === ROLES.CHAPTER_ORGANIZER || myRole === ROLES.CO_HOST) && me.chapterId
      ? me.chapterId
      : null;

  // For locked-scope users, pre-fill the default city/country from their
  // chapter so the form is ready to submit out of the box.
  const defaultChapter = lockedChapterId
    ? chaptersForForm.find((c) => c.id === lockedChapterId) ?? null
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Admin Panel · New event
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Create a new event
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Fill in the basics and you&apos;ll be taken to the new event&apos;s page
            where you can add speakers, agenda, and images. Title, start time,
            and end time are required — everything else is optional and
            editable later.
          </p>
        </div>

        <NewEventForm
          chapters={chaptersForForm}
          lockedChapterId={lockedChapterId}
          defaultChapter={defaultChapter}
        />
      </main>
    </div>
  );
}
