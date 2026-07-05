import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { DoorCheckInClient } from "./door-check-in-client";

/**
 * /admin/check-in — Door staff check-in kiosk.
 *
 * Renders a single-input form where door staff type in (or scan) the
 * 8-char check-in code shown on the attendee's phone. The page then
 * queries /api/admin/check-in/lookup and shows the attendee's details
 * + which event they're registered for, plus a non-transferrable-code
 * warning. Door staff then press "Confirm check-in" which POSTs to
 * /api/admin/check-in/confirm — the actual atomic write that sets
 * doorCheckedAt + doorCheckedBy.
 *
 * TWO-STEP FLOW (no pre-approval gate):
 *   1. LOOK UP  → GET  /api/admin/check-in/lookup?code=XXXX-XXXX
 *                 Returns PENDING_CONFIRM (200) | ALREADY_USED (200) | MISS (404)
 *   2. CONFIRM  → POST /api/admin/check-in/confirm  { code: "XXXX-XXXX" }
 *                 Returns CONFIRMED (200) | ALREADY_USED (200)
 *
 * ANY Super Admin / Admin / Co-host of the event can confirm — there
 * is no pre-approval gate. The confirmation itself IS the approval.
 * The confirm write is race-safe (updateMany with `doorCheckedAt: null`
 * guard) so two staffers confirming the same code simultaneously can't
 * both succeed.
 *
 * Auth: requires events.edit (admin or super-admin) OR
 * eventdata.viewCoHosted (co-host). The lookup + confirm APIs enforce
 * per-event scope for CO_HOSTs — they can only act on codes for events
 * they co-host. Admins+ can act on any code globally.
 *
 * Layout: full site chrome (AppHeader + AdminTabs) is rendered so door
 * staff have the same navigation as other admin pages, per user
 * request. The lookup input itself stays auto-focused for fast scanning.
 */
export default async function DoorCheckInPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/check-in");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, role: true },
  });
  if (!me) redirect("/login?callbackUrl=/admin/check-in");
  if (!canAny(me.role, ["events.edit", "eventdata.viewCoHosted"])) {
    redirect("/admin?error=" + encodeURIComponent("Door check-in requires admin or co-host access"));
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <AdminTabs role={me.role} />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <DoorCheckInClient adminName={me.name || "Admin"} />
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
