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
 * /testimonials — PUBLIC community testimonials feed.
 *
 * Reading is open to the world (no login required) so prospective members
 * and future chapter organizers can see what the community is saying.
 *
 * Posting, liking, and deleting still require a signed-in member session
 * — enforced server-side at the API layer (/api/testimonials POST and
 * /api/testimonials/[id]/like POST).
 *
 * For signed-in members, the form also offers 4 scopes:
 *   - 🌍 Community (no specific event)
 *   - 📍 About a specific event (user picks from a dropdown)
 *   - 🎤 About a speaker (user picks event → speaker)
 *   - 🗓 About a session (user picks event → session)
 */
export default async function TestimonialsPage() {
  const session = await getServerSession(authOptions);
  let me: { id: string; role: string } | null = null;
  if (session?.user?.email) {
    const u = await db.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        importSource: true,
        onboardedAt: true,
      },
    });
    if (u) {
      // For signed-in users, run the same onboarding gates as before so
      // they don't get stuck on the public feed with an unfinished profile.
      if (needsSetPassword(u)) redirect("/set-password");
      if (needsOnboarding(u)) redirect("/onboarding");
      me = { id: u.id, role: u.role };
    }
  }

  const isAdmin = me?.role === "ADMIN";

  // Fetch the events catalog only when there's a signed-in user (the form
  // is hidden for anonymous visitors, so the data isn't needed).
  let eventsCatalog: EventOption[] = [];
  if (me) {
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

    eventsCatalog = events.map((e) => ({
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
  }

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
          <p className="mt-2 text-sm text-black/80 max-w-2xl">
            Real stories from our community about speakers, events, sessions,
            and the AI Salon vibe. {me ? "Share your own — add a photo, pick a rating, and tell us what made it special." : "Sign in to share your own — add a photo, pick a rating, and tell us what made it special."}
          </p>
        </div>

        <TestimonialFeed
          meId={me?.id ?? ""}
          isAdmin={isAdmin}
          eventsCatalog={eventsCatalog}
          defaultSort="recent"
        />
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
