"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Brain,
  Trophy,
  Users,
  Clock,
  Play,
  Plus,
  ExternalLink,
  Radio,
  Loader2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface QuizSessionSummary {
  id: string;
  title: string;
  status: string;
  questionTimeLimitSec: number;
  totalQuestions: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  host: { id: string; name: string | null; email: string } | null;
  _count: { participants: number };
}

interface Props {
  eventId: string;
  eventSlug: string;
  initialQuizzes: QuizSessionSummary[];
  canHost: boolean;
  hostUserId: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  LOBBY: "bg-blue-100 text-blue-700 border-blue-200",
  LIVE: "bg-red-100 text-red-700 border-red-200 animate-pulse",
  PAUSED: "bg-amber-100 text-amber-700 border-amber-200",
  BETWEEN: "bg-purple-100 text-purple-700 border-purple-200",
  FINISHED: "bg-green-100 text-green-700 border-green-200",
  ABORTED: "bg-gray-200 text-gray-600 border-gray-300 line-through",
};

const STATUS_VERB: Record<string, string> = {
  DRAFT: "Coming up",
  LOBBY: "Lobby open",
  LIVE: "Live now",
  PAUSED: "Paused",
  BETWEEN: "Between questions",
  FINISHED: "Finished",
  ABORTED: "Cancelled",
};

