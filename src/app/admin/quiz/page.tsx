import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getCoHostedEventIds } from "@/lib/permissions";
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
  if (!can(me.role, "quiz.host")) redirect("/admin");

  // CO_HOST users see only quizzes for events they co-host.
  // Admins+ see all quizzes.
  const scopedEventIds = await getCoHostedEventIds(me.id, me.role);

  const where =
    scopedEventIds === null
      ? {}
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
    // only their events.
    db.event.findMany({
      where:
        scopedEventIds === null
          ? {}
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
      <AdminTabs role={me.role} />
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
