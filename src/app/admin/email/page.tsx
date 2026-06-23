import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { EmailTabClient } from "./email-tab-client";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

export const metadata = { title: "Email Campaigns — AI Salon Tel Aviv Admin" };

export default async function EmailTabPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/email");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!me) redirect("/login");
  if (!can(me.role, "members.view")) redirect("/events");

  // Pre-fetch initial lists for the client. The client can re-fetch via
  // API when it needs fresh data (after creating/sending a campaign).
  const [campaigns, templates, membersCount, tags] = await Promise.all([
    db.emailCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        template: { select: { id: true, name: true, category: true } },
        creator: { select: { id: true, email: true, name: true } },
        _count: { select: { recipients: true, events: true } },
      },
    }),
    db.emailTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { campaigns: true } },
        creator: { select: { id: true, email: true, name: true } },
      },
    }),
    db.user.count(),
    db.memberTag.findMany({
      select: { id: true, label: true, color: true },
      distinct: ["label"],
      orderBy: { label: "asc" },
    }),
  ]);

  // Serialize (Date -> ISO string) for the client
  const campaignsJson = JSON.parse(JSON.stringify(campaigns));
  const templatesJson = JSON.parse(JSON.stringify(templates));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AdminTabs />
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs text-black/50 hover:text-black mb-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to admin
            </Link>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2 flex items-center gap-2">
              <Mail className="h-3 w-3" />
              Admin Panel
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
              Email campaigns
            </h1>
            <p className="mt-2 text-sm text-black/60 max-w-2xl">
              Compose, send, and track email campaigns to community members. Save sent
              campaigns as reusable templates, or create templates from scratch.
            </p>
          </div>
        </div>

        <EmailTabClient
          initialCampaigns={campaignsJson}
          initialTemplates={templatesJson}
          membersCount={membersCount}
          tags={tags.map((t) => ({ label: t.label, color: t.color }))}
          adminEmail={me.email || ""}
        />
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
