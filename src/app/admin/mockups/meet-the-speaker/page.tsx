import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { MeetTheSpeakerEditor } from "./meet-the-speaker-editor";
import type { EventPickListItem } from "./types";

export const metadata = { title: "Meet the Speaker Mockup — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/mockups/meet-the-speaker
 *
 * Single-speaker focused mockup. Pick an event from the dropdown to
 * auto-fill the featured speaker's name, title, company, topic, bio,
 * photo, plus the event details. Then toggle "Edit images" to swap
 * the photo / meerkat / logos from the brand library. Drag to pan,
 * scroll to zoom. Use `photoSize` / `imageScale` / `logoSize` in the
 * JSON to resize any image. Download a print-quality PNG.
 *
 * Permission gate: ADMIN + SUPER_ADMIN (same as /admin/mockups).
 */

export default async function MeetTheSpeakerMockupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/mockups/meet-the-speaker");
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  if (!can(me.role, "members.view") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  // Fetch the events list for the auto-fill dropdown. Same lightweight
  // shape as the Speaker Intro page.
  const eventsRaw = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      venue: true,
    },
  });
  const events: EventPickListItem[] = eventsRaw.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    venue: e.venue,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        {/* Header */}
        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Mockup Builder · Template 2 of 4
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Meet the Speaker Mockup
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl leading-relaxed">
            Single-speaker focused mockup. Pick an event from the dropdown to
            auto-fill the featured speaker&apos;s name, title, company, topic,
            bio, photo, and event details. Then toggle{" "}
            <strong>Edit images</strong> to swap any photo or logo from the
            brand library, drag to crop, scroll to zoom. Use{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.7rem]">photoSize</code>,{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.7rem]">imageScale</code>,{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.7rem]">logoSize</code> in the
            JSON to make any image larger. Fine-tune anything in the JSON,
            then download a print-quality PNG.
          </p>
        </div>

        <MeetTheSpeakerEditor events={events} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            © {new Date().getFullYear()} AI Salon Tel Aviv · Empowering AI
            Connections
          </span>
          <span>Platform by MassaPro</span>
        </div>
      </footer>
    </div>
  );
}
