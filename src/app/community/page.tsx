import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";
import { AppHeader } from "@/components/ais/app-header";
import { CommunityGrid } from "./community-grid";
import Link from "next/link";

export const metadata = { title: "Community — AI Salon Tel Aviv" };

/**
 * /community — member directory.
 *
 * Lists every onboarded, non-archived member of AI Salon Tel Aviv
 * with their profile picture, name, company, LinkedIn URL, and a
 * "Contact" button that opens a 1-on-1 DM dialog.
 *
 * Auth gate: signed-in + onboarded members only. Anonymous visitors
 * are redirected to /login (the directory is members-only — unlike
 * /events which is public).
 */
export default async function CommunityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/community");
  }

  const meRow = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      importSource: true,
      onboardedAt: true,
    },
  });
  if (!meRow) redirect("/login?callbackUrl=/community");
  if (needsOnboarding(meRow)) redirect("/onboarding");

  // Fetch every onboarded, non-archived member EXCEPT the current
  // user (you can't DM yourself — the API would reject it anyway).
  // We sort by name asc and push users with a profile photo to the
  // top so the grid feels populated even when many members haven't
  // uploaded a photo yet.
  const members = await db.user.findMany({
    where: {
      archivedAt: null,
      onboardedAt: { not: null },
      id: { not: meRow.id },
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      photoUrl: true,
      title: true,
      company: true,
      companyUrl: true,
      bio: true,
      linkedinUrl: true,
      portfolioUrl: true,
      role: true,
      tags: { select: { id: true, label: true, color: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  // Sort: members with a profile photo first, then alphabetical by name.
  const sortedMembers = [...members].sort((a, b) => {
    const aHasPhoto = !!(a.photoUrl || a.image);
    const bHasPhoto = !!(b.photoUrl || b.image);
    if (aHasPhoto !== bHasPhoto) return aHasPhoto ? -1 : 1;
    return (a.name || a.email).localeCompare(b.name || b.email);
  });

  // Initial unread count for the DM dialog badge.
  const unreadCount = await db.conversationMessage.count({
    where: { recipientId: meRow.id, readAt: null },
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
            Meet the <span className="ais-gradient-text">community</span>
          </h1>
          <p className="mt-3 text-base text-black/80 max-w-2xl">
            Founders, builders, investors, and researchers building AI in Tel Aviv.
            Click <span className="font-semibold">Contact</span> on any profile to start a private 1-on-1 chat.
          </p>
        </div>

        {sortedMembers.length === 0 ? (
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-12 text-center">
            <p className="text-sm text-black/60">
              No other community members yet. Check back soon — new members join every week.
            </p>
            <Link
              href="/events"
              className="inline-flex items-center justify-center rounded-md bg-[#FF005A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-[#D8004D] ais-lift mt-4"
            >
              Browse events →
            </Link>
          </div>
        ) : (
          <CommunityGrid
            members={sortedMembers.map((m) => ({
              ...m,
              // Tags need to be plain serializable objects (they already are,
              // but make the type explicit for the client boundary).
              tags: m.tags.map((t) => ({ id: t.id, label: t.label, color: t.color })),
            }))}
            currentUser={{
              id: meRow.id,
              name: meRow.name,
              role: meRow.role,
            }}
            initialUnreadCount={unreadCount}
          />
        )}

        {/* Member count footer */}
        {sortedMembers.length > 0 && (
          <div className="mt-10 text-center text-xs text-black/50">
            Showing {sortedMembers.length} member{sortedMembers.length === 1 ? "" : "s"} · AI Salon Tel Aviv
          </div>
        )}
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
