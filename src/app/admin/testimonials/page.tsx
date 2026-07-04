import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/ais/app-header";
import { AdminNavCards } from "@/components/ais/admin-nav-cards";
import { AdminTestimonials } from "./admin-testimonials";
import { MessageSquareHeart } from "lucide-react";

export const metadata = { title: "Admin · Testimonials — AI Salon Tel Aviv" };

export default async function AdminTestimonialsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/testimonials");

  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/events");

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
        <p className="mt-2 text-sm text-black/60 max-w-2xl">
          Feature the best ones (pink badge) or hide the ones that don&apos;t
          fit the community guidelines. Hidden testimonials are still visible
          to their author and to you, but not to other members.
        </p>

        <div className="mt-8">
          <AdminTestimonials meId={me.id} />
        </div>
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
