import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/ais/app-header";
import { EventTabs } from "./event-tabs";
import { format } from "date-fns";

export const metadata = { title: "Event — AI Salon Tel Aviv" };

type Params = { params: Promise<{ slug: string }> };

export default async function EventDetailPage({ params }: Params) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect(`/login?callbackUrl=/events/${slug}`);

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true },
  });
  if (!me) redirect("/login");

  const event = await db.event.findUnique({
    where: { slug },
    include: {
      speakers: { orderBy: { order: "asc" } },
      agenda: {
        orderBy: { startsAt: "asc" },
        include: {
          speaker: {
            include: {
              // Limit to first 4 images per speaker — just enough for
              // the "Pictures of the session" thumbnail preview in the
              // agenda box. We grab up to 4 so the dialog can show a
              // small strip; the full gallery is on the Photos tab.
              images: {
                orderBy: { slideOrder: "asc" },
                take: 4,
                select: {
                  id: true,
                  fileUrl: true,
                  fileName: true,
                  caption: true,
                },
              },
              // Same idea for presentations — just the first one for
              // the thumbnail. The full list is on the Presentations
              // tab.
              presentations: {
                take: 1,
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  fileName: true,
                  fileUrl: true,
                  mimeType: true,
                  title: true,
                },
              },
            },
          },
          // Presentations linked directly to THIS agenda item (e.g.
          // uploaded by the admin via the Manage Agenda tab). Take
          // just the first one for the thumbnail.
          presentations: {
            take: 1,
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              mimeType: true,
              title: true,
            },
          },
        },
      },
      _count: { select: { images: true } },
    },
  });
  if (!event) notFound();

  // Serialize dates for client
  const serialized = {
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    agenda: event.agenda.map((a) => ({
      ...a,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt?.toISOString() || null,
    })),
  };

  const isAdmin = me.role === "ADMIN";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />

      {/* Hero / title block */}
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs mb-4">
                <span className="inline-flex items-center rounded-full bg-[#FF005A]/10 text-[#FF005A] px-2.5 py-0.5 font-bold uppercase tracking-wider">
                  {event.chapter}
                </span>
                <span className="text-black/40">
                  {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(event.startsAt)}
                </span>
                <span className="text-black/20">·</span>
                <span className="text-black/60 font-mono">
                  {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.startsAt)} – {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.endsAt)}
                </span>
                {event.country && (
                  <span className="text-black/40">· {event.country}</span>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
                {event.title}
              </h1>
              {event.subtitle && (
                <p className="mt-2 text-lg text-black/60">{event.subtitle}</p>
              )}

              {event.venue && (
                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-black/70">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="font-semibold">📍 Venue:</span>
                    {event.venue}
                    {event.address && <span className="text-black/50">· {event.address}</span>}
                  </div>
                  {event.mapUrl && (
                    <a
                      href={event.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#004F98] font-semibold underline-offset-4 hover:underline"
                    >
                      Open in Maps →
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Chapter shape date block */}
            <div className="hidden lg:flex flex-col items-center">
              <div className="w-28 text-center rounded-xl overflow-hidden border border-black/15 bg-white">
                <div className="ais-gradient h-2" />
                <div className="p-4">
                  <div className="text-[0.7rem] font-bold uppercase tracking-widest text-[#FF005A]">
                    {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", month: "short" }).format(event.startsAt).toUpperCase()}
                  </div>
                  <div className="text-5xl font-extrabold text-black leading-none my-1">
                    {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", day: "2-digit" }).format(event.startsAt)}
                  </div>
                  <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-black/40">
                    {new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric" }).format(event.startsAt)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[0.65rem] font-mono text-black/40">
                {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.startsAt)} – {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(event.endsAt)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <EventTabs event={serialized} me={me} isAdmin={isAdmin} />
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
