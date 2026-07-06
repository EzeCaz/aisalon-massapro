"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  Trophy,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  Loader2,
  LogIn,
  Radio,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuizSocket } from "@/components/quiz/use-quiz-socket";

interface SessionInfo {
  id: string;
  title: string;
  status: string;
  questionTimeLimitSec: number;
  totalQuestions: number;
  currentQuestionIndex: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  role: string;
  photoUrl: string | null;
  image: string | null;
}

interface CurrentQuestion {
  id: string;
  order: number;
  text: string;
  options: string[];
  timeLimitSec: number;
  sourceAreaId: string | null;
  startedAt: string | null;
  remainingMs: number | null;
}

interface MyAnswer {
  selectedIndex: number;
  isCorrect: boolean;
  points: number;
}

interface ParticipantInfo {
  id: string;
  displayName: string;
  totalScore: number;
  correctCount: number;
  answeredCount: number;
  avgResponseMs: number | null;
  isOnline: boolean;
  joinedAt: string;
  rank: { rank: number; total: number } | null;
}

interface LeaderboardParticipant {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  totalScore: number;
  correctCount: number;
  answeredCount: number;
  avgResponseMs: number | null;
  isOnline: boolean;
  userId: string;
  rank: number;
  isPodium: boolean;
}

interface Props {
  initialSession: SessionInfo;
  user: UserInfo;
}

// Option colors — Kahoot-style
const OPTION_STYLES = [
  "bg-rose-500 hover:bg-rose-600",
  "bg-amber-500 hover:bg-amber-600",
  "bg-sky-500 hover:bg-sky-600",
  "bg-emerald-500 hover:bg-emerald-600",
];
const OPTION_LABELS = ["A", "B", "C", "D"];

