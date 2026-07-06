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
  Pause,
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
  // Only populated when the host has revealed (status BETWEEN/FINISHED).
  // Null during LIVE so a savvy member can't peek at the network response.
  correctIndex: number | null;
  deepDive: string | null;
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

  // ── Auto-join ──────────────────────────────────────────────────────
  // If the user lands on the page and hasn't joined yet, but the session
  // is in a joinable state (LOBBY/LIVE/PAUSED/BETWEEN), auto-join them
  // on mount. This eliminates the "You haven't joined this session" error
  // when someone clicks a late-arriving quiz link while the quiz is
  // already LIVE. Idempotent — the API upserts.
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current) return;
    // Wait for the first state fetch to resolve so we know whether we're
    // already joined (then no-op) or need to join.
    if (me !== null) {
      autoJoinedRef.current = true;
      return;
    }
    const joinableStatuses = new Set(["LOBBY", "LIVE", "PAUSED", "BETWEEN"]);
    if (!joinableStatuses.has(session.status)) return;
    autoJoinedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/quiz/${session.id}/join`, {
          method: "POST",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          // Don't toast destructive errors for auto-join — the user can
          // still click the manual Join button if auto-join failed.
          console.warn("[quiz] auto-join failed:", err?.error);
          return;
        }
        toast({
          title: "Joined the quiz",
          description: "You're in the game — answer fast for more points!",
        });
        refreshState();
        refreshLeaderboard();
      } catch {
        /* ignore — manual join button still available */
      }
    })();
  }, [me, session.status, session.id, refreshState, refreshLeaderboard, toast]);

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

  const showQuestion = (session.status === "LIVE" || session.status === "PAUSED") && currentQuestion && hasJoined;
  const showWaiting = session.status === "DRAFT" || session.status === "LOBBY";
  const showBetween = session.status === "BETWEEN" && hasJoined;
  const showFinished = session.status === "FINISHED";
  const showAborted = session.status === "ABORTED";
  const isPaused = session.status === "PAUSED";

  const myRankInLeaderboard = leaderboard.find((p) => p.userId === user.id);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-white to-gray-50">
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-6">
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
          <Card className="mb-4 max-w-2xl mx-auto bg-gradient-to-br from-[#FF005A]/5 to-transparent border-[#FF005A]/20">
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

        {/* Not joined yet — show join button (any joinable status) */}
        {!hasJoined &&
          (session.status === "LOBBY" ||
            session.status === "LIVE" ||
            session.status === "PAUSED" ||
            session.status === "BETWEEN") && (
            <Card className="max-w-2xl mx-auto text-center border-[#FF005A]/30 bg-[#FF005A]/5">
              <CardContent className="py-8">
                <Radio className="h-10 w-10 mx-auto text-[#FF005A] mb-3 animate-pulse" />
                <h2 className="text-lg font-semibold mb-1">
                  {session.status === "LIVE"
                    ? "Quiz is live — join now!"
                    : session.status === "LOBBY"
                    ? "Lobby is open"
                    : session.status === "PAUSED"
                    ? "Quiz is paused"
                    : "Join to see the question"}
                </h2>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  {session.status === "LIVE"
                    ? "You're missing points every second. Tap join to jump in."
                    : "Tap join to get into the game."}
                </p>
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
              </CardContent>
            </Card>
          )}

        {/* DRAFT and not joined — waiting for host */}
        {session.status === "DRAFT" && !hasJoined && (
          <Card className="max-w-2xl mx-auto text-center">
            <CardContent className="py-12">
              <Radio className="h-12 w-12 mx-auto text-[#FF005A] mb-3 animate-pulse" />
              <h2 className="text-lg font-semibold mb-1">
                Waiting for host
              </h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                The host hasn't opened the lobby yet. Hang tight — this page
                will auto-update.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Joined but waiting for first question */}
        {showWaiting && hasJoined && (
          <Card className="max-w-2xl mx-auto text-center">
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

        {/* Live question (also used for PAUSED — buttons disabled) */}
        {showQuestion && currentQuestion && (
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Timer / paused indicator */}
            <div className="text-center">
              {isPaused ? (
                <div className="inline-flex items-center gap-1.5 text-2xl font-bold text-amber-600">
                  <Pause className="h-5 w-5" />
                  Paused
                </div>
              ) : (
                <div
                  className={`inline-flex items-center gap-1.5 text-2xl font-bold font-mono ${
                    remainingSec <= 5 ? "text-red-600 animate-pulse" : "text-foreground"
                  }`}
                >
                  <Clock className="h-5 w-5" />
                  {remainingSec}s
                </div>
              )}
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
                      {isPaused
                        ? "Quiz is paused — waiting for the host to resume."
                        : "Waiting for the host to reveal the answer."}
                    </p>
                  </div>
                ) : (
                  // Options grid
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {currentQuestion.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleAnswer(i)}
                        disabled={submitting || remainingMs === 0 || isPaused}
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

        {/* Between questions / reveal — question on left, leaderboard on right */}
        {showBetween && currentQuestion && (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
            {/* LEFT: Question + answer reveal */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-muted-foreground">
                    Question {currentQuestion.order + 1} · Reveal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base font-medium mb-3">{currentQuestion.text}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentQuestion.options.map((opt, i) => {
                      // Now that the API exposes correctIndex on reveal, we
                      // can mark the actual correct option (green) regardless
                      // of what the user picked, and separately flag the
                      // user's pick (red if wrong).
                      const correctIdx = currentQuestion.correctIndex;
                      const isCorrectAnswer = correctIdx != null && i === correctIdx;
                      const isMyPick = myAnswer?.selectedIndex === i;
                      const iGotItRight = myAnswer?.isCorrect === true;
                      const isMyWrongPick = isMyPick && !iGotItRight;

                      return (
                        <div
                          key={i}
                          className={`rounded-lg p-3 border-2 transition-colors ${
                            isCorrectAnswer
                              ? "border-green-500 bg-green-50"
                              : isMyWrongPick
                              ? "border-red-400 bg-red-50"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-7 w-7 items-center justify-center rounded-md font-bold text-sm shrink-0 ${
                                isCorrectAnswer
                                  ? "bg-green-500 text-white"
                                  : isMyWrongPick
                                  ? "bg-red-400 text-white"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {OPTION_LABELS[i]}
                            </span>
                            <span className="text-sm flex-1">{opt}</span>
                            {isCorrectAnswer && (
                              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                            )}
                            {isMyWrongPick && (
                              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                            )}
                          </div>
                          {isMyPick && (
                            <p
                              className={`text-[10px] mt-1.5 font-semibold uppercase tracking-wide ${
                                isCorrectAnswer ? "text-green-700" : "text-red-600"
                              }`}
                            >
                              Your pick
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Result banner */}
                  {myAnswer ? (
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
                  ) : (
                    <div className="mt-3 rounded-md p-3 bg-gray-50 border border-gray-200">
                      <p className="text-sm text-gray-700">
                        You didn&apos;t answer in time — no points this round.
                      </p>
                    </div>
                  )}

                  {/* Deep dive */}
                  {currentQuestion.deepDive && (
                    <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs font-semibold text-amber-900 mb-1">
                        Deep dive
                      </p>
                      <p className="text-sm text-amber-800 leading-relaxed">
                        {currentQuestion.deepDive}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <p className="text-center text-xs text-muted-foreground">
                Next question coming up...
              </p>
            </div>

            {/* RIGHT: Live leaderboard with my rank pinned to top */}
            <div className="space-y-3 lg:sticky lg:top-4">
              {/* My rank hero card */}
              {myRankInLeaderboard && (
                <Card className="bg-gradient-to-br from-[#FF005A]/8 to-transparent border-[#FF005A]/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Your position
                    </p>
                    <div className="flex items-baseline justify-center gap-1.5 mt-1">
                      <span className="text-4xl font-bold tabular-nums">
                        #{myRankInLeaderboard.rank}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {leaderboard.length}
                      </span>
                    </div>
                    <p className="text-sm font-semibold mt-1 text-[#FF005A]">
                      {myRankInLeaderboard.totalScore.toLocaleString()} pts
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {myRankInLeaderboard.correctCount}/{myRankInLeaderboard.answeredCount} correct
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Full leaderboard */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 max-h-[420px] overflow-y-auto">
                  {leaderboard.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No participants yet
                    </div>
                  ) : (
                    leaderboard.map((p) => {
                      const isMe = p.userId === user.id;
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2 rounded-md p-1.5 ${
                            isMe
                              ? "bg-[#FF005A]/10 border border-[#FF005A]/30"
                              : p.isPodium
                              ? "bg-amber-50"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <span className="w-6 text-center text-xs font-bold text-muted-foreground shrink-0">
                            {p.rank <= 3
                              ? ["🥇", "🥈", "🥉"][p.rank - 1]
                              : `#${p.rank}`}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium truncate">
                                {p.displayName}
                                {isMe && (
                                  <span className="text-[10px] text-[#FF005A] ml-1">(you)</span>
                                )}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {p.correctCount}/{p.answeredCount} correct
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold tabular-nums">
                            {p.totalScore.toLocaleString()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Finished — final leaderboard */}
        {showFinished && (
          <div className="max-w-2xl mx-auto space-y-4">
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
          <Card className="max-w-2xl mx-auto text-center">
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
