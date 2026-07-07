"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Play,
  Pause,
  SkipForward,
  Square,
  Users,
  Trophy,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Eye,
  AlertCircle,
  CheckCircle2,
  Radio,
  Pencil,
  ListOrdered,
  Calendar,
  Save,
  RotateCcw,
  Trash2,
  Copy,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuizSocket } from "@/components/quiz/use-quiz-socket";
import { QuizQuestionEditor } from "./quiz-question-editor";
import { QuizResultsView } from "./quiz-results-view";
import { BarChart3 } from "lucide-react";

interface Question {
  id: string;
  order: number;
  text: string;
  options: string[];
  correctIndex: number;
  deepDive: string | null;
  sourceAreaId: string | null;
  enabled: boolean;
  timeLimitSec: number | null;
}

interface Participant {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  totalScore: number;
  correctCount: number;
  answeredCount: number;
  avgResponseMs: number | null;
  isOnline: boolean;
  lastSeenAt: string;
  joinedAt: string;
  userId: string;
  rank?: number;
  isPodium?: boolean;
}

interface SessionState {
  id: string;
  title: string;
  status: string;
  questionTimeLimitSec: number;
  totalQuestions: number;
  currentQuestionIndex: number | null;
  currentQuestionStartedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  _count: { participants: number; responses: number };
}

interface Props {
  initialSession: SessionState & {
    questions: Question[];
    host: { id: string; name: string | null; email: string } | null;
    event: { id: string; title: string; slug: string } | null;
  };
  hostUser: { id: string; name: string; email: string; role: string };
}

/**
 * Sentinel value used inside the event <Select> to represent
 * "no event linked". Radix UI forbids empty-string SelectItem values
 * (it reserves "" for clearing the selection), so we use this constant
 * and translate to/from null at the I/O boundaries.
 */
const NO_EVENT_SENTINEL = "__none__";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  LOBBY: "bg-blue-100 text-blue-700 border-blue-200",
  LIVE: "bg-red-100 text-red-700 border-red-200 animate-pulse",
  PAUSED: "bg-amber-100 text-amber-700 border-amber-200",
  BETWEEN: "bg-purple-100 text-purple-700 border-purple-200",
  FINISHED: "bg-green-100 text-green-700 border-green-200",
  ABORTED: "bg-gray-200 text-gray-600 border-gray-300 line-through",
};

