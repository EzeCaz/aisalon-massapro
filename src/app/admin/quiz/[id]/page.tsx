import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { QuizControlRoom } from "./quiz-control-room";

export const metadata = { title: "Quiz Control Room — Admin — AI Salon" };

export default async function QuizControlRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) redirect("/login");
  if (!can(me.role, "quiz.host")) redirect("/admin");

  const { id } = await params;
  const quiz = await db.quizSession.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, email: true } },
      event: { select: { id: true, title: true, slug: true } },
      questions: { orderBy: { order: "asc" } },
      _count: { select: { participants: true, responses: true } },
    },
  });
  if (!quiz) redirect("/admin/quiz");

  const questions = quiz.questions.map((q) => ({
    ...q,
    options: JSON.parse(q.optionsJson) as string[],
    optionsJson: undefined,
  }));

  const sessionJson = JSON.parse(
    JSON.stringify({ ...quiz, questions }),
  );

  return (
    <>
      <AppHeader />
      <AdminTabs role={me.role} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <QuizControlRoom
          initialSession={sessionJson}
          hostUser={{
            id: me.id,
            name: me.name || me.email,
            email: me.email,
            role: me.role,
          }}
        />
      </main>
    </>
  );
}
