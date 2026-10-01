import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getCoHostedEventIds, getEffectiveRole, getUserScope, scopeEventWhere} from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { QuizAdminList } from "./quiz-admin-list";

export const metadata = { title: "Quiz — Admin — AI Salon" };

export default async function QuizAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/quiz");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");

  // TSK-0058: Resolve EFFECTIVE role (honors "View as" override for SUPER_ADMIN).
  const viewAsRole = (session.user as { viewAsRole?: string | null }).viewAsRole ?? null;
  const effectiveRole = getEffectiveRole(me.role, me.email, viewAsRole);
  if (!can(effectiveRole, "quiz.host")) redirect("/admin");

  // CO_HOST users see only quizzes for events they co-host.
  // Admins+ see all quizzes.
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  // BRAND-SCOPE GUARD (2026-10-02): scope quiz sessions + events picker
  // to the user's brand. For BRAND_ADMIN (kind: "brand"), scopeEventWhere
  // returns { chapterRef: { brand: { slug: "ch" } } }. We need to apply
  // it as `{ event: scopeWhere }` for quizSession (which joins through
  // event) and directly for the events picker. For SUPER_ADMIN it's {} —
  // no behavior change. Fixes the "ch brand admin sees aisalon quizzes"
  // leak — without this, scopedEventIds === null for BRAND_ADMIN and
  // the where clause becomes {} (no filter).
  const scope = await getUserScope(me.id);
  const eventScopeWhere = scopeEventWhere(scope);

  // For quizSession: filter by event relation (quizSession.eventId → event).
  // For the events picker: filter directly with scopeEventWhere.
  const where =
    scopedEventIds === null
      ? { event: eventScopeWhere }
      : scopedEventIds.length === 0
      ? { id: "____never____" } // force empty result for non-cohost users
      : { eventId: { in: scopedEventIds } };

  const [sessions, events] = await Promise.all([
    db.quizSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        host: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, slug: true } },
        _count: {
          select: { questions: true, participants: true, responses: true },
        },
      },
    }),
    // Events picker for the create form — admins see all, co-hosts see
    // only their events. Apply brand scope so BRAND_ADMIN only picks
    // from their own brand's events.
    db.event.findMany({
      where:
        scopedEventIds === null
          ? eventScopeWhere
          : scopedEventIds.length === 0
          ? { id: "____never____" }
          : { id: { in: scopedEventIds } },
      orderBy: { startsAt: "desc" },
      select: { id: true, title: true, slug: true, startsAt: true, chapter: true },
      take: 100,
    }),
  ]);

  // Serialize (Date → ISO)
  const sessionsJson = JSON.parse(JSON.stringify(sessions));
  const eventsJson = JSON.parse(JSON.stringify(events));

  return (
    <>
      <AppHeader />
      <AdminTabs role={effectiveRole} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <QuizAdminList
          sessions={sessionsJson}
          events={eventsJson}
          hostUserId={me.id}
        />
      </main>
    </>
  );
}