export function QuizPlayer({ initialSession, user }: Props) {
  const { toast } = useToast();
  const [session, setSession] = useState<SessionInfo>(initialSession);
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [myAnswer, setMyAnswer] = useState<MyAnswer | null>(null);
  const [me, setMe] = useState<ParticipantInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardParticipant[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);

  // ── Data fetchers ──────────────────────────────────────────────────
  const refreshState = useCallback(async () => {
    try {
      const res = await fetch(`/api/quiz/${session.id}/state`);
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session);
      setCurrentQuestion(data.currentQuestion);
      setMyAnswer(data.myAnswer);
      setMe(data.me);
      // Reset revealed when question changes
      if (data.currentQuestion && (!myAnswer || data.myAnswer)) {
        // If we have an answer, we've submitted — keep revealed state
      }
      // Auto-reveal when status is BETWEEN (host just revealed)
      if (data.session.status === "BETWEEN" && !data.myAnswer) {
        setRevealed(true);
      } else if (data.session.status === "LIVE") {
        setRevealed(false);
      }
    } catch {
      /* ignore */
    }
  }, [session.id, myAnswer]);

  const refreshLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/quiz/${session.id}/leaderboard`);
      if (!res.ok) return;
      const data = await res.json();
      setLeaderboard(data.participants || []);
    } catch {
      /* ignore */
    }
  }, [session.id]);

  // Initial load
  useEffect(() => {
    refreshState();
    refreshLeaderboard();
  }, [refreshState, refreshLeaderboard]);

  // Tick when LIVE
  useEffect(() => {
    if (session.status !== "LIVE" || !currentQuestion) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [session.status, currentQuestion]);

  // ── WebSocket ──────────────────────────────────────────────────────
  const lastAnswerRefresh = useRef(0);
  const { isConnected } = useQuizSocket({
    sessionId: session.id,
    userId: user.id,
    displayName: user.name || user.email,
    role: user.role,
    onStateChange: () => {
      refreshState();
      refreshLeaderboard();
    },
    onReveal: () => {
      setRevealed(true);
      refreshState();
      refreshLeaderboard();
    },
    onLeaderboard: refreshLeaderboard,
    onFinished: () => {
      refreshState();
      refreshLeaderboard();
    },
    onParticipantJoined: () => {
      refreshLeaderboard();
    },
    onParticipantLeft: () => {
      refreshLeaderboard();
    },
    onAnswerCount: () => {
      const t = lastAnswerRefresh.current;
      if (Date.now() - t > 1000) {
        lastAnswerRefresh.current = Date.now();
        refreshLeaderboard();
      }
    },
  });

  // ── Actions ────────────────────────────────────────────────────────
  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await fetch(`/api/quiz/${session.id}/join`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to join");
      }
      toast({ title: "Joined!", description: "You're in the game." });
      refreshState();
      refreshLeaderboard();
    } catch (e: unknown) {
      toast({
        title: "Couldn't join",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  };

  const handleAnswer = async (selectedIndex: number) => {
    if (!currentQuestion || myAnswer || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quiz/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          selectedIndex,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit answer");
      }
      setMyAnswer(data.result);
      // Don't reveal correct answer yet — wait for host
      refreshLeaderboard();
    } catch (e: unknown) {
      toast({
        title: "Couldn't submit",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────
  const hasJoined = !!me;
  const timeLimitSec = currentQuestion?.timeLimitSec ?? session.questionTimeLimitSec;
  const startedAtMs = currentQuestion?.startedAt
    ? new Date(currentQuestion.startedAt).getTime()
    : 0;
  const elapsedMs = session.status === "LIVE" ? now - startedAtMs : 0;
  const remainingMs = Math.max(0, timeLimitSec * 1000 - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progressPct =
    timeLimitSec > 0 ? Math.min(100, (elapsedMs / (timeLimitSec * 1000)) * 100) : 0;

  const showQuestion = session.status === "LIVE" && currentQuestion;
  const showWaiting = session.status === "DRAFT" || session.status === "LOBBY";
  const showBetween = session.status === "BETWEEN" || session.status === "PAUSED";
  const showFinished = session.status === "FINISHED";
  const showAborted = session.status === "ABORTED";

  const myRankInLeaderboard = leaderboard.find((p) => p.userId === user.id);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-white to-gray-50">
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Brain className="h-6 w-6 text-[#FF005A]" />
            <h1 className="text-xl font-bold">{session.title}</h1>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs">
            <Badge
              variant="outline"
              className={
                session.status === "LIVE"
                  ? "bg-red-100 text-red-700 border-red-200 animate-pulse"
                  : session.status === "LOBBY"
                  ? "bg-blue-100 text-blue-700 border-blue-200"
                  : session.status === "FINISHED"
                  ? "bg-green-100 text-green-700 border-green-200"
                  : "bg-gray-100 text-gray-700 border-gray-200"
              }
            >
              {session.status}
            </Badge>
            <span className="text-muted-foreground">
              · {session.totalQuestions} questions
            </span>
            <span
              className={`flex items-center gap-1 ${
                isConnected ? "text-green-600" : "text-red-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              {isConnected ? "Live" : "Reconnecting"}
            </span>
          </div>
        </div>

        {/* My stats (if joined) */}
        {hasJoined && (
          <Card className="mb-4 bg-gradient-to-br from-[#FF005A]/5 to-transparent border-[#FF005A]/20">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-2xl font-bold tabular-nums">
                    {me?.totalScore.toLocaleString() || 0}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Points
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">
                    {me?.correctCount || 0}
                    <span className="text-sm text-muted-foreground">
                      /{me?.answeredCount || 0}
                    </span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Correct
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">
                    {myRankInLeaderboard ? `#${myRankInLeaderboard.rank}` : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Rank
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Not joined yet — show join button */}
        {showWaiting && !hasJoined && (
          <Card className="text-center">
            <CardContent className="py-12">
              <Radio className="h-12 w-12 mx-auto text-[#FF005A] mb-3 animate-pulse" />
              <h2 className="text-lg font-semibold mb-1">
                {session.status === "LOBBY"
                  ? "Lobby is open"
                  : "Waiting for host"}
              </h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                {session.status === "LOBBY"
                  ? "Tap join to get into the game. The quiz will start in a moment."
                  : "The host hasn't opened the lobby yet. Hang tight — this page will auto-update."}
              </p>
              {session.status === "LOBBY" && (
                <Button
                  size="lg"
                  onClick={handleJoin}
                  disabled={joining}
                  className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white"
                >
                  {joining ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4 mr-2" />
                  )}
                  Join the quiz
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Joined but waiting for first question */}
        {showWaiting && hasJoined && (
          <Card className="text-center">
            <CardContent className="py-12">
              <Sparkles className="h-10 w-10 mx-auto text-[#FF005A] mb-3" />
              <h2 className="text-lg font-semibold mb-1">
                You&apos;re in!
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                First question will appear here automatically when the host starts.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {leaderboard.length} players in the lobby
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live question */}
        {showQuestion && currentQuestion && (
          <div className="space-y-4">
            {/* Timer */}
            <div className="text-center">
              <div
                className={`inline-flex items-center gap-1.5 text-2xl font-bold font-mono ${
                  remainingSec <= 5 ? "text-red-600 animate-pulse" : "text-foreground"
                }`}
              >
                <Clock className="h-5 w-5" />
                {remainingSec}s
              </div>
              <Progress value={progressPct} className="h-1.5 mt-1.5" />
            </div>

            {/* Question */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">
                  Question {currentQuestion.order + 1} of {session.totalQuestions}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium leading-snug mb-4">
                  {currentQuestion.text}
                </p>

                {myAnswer ? (
                  // Answer submitted — waiting for reveal
                  <div className="text-center py-8">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mb-2">
                      <Loader2 className="h-6 w-6 text-amber-600 animate-spin" />
                    </div>
                    <p className="text-sm font-medium">Answer locked in!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Waiting for the host to reveal the answer.
                    </p>
                  </div>
                ) : (
                  // Options grid
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {currentQuestion.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleAnswer(i)}
                        disabled={submitting || remainingMs === 0}
                        className={`${OPTION_STYLES[i % 4]} text-white rounded-xl p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[72px]`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/20 font-bold text-sm shrink-0">
                            {OPTION_LABELS[i]}
                          </span>
                          <span className="text-sm font-medium leading-tight">
                            {opt}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {submitting && (
                  <div className="text-center mt-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                    Submitting...
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Between questions / reveal */}
        {showBetween && currentQuestion && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">
                  Question {currentQuestion.order + 1}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-base font-medium mb-3">{currentQuestion.text}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentQuestion.options.map((opt, i) => {
                    const isCorrect = i === (
                      // We don't have correctIndex client-side unless revealed.
                      // The host's reveal flips status to BETWEEN — at that point
                      // we infer correctness from myAnswer.isCorrect IF my selected
                      // index matches.
                      myAnswer?.isCorrect && myAnswer.selectedIndex === i ? true : false
                    );
                    const isMine = myAnswer?.selectedIndex === i;
                    return (
                      <div
                        key={i}
                        className={`rounded-lg p-3 border-2 ${
                          isCorrect
                            ? "border-green-500 bg-green-50"
                            : isMine
                            ? "border-red-400 bg-red-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">
                            {OPTION_LABELS[i]}
                          </span>
                          <span className="text-sm">{opt}</span>
                          {isCorrect && (
                            <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />
                          )}
                          {isMine && !isCorrect && (
                            <XCircle className="h-4 w-4 text-red-500 ml-auto" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {myAnswer && (
                  <div
                    className={`mt-3 rounded-md p-3 ${
                      myAnswer.isCorrect
                        ? "bg-green-50 border border-green-200"
                        : "bg-red-50 border border-red-200"
                    }`}
                  >
                    <p className="text-sm font-semibold">
                      {myAnswer.isCorrect
                        ? `Correct! +${myAnswer.points} points`
                        : "Not quite — but you're still in the game."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-center text-xs text-muted-foreground">
              Next question coming up...
            </p>
          </div>
        )}

        {/* Finished — final leaderboard */}
        {showFinished && (
          <div className="space-y-4">
            <Card className="text-center bg-gradient-to-br from-amber-50 to-white border-amber-200">
              <CardContent className="py-8">
                <Trophy className="h-12 w-12 mx-auto text-amber-500 mb-2" />
                <h2 className="text-xl font-bold">Quiz complete!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Final leaderboard
                </p>
                {myRankInLeaderboard && (
                  <div className="mt-4 inline-flex flex-col items-center bg-white rounded-xl px-6 py-3 shadow-sm border">
                    <span className="text-3xl font-bold">
                      #{myRankInLeaderboard.rank}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      of {leaderboard.length} players
                    </span>
                    <span className="text-sm font-semibold mt-1 text-[#FF005A]">
                      {myRankInLeaderboard.totalScore.toLocaleString()} pts
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  All players ({leaderboard.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 max-h-96 overflow-y-auto">
                {leaderboard.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-md p-2 ${
                      p.userId === user.id
                        ? "bg-[#FF005A]/5 border border-[#FF005A]/20"
                        : p.isPodium
                        ? "bg-amber-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="w-7 text-center text-sm font-bold text-muted-foreground">
                      {p.rank <= 3 ? ["🥇", "🥈", "🥉"][p.rank - 1] : `#${p.rank}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {p.displayName}
                          {p.userId === user.id && (
                            <span className="text-[10px] text-[#FF005A] ml-1">(you)</span>
                          )}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.correctCount}/{p.answeredCount} correct
                      </div>
                    </div>
                    <span className="text-sm font-mono font-bold tabular-nums">
                      {p.totalScore.toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Aborted */}
        {showAborted && (
          <Card className="text-center">
            <CardContent className="py-12">
              <XCircle className="h-12 w-12 mx-auto text-red-400 mb-3" />
              <h2 className="text-lg font-semibold mb-1">Session ended</h2>
              <p className="text-sm text-muted-foreground">
                The host ended this session early.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
