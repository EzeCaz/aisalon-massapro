import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { InboxButtonServer } from "./inbox-button-server";

export async function AppHeader() {
  const session = await getServerSession(authOptions);
  const user = session?.user?.email
    ? await db.user.findUnique({
        where: { email: session.user.email },
        include: { tags: true },
      })
    : null;
  // Show the "Admin" nav link to anyone who can view members
  // (SUPER_ADMIN + ADMIN). CO_HOST + MEMBER don't see it.
  const isAdmin = !!user && can(user.role, "members.view");

  const navLinks = [
    { href: "/events", label: "Events" },
    { href: "/resources/ai-human-flourishing", label: "AI & Human Flourishing" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo + tagline — Falafel Meerkat mark on the left, on every page */}
          <Link href="/events" className="flex items-center gap-2">
            <AiSalonLogoServer variant="horizontal-tagline" className="text-[1.05rem]" />
            <span className="hidden sm:inline-block ml-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-black/40 border-l border-black/15 pl-3">
              Tel Aviv Chapter
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 text-sm font-semibold text-black/70 hover:text-black hover:bg-black/5 rounded-md transition-colors"
              >
                {l.label}
              </Link>
            ))}
            {user && <InboxButtonServer />}
            {user && <UserMenu user={user} isAdmin={isAdmin} />}
          </nav>

          {/* Mobile nav */}
          <div className="md:hidden flex items-center gap-1">
            {user && <InboxButtonServer />}
            <MobileNav links={navLinks} user={user} isAdmin={isAdmin} />
          </div>
        </div>
      </div>
    </header>
  );
}
