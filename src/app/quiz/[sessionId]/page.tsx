import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/ais/app-header";
import { QuizPlayer } from "./quiz-player";

export const metadata = { title: "Flourishing Quiz — AI Salon" };

export default async function QuizPlayerPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=/quiz/${(await params).sessionId}`);
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      photoUrl: true,
      image: true,
    },
  });
  if (!me) redirect("/login");

  const { sessionId } = await params;
  const quiz = await db.quizSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      status: true,
      questionTimeLimitSec: true,
      totalQuestions: true,
      currentQuestionIndex: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  if (!quiz) redirect("/events");

  return (
    <>
      <AppHeader />
      <QuizPlayer
        initialSession={JSON.parse(JSON.stringify(quiz))}
        user={JSON.parse(JSON.stringify(me))}
      />
    </>
  );
}
