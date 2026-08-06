import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAny, isSuperAdminEmail, ROLES, getEffectiveRole, getUserScope} from "@/lib/permissions";
import { buildScopeKey } from "@/lib/mockup-defaults-key";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { QrSalonEditor } from "./qr-salon-editor";

export const metadata = { title: "QR Salon Mockup — AI Salon Tel Aviv" };

export const dynamic = "force-dynamic";

/**
 * /admin/mockups/qr-salon
 *
 * QR-code-only mockup. Type a URL → get a QR code centered on the canvas,
 * a caption printed below it, and the small AI Salon brand mark in the
 * bottom-left corner (height 48px, X=2.7% by default — per user spec
 * 2026-07-15). Edit the caption text + styling, replace the brand mark
 * image, drag the brand mark to reposition, scroll to resize. Download
 * a print-quality PNG.
 *
 * Permission gate: ADMIN + SUPER_ADMIN (members.view) OR CO_HOST
 * (eventdata.viewCoHosted) — same as /admin/mockups.
 */

export default async function QrSalonMockupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/mockups/qr-salon");
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");


  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  // Auto-sync SUPER_ADMIN status (same pattern as /admin + /admin/images).
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Visible to ADMIN + SUPER_ADMIN (members.view) OR CO_HOST
  // (eventdata.viewCoHosted — they can use mockups for their events).
  if (
    !canAny(effectiveRole, ["members.view", "eventdata.viewCoHosted"]) &&
    !isSuperAdminEmail(me.email)
  ) {
    redirect("/events");
  }

  // TSK-0076: derive a scopeKey for chapter-scoped localStorage defaults
  // (the "Set as default" button saves per-chapter, not globally).
  const scope = await getUserScope(me.id);
  const scopeKey = buildScopeKey(scope);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />

        {/* Header */}
        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Mockup Builder · QR Salon
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            QR Salon Mockup
          </h1>
          <p className="mt-2 text-sm text-black/80 max-w-3xl leading-relaxed">
            A QR-code-only mockup: drop in a URL, type a caption, and the
            small AI Salon brand mark sits in the bottom-left corner (height
            48px, X=2.7% by default). Toggle{" "}
            <strong>Edit images</strong> to replace the brand mark from the
            library, drag it to reposition, scroll on it to resize. Edit any
            field in the form, or switch to the JSON tab for fine-grained
            control. Download a print-quality PNG.
          </p>
        </div>

        <QrSalonEditor scopeKey={scopeKey} />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            © {new Date().getFullYear()} AI Salon Global· Empowering AI
            Connections
          </span>
          <a href="https://massapro.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">Platform by MassaPro</a>
        </div>
      </footer>
    </div>
  );
}