export function QuizTab({
  eventId,
  eventSlug,
  initialQuizzes,
  canHost,
  hostUserId,
}: Props) {
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<QuizSessionSummary[]>(initialQuizzes);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTimeLimit, setNewTimeLimit] = useState(30);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          questionTimeLimitSec: newTimeLimit,
          eventId, // ← auto-link to THIS event
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create quiz");
      }
      const { session } = await res.json();
      toast({
        title: "Quiz created",
        description: `Seeded ${session._count.questions} questions. Edit them in the Control Room before going live.`,
      });
      setNewTitle("");
      setNewTimeLimit(30);
      // Add the new session to the local list (server-side reload would
      // also work, but this avoids a full page refresh).
      setQuizzes((prev) => [
        {
          id: session.id,
          title: session.title,
          status: session.status,
          questionTimeLimitSec: session.questionTimeLimitSec,
          totalQuestions: session.totalQuestions,
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          host: { id: hostUserId, name: null, email: "" },
          _count: { participants: 0 },
        },
        ...prev,
      ]);
    } catch (e: unknown) {
      toast({
        title: "Could not create quiz",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const liveQuiz = quizzes.find((q) => q.status === "LIVE");
  const lobbyQuiz = quizzes.find((q) => q.status === "LOBBY");
  const upcomingQuizzes = quizzes.filter(
    (q) => q.status !== "LIVE" && q.status !== "ABORTED" && q.status !== "FINISHED",
  );
  const pastQuizzes = quizzes.filter(
    (q) => q.status === "FINISHED" || q.status === "ABORTED",
  );

  return (
    <div className="space-y-6">
      {/* Hero / live banner */}
      {(liveQuiz || lobbyQuiz) && (
        <Card
          className={`border-2 ${
            liveQuiz
              ? "border-red-500 bg-red-50/50"
              : "border-blue-500 bg-blue-50/50"
          }`}
        >
          <CardContent className="py-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`h-12 w-12 rounded-full flex items-center justify-center ${
                  liveQuiz
                    ? "bg-red-500 animate-pulse"
                    : "bg-blue-500"
                }`}
              >
                <Radio className="h-6 w-6 text-white" />
              </div>
              <div>
                <p
                  className={`text-xs font-bold uppercase tracking-wider ${
                    liveQuiz ? "text-red-600" : "text-blue-600"
                  }`}
                >
                  {liveQuiz ? "Quiz is live now" : "Lobby is open"}
                </p>
                <h3 className="text-lg font-bold">
                  {liveQuiz?.title || lobbyQuiz?.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {liveQuiz?._count.participants ?? 0} playing ·{" "}
                  {liveQuiz?.totalQuestions || lobbyQuiz?.totalQuestions} questions
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white">
              <Link href={`/quiz/${liveQuiz?.id || lobbyQuiz?.id}`}>
                <Play className="h-4 w-4 mr-1" />
                {liveQuiz ? "Join the live quiz" : "Enter lobby"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Host: create new quiz */}
      {canHost && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-[#FF005A]" />
              Create a quiz for this event
            </CardTitle>
            <CardDescription>
              Seeds ~18 questions from the AI &amp; Human Flourishing field
              guide. You can edit every question, option, and the correct
              answer in the Control Room before going live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quiz title</label>
                <Input
                  placeholder="e.g. Warm-up Round — What does flourishing mean to you?"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={200}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTitle.trim() && !creating) {
                      handleCreate();
                    }
                  }}
                />
              </div>
              <div className="w-32 space-y-1.5">
                <label className="text-sm font-medium">Time / Q (sec)</label>
                <Input
                  type="number"
                  min={5}
                  max={300}
                  value={newTimeLimit}
                  onChange={(e) => setNewTimeLimit(Number(e.target.value) || 30)}
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                {creating ? "Creating…" : "Create & seed"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The quiz is automatically linked to this event — once you open
              the lobby, members will see a &quot;Join the live quiz&quot;
              button right here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming / joinable quizzes */}
      {upcomingQuizzes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming &amp; joinable ({upcomingQuizzes.length})
          </h2>
          <div className="grid gap-3">
            {upcomingQuizzes
              .filter((q) => !liveQuiz || q.id !== liveQuiz.id)
              .filter((q) => !lobbyQuiz || q.id !== lobbyQuiz.id)
              .map((q) => (
                <QuizSessionCard
                  key={q.id}
                  quiz={q}
                  canHost={canHost}
                />
              ))}
          </div>
        </div>
      )}

      {/* Past quizzes */}
      {pastQuizzes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Past quizzes ({pastQuizzes.length})
          </h2>
          <div className="grid gap-3">
            {pastQuizzes.map((q) => (
              <QuizSessionCard key={q.id} quiz={q} canHost={canHost} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {quizzes.length === 0 && !canHost && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-semibold mb-1">No quizzes yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The host hasn&apos;t scheduled a quiz for this event yet. Check
              back closer to the event start, or ask the organizer.
            </p>
          </CardContent>
        </Card>
      )}

      {quizzes.length === 0 && canHost && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No quizzes yet — create your first one above. Members will see
            them here as soon as you do.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Single quiz session card ─────────────────────────────────────────────

function QuizSessionCard({
  quiz,
  canHost,
}: {
  quiz: QuizSessionSummary;
  canHost: boolean;
}) {
  const joinable =
    quiz.status === "LOBBY" ||
    quiz.status === "LIVE" ||
    quiz.status === "PAUSED" ||
    quiz.status === "BETWEEN";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold">{quiz.title}</span>
              <Badge
                variant="outline"
                className={STATUS_COLORS[quiz.status] || STATUS_COLORS.DRAFT}
              >
                {STATUS_VERB[quiz.status] || quiz.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
                {quiz.totalQuestions} questions
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {quiz._count.participants} joined
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {quiz.questionTimeLimitSec}s / Q
              </span>
              {quiz.host?.name && (
                <span>Host: {quiz.host.name}</span>
              )}
              <span>
                {new Date(quiz.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {joinable ? (
              <Button asChild size="sm" className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white">
                <Link href={`/quiz/${quiz.id}`}>
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {quiz.status === "LIVE" ? "Join live" : "Open quiz"}
                </Link>
              </Button>
            ) : quiz.status === "FINISHED" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/quiz/${quiz.id}`}>
                  <Trophy className="h-3.5 w-3.5 mr-1" />
                  See results
                </Link>
              </Button>
            ) : null}
            {canHost && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/quiz/${quiz.id}`} target="_blank">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Control Room
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
