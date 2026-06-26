import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { DoorCheckInClient } from "./door-check-in-client";

/**
 * /admin/check-in — Door staff check-in kiosk.
 *
 * Renders a single-input form where door staff type in (or scan) the
 * 8-char check-in code shown on the attendee's phone. The page then
 * queries /api/admin/check-in/lookup and shows the attendee's details
 * + which event they're registered for.
 *
 * Auth: requires events.edit (admin or super-admin). CO_HOSTs cannot
 * use this page (they have per-event access only, not global lookup).
 */
export default async function DoorCheckInPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/check-in");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, role: true },
  });
  if (!me) redirect("/login?callbackUrl=/admin/check-in");
  if (!can(me.role, "events.edit")) {
    redirect("/admin?error=" + encodeURIComponent("Door check-in requires admin access"));
  }

  return <DoorCheckInClient adminName={me.name || "Admin"} />;
}
