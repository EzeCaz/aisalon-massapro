import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { InboxButtonServer } from "./inbox-button-server";
import { getPublicSettings } from "@/lib/site-settings";

/**
 * Site-wide top nav header.
 *
 * Renders the WhatsApp "Join our group" pill on the LEFT of the Events
 * link — visible to everyone (logged-in or not). The URL comes from
 * SiteSetting `whatsappGroupUrl` (admin-editable at /admin/images, no
 * redeploy needed). Defaults to the AI Salon TLV community group.
 */
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

  // Public site settings — includes the WhatsApp group URL. Safe to read
  // for anonymous visitors (the URL is shown publicly in the header).
  const settings = await getPublicSettings();
  const whatsappUrl = settings.whatsappGroupUrl;

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
            {/* WhatsApp "Join our group" pill — LEFT of Events, visible to everyone */}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-2 inline-flex items-center gap-1.5 rounded-full bg-[#25D366] text-white font-semibold text-xs px-3 py-1.5 hover:bg-[#1ebe5d] transition-colors whitespace-nowrap"
                title="Join our WhatsApp group"
              >
                <WhatsAppIcon className="h-3.5 w-3.5" />
                Join our group
              </a>
            )}
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
            {/* WhatsApp icon-only pill on mobile (saves horizontal space) */}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-1 inline-flex items-center justify-center rounded-full bg-[#25D366] text-white h-9 w-9 hover:bg-[#1ebe5d] transition-colors"
                title="Join our WhatsApp group"
                aria-label="Join our WhatsApp group"
              >
                <WhatsAppIcon className="h-4 w-4" />
              </a>
            )}
            {user && <InboxButtonServer />}
            <MobileNav links={navLinks} user={user} isAdmin={isAdmin} />
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Inline WhatsApp glyph (no external icon dependency).
 * Path copied from the official Simple Icons WhatsApp mark (CC0).
 * Keeps the bundle small and avoids a network request for a single icon.
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
