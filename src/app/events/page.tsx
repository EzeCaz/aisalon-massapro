import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { EventsList } from "./events-list";

export const metadata = { title: "Events — AI Salon Tel Aviv" };

export default async function EventsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/events");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true },
  });
  if (!me) redirect("/login");

  // Brand-new users (not pre-imported + haven't filled the intake form)
  // get redirected to /onboarding before they can see the events list.
  if (needsOnboarding(me)) redirect("/onboarding");

  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: { select: { images: true, speakers: true } },
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Page header */}
        <div className="mb-10">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            AI Salon Tel Aviv
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
            Upcoming & past <span className="ais-gradient-text">gatherings</span>
          </h1>
          <p className="mt-3 text-base text-black/60 max-w-2xl">
            Members-only events at Google for Startups Campus TLV and partner venues.
            Click any event to view the agenda, speakers, and shared photo gallery.
          </p>
        </div>

        <EventsList events={events} />
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
