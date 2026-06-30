import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny, getCoHostedEventIds, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { SpeakerIntroEditor } from "./speaker-intro-editor";
import type { EventPickListItem } from "./types";

export const metadata = { title: "Speaker Intro Mockup — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/mockups/speaker-intro
 *
 * Interactive editor for the AI Salon Speaker Intro mockup. Renders a
 * 1200×800 (3:2) canvas with 9 separate, editable components bound to
 * a JSON document. Admin can:
 *   1. Pick an event from the dropdown → all fields auto-fill from DB.
 *   2. Toggle "Edit images" → click any image (hero, speaker photos,
 *      sponsor logos) to replace it from the brand library or event
 *      gallery. Drag to pan. Scroll to zoom.
 *   3. Edit the JSON directly for fine-grained control.
 *   4. Download a print-quality PNG (2400×1600 at 2× DPR).
 *
 * Permission gate: ADMIN + SUPER_ADMIN (members.view) OR CO_HOST
 * (eventdata.viewCoHosted). CO_HOSTs see only their co-hosted events
 * in the dropdown.
 */

export default async function SpeakerIntroMockupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/mockups/speaker-intro");
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

  if (
    !canAny(me.role, ["members.view", "eventdata.viewCoHosted"]) &&
    !isSuperAdminEmail(me.email)
  ) {
    redirect("/events");
  }

  // Determine event-scoping. For ADMIN+ this is null (all events).
  // For CO_HOST, this is the list of event IDs they co-host.
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  // Fetch the events list for the auto-fill dropdown. Lightweight: just
  // the fields needed to identify an event in the picker. Newest first.
  // Scope by event IDs for CO_HOST users.
  const eventsRaw = await db.event.findMany({
    where: scopedEventIds === null ? undefined : { id: { in: scopedEventIds } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      venue: true,
    },
  });
  // Serialize datetimes to ISO strings for the client.
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
            Mockup Builder · Template 1 of 4
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Speaker Intro Mockup
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-3xl leading-relaxed">
            Pick an event from the dropdown to auto-fill every field (event
            name, date, venue, speakers, hero image, QR link). Then toggle{" "}
            <strong>Edit images</strong> to swap any photo or logo from the
            brand library, drag to crop, scroll to zoom. Fine-tune anything
            in the JSON on the left, then download a print-quality PNG.
          </p>
        </div>

        <SpeakerIntroEditor events={events} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/40 flex flex-col sm:flex-row justify-between items-center gap-2">
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