export function QuizControlRoom({ initialSession, hostUser }: Props) {
  const { toast } = useToast();
  const [session, setSession] = useState<SessionState>(initialSession);
  const [questions, setQuestions] = useState<Question[]>(initialSession.questions);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentQuestionStats, setCurrentQuestionStats] = useState<{
    questionId: string;
    totalResponses: number;
    distribution: number[];
  } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [linkingEvent, setLinkingEvent] = useState(false);
  const [eventsList, setEventsList] = useState<
    { id: string; title: string; slug: string; startsAt: string }[]
  >([]);
  const [pickedEventId, setPickedEventId] = useState<string>(
    initialSession.event?.id ?? NO_EVENT_SENTINEL,
  );
  const [savingEventLink, setSavingEventLink] = useState(false);
  /** When true, the control room is replaced by the full end-of-quiz
   *  results view (leaderboard + per-question answer matrix). Set
   *  automatically after the host clicks Finish. Can be re-opened
   *  later via the "View results" button (visible whenever the
   *  session is FINISHED). */
  const [showResults, setShowResults] = useState(false);

  const sessionId = session.id;
  const currentQuestion =
    session.currentQuestionIndex != null
      ? questions[session.currentQuestionIndex]
      : null;
  const timeLimitSec =
    currentQuestion?.timeLimitSec ?? session.questionTimeLimitSec;
  const startedAtMs = session.currentQuestionStartedAt
    ? new Date(session.currentQuestionStartedAt).getTime()
    : 0;
  const elapsedMs = session.status === "LIVE" ? now - startedAtMs : 0;
  const remainingMs = Math.max(0, timeLimitSec * 1000 - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progressPct =
    timeLimitSec > 0 ? Math.min(100, (elapsedMs / (timeLimitSec * 1000)) * 100) : 0;

  // ── Data fetchers ──────────────────────────────────────────────────
  const refreshState = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/quiz/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          const { questions: _q, ...rest } = data.session;
          setSession(rest);
        }
      }
    } catch {
      /* ignore — non-critical */
    }
  }, [sessionId]);

  const refreshLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/quiz/${sessionId}/leaderboard`);
      if (res.ok) {
        const data = await res.json();
        setParticipants(data.participants || []);
        setCurrentQuestionStats(data.currentQuestionStats || null);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  // Tick every 200ms when LIVE (for the countdown)
  useEffect(() => {
    if (session.status !== "LIVE") return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [session.status]);

  // Auto-refresh leaderboard every 3s when LIVE
  useEffect(() => {
    if (session.status !== "LIVE") return;
    const interval = setInterval(refreshLeaderboard, 3000);
    return () => clearInterval(interval);
  }, [session.status, refreshLeaderboard]);

  // ── WebSocket ──────────────────────────────────────────────────────
  const {
    isConnected: wsConnected,
    emitHostAction,
  } = useQuizSocket({
    sessionId,
    userId: hostUser.id,
    displayName: hostUser.name,
    role: hostUser.role,
    onStateChange: () => {
      refreshState();
      refreshLeaderboard();
      setRevealed(false);
    },
    onReveal: () => {
      setRevealed(true);
      refreshLeaderboard();
    },
    onLeaderboard: refreshLeaderboard,
    onFinished: () => {
      refreshState();
      refreshLeaderboard();
    },
    onParticipantJoined: refreshLeaderboard,
    onParticipantLeft: refreshLeaderboard,
    onAnswerCount: () => {
      // Throttle — refresh at most once per 500ms
      const t = lastAnswerRefresh.current;
      if (Date.now() - t > 500) {
        lastAnswerRefresh.current = Date.now();
        refreshLeaderboard();
      }
    },
  });
  const lastAnswerRefresh = useRef(0);

  // ── Host actions ───────────────────────────────────────────────────
  const patchSession = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/quiz/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update session");
    }
    return res.json();
  };

  const handleStartLobby = async () => {
    setBusy("lobby");
    try {
      await patchSession({
        status: "LOBBY",
        startedAt: new Date().toISOString(),
      });
      emitHostAction("quiz:host:start-lobby");
      toast({ title: "Lobby opened", description: "Members can now join." });
      refreshState();
    } catch (e: unknown) {
      toast({
        title: "Failed to open lobby",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Unified "Start quiz" — used when the session is DRAFT or LOBBY.
   * Performs the full start flow in one click:
   *   1. (If DRAFT) Open the lobby + record startedAt so the session
   *      has a non-null startedAt and a stable "lobby opened" timestamp.
   *   2. Immediately advance to LIVE + Q1 with a fresh timer.
   *   3. Broadcast quiz:host:start-question so every connected client
   *      re-fetches /state and sees Q1 on their screen.
   *
   * Members who haven't joined yet will auto-join on the next state
   * refresh (the player page has an auto-join useEffect for any
   * joinable status — including LIVE).
   */
  const handleStartQuiz = async () => {
    if (questions.length === 0) {
      toast({
        title: "No questions to start",
        description: "Add at least one question before starting the quiz.",
        variant: "destructive",
      });
      return;
    }
    setBusy("start");
    try {
      // Step 1: open lobby if we're still in DRAFT. We do this so the
      // session has a clean LOBBY transition in its history (and so
      // any race-condition client that connects between steps sees a
      // joinable status). The lobby state is fleeting — we immediately
      // flip to LIVE in step 2.
      if (session.status === "DRAFT") {
        await patchSession({
          status: "LOBBY",
          startedAt: new Date().toISOString(),
        });
        emitHostAction("quiz:host:start-lobby");
      }
      // Step 2: start Q1.
      await patchSession({
        status: "LIVE",
        currentQuestionIndex: 0,
        currentQuestionStartedAt: new Date().toISOString(),
      });
      setRevealed(false);
      emitHostAction("quiz:host:start-question");
      toast({
        title: "Quiz is live!",
        description: `Q1 started — ${timeLimitSec}s timer running for all players.`,
      });
      refreshState();
      refreshLeaderboard();
    } catch (e: unknown) {
      toast({
        title: "Failed to start quiz",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleStartQuestion = async (index: number) => {
    setBusy("start");
    try {
      await patchSession({
        status: "LIVE",
        currentQuestionIndex: index,
        currentQuestionStartedAt: new Date().toISOString(),
      });
      setRevealed(false);
      emitHostAction("quiz:host:start-question");
      toast({
        title: `Question ${index + 1} live`,
        description: `${timeLimitSec}s timer started.`,
      });
      refreshState();
      refreshLeaderboard();
    } catch (e: unknown) {
      toast({
        title: "Failed to start question",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleReveal = async () => {
    setBusy("reveal");
    try {
      // Move to BETWEEN status — clients re-fetch /state and see the
      // current question's correctIndex via the leaderboard endpoint's
      // currentQuestionStats. Actually we expose correctIndex only via
      // a separate reveal event — for V1 we just flip to BETWEEN and
      // let the member UI show "correct answer coming up".
      await patchSession({
        status: "BETWEEN",
        currentQuestionStartedAt: null,
      });
      setRevealed(true);
      emitHostAction("quiz:host:reveal");
      toast({ title: "Answer revealed" });
      refreshLeaderboard();
    } catch (e: unknown) {
      toast({
        title: "Failed to reveal",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleNextQuestion = async () => {
    const nextIndex = (session.currentQuestionIndex ?? -1) + 1;
    if (nextIndex >= questions.length) {
      // No more questions — finish
      await handleFinish();
      return;
    }
    await handleStartQuestion(nextIndex);
  };

  const handlePause = async () => {
    setBusy("pause");
    try {
      await patchSession({ status: "PAUSED" });
      emitHostAction("quiz:host:pause");
      toast({ title: "Paused" });
      refreshState();
    } catch (e: unknown) {
      toast({
        title: "Failed to pause",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleResume = async () => {
    setBusy("resume");
    try {
      // Reset the startedAt so the timer resumes from where it left off
      // (approximate — we lose the exact pause moment, but it's close
      // enough for a live quiz).
      await patchSession({
        status: "LIVE",
        currentQuestionStartedAt: new Date().toISOString(),
      });
      emitHostAction("quiz:host:resume");
      toast({ title: "Resumed" });
      refreshState();
    } catch (e: unknown) {
      toast({
        title: "Failed to resume",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleFinish = async () => {
    setBusy("finish");
    try {
      await patchSession({
        status: "FINISHED",
        finishedAt: new Date().toISOString(),
        currentQuestionIndex: null,
        currentQuestionStartedAt: null,
      });
      emitHostAction("quiz:host:finish");
      toast({ title: "Session finished", description: "Final leaderboard locked." });
      await refreshState();
      await refreshLeaderboard();
      // Auto-open the end-of-quiz results view so the host immediately
      // sees the full answer matrix + final standings.
      setShowResults(true);
    } catch (e: unknown) {
      toast({
        title: "Failed to finish",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleAbort = async () => {
    if (!confirm("Abort this session? Members will be kicked out.")) return;
    setBusy("abort");
    try {
      await patchSession({
        status: "ABORTED",
        currentQuestionIndex: null,
        currentQuestionStartedAt: null,
      });
      emitHostAction("quiz:host:abort");
      toast({ title: "Session aborted" });
      refreshState();
    } catch (e: unknown) {
      toast({
        title: "Failed to abort",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  // ── Lifecycle: restart / clear / duplicate ──────────────────────────
  // These are post-session utilities for hosts who want to re-run a
  // quiz, wipe the leaderboard without ending the session, or spin up
  // a clean copy with the same questions.

  /**
   * Restart — reset a FINISHED/ABORTED session back to DRAFT. Wipes
   * all responses + zeroes participant scores. Keeps questions +
   * participant roster. Host can then click "Start quiz" to run it
   * again for the same cohort.
   */
  const handleRestart = async () => {
    const ok = confirm(
      "Restart this quiz?\n\n" +
        "• All answers will be deleted.\n" +
        "• All participant scores reset to 0.\n" +
        "• Questions + the participant roster are kept.\n" +
        "• Status goes back to DRAFT so you can launch again.\n\n" +
        "This cannot be undone.",
    );
    if (!ok) return;
    setBusy("restart");
    try {
      const res = await fetch(`/api/admin/quiz/${sessionId}/restart`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to restart");
      }
      const data = await res.json();
      emitHostAction("quiz:host:abort"); // tell clients to refresh — they'll see DRAFT
      toast({
        title: "Quiz restarted",
        description: `Wiped ${data.wipedResponses ?? 0} response${
          (data.wipedResponses ?? 0) === 1 ? "" : "s"
        }. Session is back to DRAFT — click "Start quiz" to launch again.`,
      });
      setRevealed(false);
      refreshState();
      refreshLeaderboard();
    } catch (e: unknown) {
      toast({
        title: "Failed to restart",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Clear responses — wipe every answer + zero the leaderboard, but
   * don't change the session status. Useful for a mid-flight do-over
   * or a pre-launch sanity reset.
   */
  const handleClearResponses = async () => {
    const ok = confirm(
      "Clear all responses?\n\n" +
        "• All answers will be deleted.\n" +
        "• All participant scores reset to 0.\n" +
        "• Participants stay registered.\n" +
        "• Session status stays the same.\n\n" +
        "This cannot be undone.",
    );
    if (!ok) return;
    setBusy("clear");
    try {
      const res = await fetch(`/api/admin/quiz/${sessionId}/clear-responses`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to clear responses");
      }
      const data = await res.json();
      toast({
        title: "Responses cleared",
        description: `Wiped ${data.wipedResponses ?? 0} response${
          (data.wipedResponses ?? 0) === 1 ? "" : "s"
        }. Leaderboard reset to 0.`,
      });
      refreshLeaderboard();
    } catch (e: unknown) {
      toast({
        title: "Failed to clear",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Duplicate — create a new DRAFT session with the same questions +
   * settings. The duplicate opens in a new browser tab so the host
   * can edit/run it without losing the original.
   */
  const handleDuplicate = async () => {
    setBusy("duplicate");
    try {
      const res = await fetch(`/api/admin/quiz/${sessionId}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to duplicate");
      }
      const data = await res.json();
      const newId = data.session?.id;
      toast({
        title: "Quiz duplicated",
        description: `New draft "${data.session?.title}" created with ${
          data.duplicatedQuestions ?? 0
        } questions. Opening in a new tab…`,
      });
      if (newId && typeof window !== "undefined") {
        window.open(`/admin/quiz/${newId}`, "_blank");
      }
    } catch (e: unknown) {
      toast({
        title: "Failed to duplicate",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  // ── Event linking ─────────────────────────────────────────────────
  // Lets the admin/co-host attach this session to an Event so it shows
  // up on the event page's Quiz tab. The events list is fetched on
  // demand (only when the user opens the picker) to keep the initial
  // page payload small.
  const openEventPicker = async () => {
    if (!linkingEvent) {
      // Lazy-load events on first open
      try {
        const res = await fetch("/api/admin/quiz/events", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          setEventsList(data.events || []);
        }
      } catch {
        /* ignore — user can still try to save with the existing value */
      }
    }
    setLinkingEvent(!linkingEvent);
  };

  const saveEventLink = async () => {
    setSavingEventLink(true);
    try {
      const res = await fetch(`/api/admin/quiz/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: pickedEventId === NO_EVENT_SENTINEL ? null : pickedEventId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      const isLinked = pickedEventId !== NO_EVENT_SENTINEL;
      toast({
        title: isLinked ? "Linked to event" : "Unlinked from event",
        description: isLinked
          ? "Members will see this quiz on the event page's Quiz tab."
          : "Quiz is now standalone (no event).",
      });
      setLinkingEvent(false);
      refreshState();
    } catch (e: unknown) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingEventLink(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const isLive = session.status === "LIVE";
  const isPaused = session.status === "PAUSED";
  const isFinished = session.status === "FINISHED";
  const isAborted = session.status === "ABORTED";
  const isBetween = session.status === "BETWEEN";

  // If the host has the results view open (either auto-shown after
  // Finish or re-opened via the "View results" button), render it
  // instead of the regular control room. They can return via the
  // "Back to control room" button inside the results view.
  if (showResults && isFinished) {
    return (
      <QuizResultsView
        sessionId={sessionId}
        onClose={() => setShowResults(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/admin/quiz" className="hover:underline">
              Quiz
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Control Room</span>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
            <Radio className="h-6 w-6 text-[#FF005A]" />
            {initialSession.title}
            <Badge
              variant="outline"
              className={STATUS_COLORS[session.status] || STATUS_COLORS.DRAFT}
            >
              {session.status}
            </Badge>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Host: {initialSession.host?.name || initialSession.host?.email} ·{" "}
            {questions.length} questions · {session.questionTimeLimitSec}s/Q ·{" "}
            <span className={wsConnected ? "text-green-600" : "text-red-600"}>
              WS {wsConnected ? "connected" : "disconnected"}
            </span>
          </p>
          {/* Event link row */}
          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {linkingEvent ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={pickedEventId} onValueChange={setPickedEventId}>
                  <SelectTrigger className="h-8 min-w-[260px]">
                    <SelectValue placeholder="Pick an event…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_EVENT_SENTINEL}>(no event — standalone)</SelectItem>
                    {eventsList.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {ev.title} —{" "}
                        {new Date(ev.startsAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={saveEventLink}
                  disabled={savingEventLink}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {savingEventLink ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setLinkingEvent(false);
                    setPickedEventId(initialSession.event?.id ?? NO_EVENT_SENTINEL);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : initialSession.event ? (
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Event:</span>
                <Link
                  href={`/events/${initialSession.event.slug}`}
                  className="text-[#FF005A] hover:underline"
                >
                  {initialSession.event.title}
                </Link>
                <button
                  onClick={openEventPicker}
                  className="text-xs text-blue-600 hover:underline ml-1"
                >
                  Change
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="text-amber-700">
                  ⚠ No event linked — members can&apos;t find this quiz from
                  the event page.
                </span>
                <button
                  onClick={openEventPicker}
                  className="text-xs text-[#FF005A] hover:underline"
                >
                  Link an event →
                </button>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href={`/quiz/${sessionId}`} target="_blank">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Open member view
            </Link>
          </Button>
          <Button
            variant={editorMode ? "default" : "outline"}
            size="sm"
            onClick={() => setEditorMode(!editorMode)}
            className={editorMode ? "bg-[#FF005A] hover:bg-[#FF005A]/90 text-white" : ""}
          >
            {editorMode ? (
              <ListOrdered className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Pencil className="h-3.5 w-3.5 mr-1" />
            )}
            {editorMode ? "Back to run view" : "Edit questions"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refreshState(); refreshLeaderboard(); }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* LEFT: Control panel */}
        <div className="space-y-5">
          {/* Live question card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="h-5 w-5 text-[#FF005A]" />
                  {currentQuestion
                    ? `Question ${currentQuestion.order + 1} of ${questions.length}`
                    : "No active question"}
                </CardTitle>
                {isLive && (
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <Clock className="h-4 w-4 text-red-500" />
                    <span className={remainingSec <= 5 ? "text-red-600 font-bold" : ""}>
                      {remainingSec}s
                    </span>
                  </div>
                )}
              </div>
              {isLive && (
                <Progress value={progressPct} className="h-2 mt-2" />
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {currentQuestion ? (
                <>
                  <p className="text-lg font-medium leading-snug">
                    {currentQuestion.text}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentQuestion.options.map((opt, i) => {
                      const isCorrect = i === currentQuestion.correctIndex;
                      const showCorrect = revealed || isFinished;
                      const responseCount = currentQuestionStats?.distribution[i] ?? 0;
                      const responsePct = currentQuestionStats && currentQuestionStats.totalResponses > 0
                        ? Math.round((responseCount / currentQuestionStats.totalResponses) * 100)
                        : 0;
                      return (
                        <div
                          key={i}
                          className={`relative rounded-lg border-2 p-3 transition-colors ${
                            showCorrect && isCorrect
                              ? "border-green-500 bg-green-50"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-xs text-muted-foreground mt-0.5">
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="text-sm">{opt}</span>
                            </div>
                            {showCorrect && isCorrect && (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            )}
                          </div>
                          {currentQuestionStats && (
                            <div className="mt-2">
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#FF005A] transition-all"
                                  style={{ width: `${responsePct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                {responseCount} response{responseCount !== 1 ? "s" : ""} ({responsePct}%)
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {revealed && currentQuestion.deepDive && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs font-semibold text-amber-900 mb-1">
                        Deep dive
                      </p>
                      <p className="text-sm text-amber-800 leading-relaxed">
                        {currentQuestion.deepDive}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Source area: <span className="font-medium">{currentQuestion.sourceAreaId || "—"}</span>
                    {" · "}
                    {currentQuestionStats?.totalResponses ?? 0} of{" "}
                    {participants.length} participants answered
                  </p>
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  {session.status === "DRAFT" && "Session is in draft. Click \"Start quiz\" to open the lobby and launch Q1 for everyone in one tap."}
                  {session.status === "LOBBY" && "Lobby is open. Click \"Start quiz\" to launch Q1 for everyone."}
                  {isBetween && "Between questions. Click \"Next question\" to continue."}
                  {isFinished && "Session finished. Final leaderboard is on the right."}
                  {isAborted && "Session was aborted."}
                  {session.status === "PAUSED" && "Question is paused."}
                </div>
              )}

              {/* Host action bar */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {(session.status === "DRAFT" || session.status === "LOBBY") && (
                  <>
                    <Button
                      onClick={handleStartQuiz}
                      disabled={busy !== null || questions.length === 0}
                      className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white"
                      size="lg"
                    >
                      <Play className="h-4 w-4 mr-1.5" fill="currentColor" />
                      Start quiz
                    </Button>
                    {session.status === "DRAFT" && (
                      <Button
                        onClick={handleStartLobby}
                        disabled={busy !== null}
                        variant="outline"
                      >
                        Open lobby only
                      </Button>
                    )}
                    {questions.length === 0 && (
                      <span className="text-xs text-amber-700 self-center">
                        ⚠ Add at least one question before starting.
                      </span>
                    )}
                  </>
                )}
                {isLive && (
                  <>
                    <Button onClick={handleReveal} disabled={busy !== null} variant="secondary">
                      <Eye className="h-4 w-4 mr-1" />
                      Reveal answer
                    </Button>
                    <Button
                      onClick={handleNextQuestion}
                      disabled={busy !== null || (session.currentQuestionIndex ?? -1) + 1 >= questions.length}
                      variant="outline"
                      className="border-[#FF005A]/40 text-[#FF005A] hover:bg-[#FF005A]/5"
                      title={
                        (session.currentQuestionIndex ?? -1) + 1 >= questions.length
                          ? "No more questions — finish the session instead"
                          : "Skip the reveal and immediately show the next question to all players"
                      }
                    >
                      <SkipForward className="h-4 w-4 mr-1" />
                      Show next question
                    </Button>
                    <Button onClick={handlePause} disabled={busy !== null} variant="outline">
                      <Pause className="h-4 w-4 mr-1" />
                      Pause
                    </Button>
                  </>
                )}
                {isPaused && (
                  <Button onClick={handleResume} disabled={busy !== null}>
                    <Play className="h-4 w-4 mr-1" />
                    Resume
                  </Button>
                )}
                {isBetween && (
                  <Button onClick={handleNextQuestion} disabled={busy !== null}>
                    <SkipForward className="h-4 w-4 mr-1" />
                    Next question
                  </Button>
                )}
                {!isFinished && !isAborted && session.status !== "DRAFT" && (
                  <Button
                    onClick={handleFinish}
                    disabled={busy !== null}
                    variant="outline"
                    className="text-green-700 border-green-300 hover:bg-green-50"
                  >
                    <Square className="h-4 w-4 mr-1" />
                    Finish
                  </Button>
                )}
                {!isFinished && !isAborted && (
                  <Button
                    onClick={handleAbort}
                    disabled={busy !== null}
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                  >
                    <AlertCircle className="h-4 w-4 mr-1" />
                    Abort
                  </Button>
                )}
                {/* View results — re-opens the end-of-quiz summary view
                    (the same one that auto-opens when the host clicks
                    Finish). Only shown for FINISHED sessions. */}
                {isFinished && (
                  <Button
                    onClick={() => setShowResults(true)}
                    disabled={busy !== null}
                    className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white"
                  >
                    <BarChart3 className="h-4 w-4 mr-1.5" />
                    View results
                  </Button>
                )}
                {/* Restart — only on FINISHED/ABORTED. Wipes responses +
                    resets to DRAFT so the host can launch again. */}
                {(isFinished || isAborted) && (
                  <Button
                    onClick={handleRestart}
                    disabled={busy !== null}
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Restart quiz
                  </Button>
                )}
                {/* More actions: Clear responses + Duplicate. Available in
                    any status. Use a dropdown so we don't clutter the
                    primary action bar. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={busy !== null}>
                      <MoreVertical className="h-4 w-4 mr-1" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={handleDuplicate}
                      className="cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5 mr-2" />
                      Duplicate (new draft with same Q&amp;A)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleClearResponses}
                      className="cursor-pointer text-amber-700 focus:text-amber-800 focus:bg-amber-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Clear responses + reset leaderboard
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>

          {/* Question list (jump-to) OR full editor */}
          {editorMode ? (
            <QuizQuestionEditor
              sessionId={sessionId}
              questions={questions}
              sessionStatus={session.status}
              sessionDefaultTimeSec={session.questionTimeLimitSec}
              onQuestionsChanged={(next) => {
                setQuestions(next);
                // Also patch the parent's session.totalQuestions so the
                // header counter stays in sync.
                setSession((s) => ({
                  ...s,
                  totalQuestions: next.length,
                }));
              }}
            />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Question bank</CardTitle>
                <CardDescription>
                  Click a question to start it (jumps the live cursor). Use
                  &quot;Edit questions&quot; above to modify text, options,
                  or the correct answer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 max-h-80 overflow-y-auto">
                {questions.map((q, i) => {
                  const isCurrent = i === session.currentQuestionIndex;
                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        if (session.status === "DRAFT") {
                          toast({
                            title: "Open the lobby first",
                            variant: "destructive",
                          });
                          return;
                        }
                        handleStartQuestion(i);
                      }}
                      disabled={busy !== null || isFinished || isAborted}
                      className={`w-full text-left rounded-md border p-2.5 transition-colors ${
                        isCurrent
                          ? "border-[#FF005A] bg-[#FF005A]/5"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      } ${!q.enabled ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-bold text-muted-foreground mt-0.5 shrink-0">
                          Q{i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug line-clamp-2">{q.text}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {q.sourceAreaId} · {q.options.length} options
                          </p>
                        </div>
                        {isCurrent && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            LIVE
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT: Live leaderboard + participants */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Leaderboard
              </CardTitle>
              <CardDescription>
                {participants.length} participant{participants.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 max-h-[480px] overflow-y-auto">
              {participants.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No participants yet
                </div>
              ) : (
                participants.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 rounded-md p-2 ${
                      p.isPodium
                        ? "bg-amber-50 border border-amber-200"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="w-6 text-center text-sm font-bold text-muted-foreground shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {p.displayName}
                        </span>
                        {p.isOnline && (
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.correctCount}/{p.answeredCount} correct
                        {p.avgResponseMs
                          ? ` · ${(p.avgResponseMs / 1000).toFixed(1)}s avg`
                          : ""}
                      </div>
                    </div>
                    <span className="text-sm font-mono font-bold tabular-nums">
                      {p.totalScore.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Member link card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Member join link</CardTitle>
              <CardDescription>
                Share this with members. They sign in, then join the quiz.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-gray-100 p-2.5 font-mono text-xs break-all">
                {typeof window !== "undefined" ? window.location.origin : ""}
                /quiz/{sessionId}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => {
                  const url = `${window.location.origin}/quiz/${sessionId}`;
                  navigator.clipboard.writeText(url);
                  toast({ title: "Link copied" });
                }}
              >
                Copy member link
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
