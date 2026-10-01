import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getEffectiveRole, isSuperAdminEmail, ROLES } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminNavCards } from "@/components/ais/admin-nav-cards";
import { AdminTestimonials } from "./admin-testimonials";
import { MessageSquareHeart } from "lucide-react";

export const metadata = { title: "Admin · Testimonials — AI Salon Tel Aviv" };

export default async function AdminTestimonialsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/testimonials");

  let me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) redirect("/login");

  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  // Auto-sync SUPER_ADMIN role from email allowlist
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Phase 4 (2026-10-02): allow BRAND_ADMIN to moderate testimonials too
  // (was ADMIN-only — excluded BRAND_ADMIN entirely). The testimonials API
  // at /api/testimonials applies its own brand-scope filtering on the
  // server side, so BRAND_ADMIN only sees their own brand's testimonials.
  if (!can(effectiveRole, "members.view")) redirect("/events");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Persistent admin section navigation — visible on every admin page */}
        <AdminNavCards />

        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
          <MessageSquareHeart className="inline h-3 w-3 mr-1" />
          Admin · Testimonials
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
          Moderate <span className="ais-gradient-text">testimonials</span>
        </h1>
        <p className="mt-2 text-sm text-black/80 max-w-2xl">
          Feature the best ones (pink badge) or hide the ones that don&apos;t
          fit the community guidelines. Hidden testimonials are still visible
          to their author and to you, but not to other members.
        </p>

        <div className="mt-8">
          <AdminTestimonials meId={me.id} />
        </div>
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
