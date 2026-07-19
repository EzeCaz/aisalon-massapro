import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import Link from "next/link";
import { ArrowRight, Globe2, MapPin, Users, CalendarDays } from "lucide-react";

export const metadata = { title: "Chapters — AI Salon" };

export default async function ChaptersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/chapters");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, countryId: true, chapterId: true },
  });
  if (!me) redirect("/login");

  // Auto-sync SUPER_ADMIN role
  let myRole = me.role;
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({ where: { id: me.id }, data: { role: ROLES.SUPER_ADMIN } });
    myRole = ROLES.SUPER_ADMIN;
  }

  // Gate: SUPER_ADMIN + ADMIN can view. CHAPTER_ORGANIZER sees only their own
  // chapter (still useful but read-only). MEMBER/SPEAKER → /events.
  if (!can(myRole, "members.view") && !isSuperAdminEmail(me.email)) redirect("/events");

  const isSuperAdmin = isSuperAdminEmail(me.email) || myRole === ROLES.SUPER_ADMIN;

  // Scope: Super Admin sees all countries; Admin sees only their country.
  const countryWhere = isSuperAdmin ? {} : { id: me.countryId ?? "___NEVER___" };
  const countries = await db.country.findMany({
    where: countryWhere,
    include: {
      chapters: {
        include: {
          _count: { select: { users: true, events: true, rsvps: true, speakers: true } },
        },
        orderBy: { name: "asc" },
      },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });

  // Summary totals across visible scope
  const totalChapters = countries.reduce((sum, c) => sum + c.chapters.length, 0);
  const totalMembers = countries.reduce(
    (sum, c) => sum + c.chapters.reduce((s, ch) => s + ch._count.users, 0),
    0
  );
  const totalEvents = countries.reduce(
    (sum, c) => sum + c.chapters.reduce((s, ch) => s + ch._count.events, 0),
    0
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />

        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            V7 Hierarchy
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black flex items-center gap-3">
            <Globe2 className="h-8 w-8 text-[#820A7D]" />
            Global → Country → Chapter
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl">
            Every member, event, speaker, registrant, RSVP, email, and referral in the platform is
            attached to a <strong>Chapter</strong> inside a <strong>Country</strong>. Super Admins
            see the full tree; Admins see only their country. Use this page to add new countries or
            chapters — every new chapter gets its own scope for reports, members, and email flows.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <StatCard label="Countries" value={countries.length} accent="#820A7D" icon={<Globe2 className="h-4 w-4" />} />
          <StatCard label="Chapters" value={totalChapters} accent="#FF005A" icon={<MapPin className="h-4 w-4" />} />
          <StatCard label="Members (scoped)" value={totalMembers} accent="#00E6FF" icon={<Users className="h-4 w-4" />} />
          <StatCard label="Events (scoped)" value={totalEvents} accent="#007E72" icon={<CalendarDays className="h-4 w-4" />} />
        </div>

        {/* Country + Chapter tree */}
        <div className="space-y-8">
          {countries.length === 0 && (
            <div className="rounded-md border border-black/10 bg-black/[0.02] p-8 text-center">
              <p className="text-sm text-black/70">
                No countries in your scope yet. Run <code className="bg-black/5 px-1.5 py-0.5 rounded text-xs">npx tsx scripts/v7-seed-israel-tel-aviv.ts</code> to seed Israel + Tel Aviv.
              </p>
            </div>
          )}

          {countries.map((country) => (
            <section key={country.id} className="rounded-lg border border-black/10 bg-white overflow-hidden">
              <header className="px-5 py-4 bg-[#820A7D]/[0.04] border-b border-[#820A7D]/20 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{country.flagEmoji ?? "🏳️"}</span>
                  <div>
                    <h2 className="text-lg font-bold text-black">
                      {country.name}{" "}
                      <span className="text-xs font-mono text-black/50">({country.code})</span>
                    </h2>
                    <p className="text-xs text-black/60">
                      {country.chapters.length} chapter{country.chapters.length === 1 ? "" : "s"}
                      {country.defaultEmailDomain && (
                        <> · email domain <code className="bg-black/5 px-1 rounded text-[0.65rem]">{country.defaultEmailDomain}</code></>
                      )}
                    </p>
                  </div>
                </div>
                {isSuperAdmin && (
                  <Link
                    href={`/admin/chapters/new?countryId=${country.id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-[#820A7D] text-[#820A7D] font-semibold px-3 py-1.5 text-xs hover:bg-[#820A7D] hover:text-white whitespace-nowrap"
                  >
                    + Add chapter
                  </Link>
                )}
              </header>

              <div className="divide-y divide-black/5">
                {country.chapters.map((chapter) => (
                  <div key={chapter.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap hover:bg-black/[0.015]">
                    <div className="flex items-center gap-3 min-w-0">
                      <MapPin className="h-4 w-4 text-[#FF005A] flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black truncate">
                          {chapter.name}
                          {chapter.city && (
                            <span className="ml-2 text-xs font-normal text-black/50">{chapter.city}</span>
                          )}
                          {!chapter.isActive && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded bg-black/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-black/60">
                              Inactive
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-black/60">
                          <code className="bg-black/5 px-1 rounded text-[0.65rem]">/{chapter.slug}</code>
                          {" · "}
                          <code className="bg-black/5 px-1 rounded text-[0.65rem]">{chapter.timezone}</code>
                          {chapter.whatsappGroupUrl && <> · <a href={chapter.whatsappGroupUrl} target="_blank" rel="noopener noreferrer" className="text-[#007E72] hover:underline">WhatsApp</a></>}
                          {chapter.linkedinUrl && <> · <a href={chapter.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-[#007E72] hover:underline">LinkedIn</a></>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <CountPill label="Members" value={chapter._count.users} />
                      <CountPill label="Events" value={chapter._count.events} />
                      <CountPill label="RSVPs" value={chapter._count.rsvps} />
                      <CountPill label="Speakers" value={chapter._count.speakers} />
                      <Link
                        href={`/admin/chapters/${chapter.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-black text-white font-semibold px-2.5 py-1 text-xs hover:bg-black/80 whitespace-nowrap"
                      >
                        Edit <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
                {country.chapters.length === 0 && (
                  <div className="px-5 py-6 text-center text-sm text-black/50">
                    No chapters in this country yet.
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-12 rounded-md border border-[#00E6FF]/30 bg-[#00E6FF]/[0.04] px-5 py-4 text-sm text-black/80">
          <p className="font-semibold text-[#007E72] mb-1">How scoping works</p>
          <ul className="space-y-1 text-xs text-black/70 list-disc pl-5">
            <li><strong>Super Admin</strong> — sees all countries + chapters (global scope).</li>
            <li><strong>Admin</strong> — sees only their country + all chapters inside it.</li>
            <li><strong>Chapter Organizer</strong> — sees only their assigned chapter.</li>
            <li><strong>Member</strong> — country is set on signup; chapter is auto-set on first RSVP.</li>
            <li>Every new event, RSVP, speaker, email queue row, and referral inherits the chapter scope of its creator / event.</li>
          </ul>
        </div>
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon · V7 Hierarchy</span>
          <span>Platform by <a href="https://massapro.com" className="text-black/80 underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">MassaPro</a></span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, accent, icon }: { label: string; value: number; accent: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-black/10 rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-black/80 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 text-3xl font-extrabold text-black">{value}</div>
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-bold text-black">{value}</span>
      <span className="text-black/50">{label}</span>
    </span>
  );
}
