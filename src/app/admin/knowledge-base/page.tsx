import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdmin, isSuperAdminEmail, ROLES, getEffectiveRole } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { ensureKnowledgeSeed, getKnowledgeDocs } from "@/lib/knowledge-docs";
import { KnowledgeBaseClient } from "./knowledge-base-client";

export const metadata = { title: "Knowledge Base" };

export const dynamic = "force-dynamic";

/**
 * /admin/knowledge-base
 *
 * PER USER SPEC 2026-09-19: the knowledge base is now DB-backed and
 * SEPARATED per brand (Coma vs AI Salon — "everything should be
 * different"), with a brand tab to switch between them. The Super Admin
 * can change the content and URL of each doc (and add/remove docs)
 * directly from this page; other admin ranks see the read-only library.
 *
 * The legacy AI Salon resource list (Google Drive links) is auto-seeded
 * into the AIS brand on first read; the Coma brand starts empty for the
 * Super Admin to fill in.
 */
export default async function KnowledgeBasePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/knowledge-base");
  }

  let me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  // Auto-sync SUPER_ADMIN status (same pattern as /admin + /admin/images)
  if (isSuperAdminEmail(me.email) && me.role !== ROLES.SUPER_ADMIN) {
    await db.user.update({
      where: { id: me.id },
      data: { role: ROLES.SUPER_ADMIN },
    });
    me = { ...me, role: ROLES.SUPER_ADMIN };
  }

  // Visible to ADMIN + SUPER_ADMIN (same gate as /admin members table)
  if (!can(effectiveRole, "members.view") && !isSuperAdminEmail(me.email)) {
    redirect("/events");
  }

  const isSuper = isSuperAdmin({ email: me.email, role: me.role });

  // Seed (idempotent) + load BOTH brands so tab switches are instant
  // (the client filters locally; edits refetch from the API).
  await ensureKnowledgeSeed();
  const [comaDocs, aisDocs] = await Promise.all([
    getKnowledgeDocs("coma"),
    getKnowledgeDocs("aisalon"),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs role={effectiveRole} />

        <KnowledgeBaseClient
          initialDocs={{ coma: comaDocs, aisalon: aisDocs }}
          isSuperAdmin={isSuper}
        />
      </main>

      <footer className="mt-auto border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs text-black/80 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© {new Date().getFullYear()} AI Salon Global· Empowering AI Connections</span>
          <a href="https://massapro.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">Platform by MassaPro</a>
        </div>
      </footer>
    </div>
  );
}
