import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
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

  const sessions = await db.quizSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      host: { select: { id: true, name: true, email: true } },
      event: { select: { id: true, title: true, slug: true } },
      _count: {
        select: { questions: true, participants: true, responses: true },
      },
    },
  });

  // Serialize (Date → ISO)
  const sessionsJson = JSON.parse(JSON.stringify(sessions));

  return (
    <>
      <AppHeader />
      <AdminTabs role={me.role} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <QuizAdminList sessions={sessionsJson} />
      </main>
    </>
  );
}
