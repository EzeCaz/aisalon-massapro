import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding, needsSetPassword } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { TestimonialFeed } from "@/components/testimonials/testimonial-feed";
import type { EventOption } from "@/components/testimonials/testimonial-form";
import { MessageSquareHeart } from "lucide-react";

export const metadata = { title: "Testimonials — AI Salon Tel Aviv" };

/**
 * /testimonials — public community testimonials feed.
 *
 * Any signed-in member can read & post. Testimonials here can be:
 *   - 🌍 Community (no specific event)
 *   - 📍 About a specific event (user picks from a dropdown)
 *   - 🎤 About a speaker (user picks event → speaker)
 *   - 🗓 About a session (user picks event → session)
 *
 * The form supports all 4 scopes — same as the event-tab form, but
 * without being locked to a single event.
 */
export default async function TestimonialsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/testimonials");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");
  if (needsSetPassword(me)) redirect("/set-password");
  if (needsOnboarding(me)) redirect("/onboarding");

  const isAdmin = me.role === "ADMIN";

  // Fetch every event with its speakers + agenda items so the form's
  // "this event / a speaker / a session" pickers can be populated when
  // the user picks a non-community scope.
  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      speakers: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, company: true, topic: true },
      },
      agenda: {
        orderBy: { startsAt: "asc" },
        select: { id: true, startsAt: true, title: true },
      },
    },
  });

  const eventsCatalog: EventOption[] = events.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    speakers: e.speakers.map((s) => ({
      id: s.id,
      label: `${s.name}${s.company ? ` · ${s.company}` : ""}${s.topic ? ` — ${s.topic}` : ""}`,
    })),
    agendaItems: e.agenda.map((a) => {
      const time = new Date(a.startsAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jerusalem",
      });
      return { id: a.id, label: `${time} · ${a.title}` };
    }),
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            <MessageSquareHeart className="inline h-3 w-3 mr-1" />
            Community · Testimonials
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            What people are <span className="ais-gradient-text">saying</span>
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Real stories from our community about speakers, events, sessions,
            and the AI Salon vibe. Share your own — add a photo, pick a rating,
            and tell us what made it special.
          </p>
        </div>

        <TestimonialFeed
          meId={me.id}
          isAdmin={isAdmin}
          eventsCatalog={eventsCatalog}
          defaultSort="recent"
        />
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
