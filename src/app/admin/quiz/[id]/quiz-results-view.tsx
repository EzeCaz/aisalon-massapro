"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Trophy,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Brain,
  TrendingUp,
  Percent,
  Medal,
  Award,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────
interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  totalScore: number;
  correctCount: number;
  answeredCount: number;
  avgResponseMs: number | null;
  isOnline: boolean;
  userId: string;
  joinedAt: string;
  rank: number;
  isPodium: boolean;
}

interface QuestionResponse {
  participantId: string;
  displayName: string;
  rank: number;
  answered: boolean;
  selectedIndex: number | null;
  isCorrect: boolean;
  responseMs: number | null;
  points: number;
  answeredAt: string | null;
}

interface QuestionBreakdown {
  id: string;
  order: number;
  text: string;
  options: string[];
  correctIndex: number;
  deepDive: string | null;
  sourceAreaId: string | null;
  enabled: boolean;
  timeLimitSec: number | null;
  totalAnswered: number;
  totalCorrect: number;
  totalParticipants: number;
  distribution: number[];
  responses: QuestionResponse[];
}

interface SessionSummary {
  id: string;
  title: string;
  status: string;
  questionTimeLimitSec: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  totalQuestions: number;
  _count: { responses: number; participants: number };
}

interface ResultsPayload {
  session: SessionSummary;
  leaderboard: LeaderboardEntry[];
  questions: QuestionBreakdown[];
}

interface Props {
  sessionId: string;
  onClose: () => void;
}

const PODIUM_STYLES = [
  "border-yellow-300 bg-yellow-50", // 1st — gold
  "border-gray-300 bg-gray-50", // 2nd — silver
  "border-amber-400 bg-amber-50", // 3rd — bronze
];

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * QuizResultsView
 * ----------------
 * Full end-of-session summary shown when the host clicks "Finish".
 *
 * Layout:
 *   1. Header card — title, finished-at, totals (participants / responses /
 *      avg score).
 *   2. Leaderboard card — final standings with podium styling for top 3.
 *   3. Per-question breakdown — collapsible accordion; each entry shows
 *      the question text, all 4 options (correct one highlighted), the
 *      distribution bar, the deep dive (if any), and a table of every
 *      participant with their answer / response time / correct-incorrect
 *      badge / points awarded.
 */
export function QuizResultsView({ sessionId, onClose }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [openQuestions, setOpenQuestions] = useState<Set<number>>(new Set([0]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/quiz/${sessionId}/results`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load results");
      }
      const payload = (await res.json()) as ResultsPayload;
      setData(payload);
      // Auto-expand the first question on initial load.
      if (payload.questions.length > 0) {
        setOpenQuestions(new Set([0]));
      }
    } catch (e: unknown) {
      toast({
        title: "Failed to load results",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleQuestion = (order: number) => {
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  };

  const expandAll = () => {
    if (!data) return;
    setOpenQuestions(new Set(data.questions.map((q) => q.order)));
  };

  const collapseAll = () => setOpenQuestions(new Set());

  const exportCsv = () => {
    if (!data) return;
    const rows: string[] = [];
    // Header
    rows.push(
      [
        "Rank",
        "Participant",
        "Total Score",
        "Correct",
        "Answered",
        "Avg Response (ms)",
      ]
        .concat(data.questions.map((q) => `Q${q.order + 1} Answer`))
        .concat(data.questions.map((q) => `Q${q.order + 1} Time (ms)`))
        .concat(data.questions.map((q) => `Q${q.order + 1} Correct?`))
        .concat(data.questions.map((q) => `Q${q.order + 1} Points`))
        .join(","),
    );
    // Per-participant rows
    for (const p of data.leaderboard) {
      const answerCells: string[] = [];
      const timeCells: string[] = [];
      const correctCells: string[] = [];
      const pointCells: string[] = [];
      for (const q of data.questions) {
        const r = q.responses.find((x) => x.participantId === p.id);
        if (!r || !r.answered) {
          answerCells.push("(no answer)");
          timeCells.push("");
          correctCells.push("no");
          pointCells.push("0");
        } else {
          const opt = r.selectedIndex != null ? q.options[r.selectedIndex] : "(no answer)";
          answerCells.push(`"${(opt || "").replace(/"/g, '""')}"`);
          timeCells.push(String(r.responseMs ?? ""));
          correctCells.push(r.isCorrect ? "yes" : "no");
          pointCells.push(String(r.points));
        }
      }
      const cells = [
        String(p.rank),
        `"${p.displayName.replace(/"/g, '""')}"`,
        String(p.totalScore),
        String(p.correctCount),
        String(p.answeredCount),
        p.avgResponseMs != null ? String(p.avgResponseMs) : "",
      ]
        .concat(answerCells)
        .concat(timeCells)
        .concat(correctCells)
        .concat(pointCells);
      rows.push(cells.join(","));
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiz-${data.session.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin opacity-60" />
            Loading final results…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No results available.
        </CardContent>
      </Card>
    );
  }

  const { session, leaderboard, questions } = data;
  const totalPossiblePerQ = 1000; // base 500 + speed bonus 500 — see scoring
  const totalPossible = questions.length * totalPossiblePerQ;
  const avgScore = leaderboard.length > 0
    ? Math.round(
        leaderboard.reduce((s, p) => s + p.totalScore, 0) / leaderboard.length,
      )
    : 0;
  const totalResponses = session._count.responses;

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="border-[#FF005A]/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
                <Trophy className="h-5 w-5 text-amber-500" />
                {session.title}
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-700 border-green-200"
                >
                  FINISHED
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Quiz ended {formatDate(session.finishedAt)} ·{" "}
                {questions.length} question{questions.length !== 1 ? "s" : ""} ·{" "}
                {leaderboard.length} participant{leaderboard.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Export CSV
              </Button>
              <Button
                size="sm"
                onClick={onClose}
                className="bg-[#FF005A] hover:bg-[#FF005A]/90 text-white"
              >
                Back to control room
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              icon={<Users className="h-4 w-4 text-blue-500" />}
              label="Participants"
              value={String(leaderboard.length)}
            />
            <StatTile
              icon={<TrendingUp className="h-4 w-4 text-purple-500" />}
              label="Total responses"
              value={String(totalResponses)}
            />
            <StatTile
              icon={<Medal className="h-4 w-4 text-amber-500" />}
              label="Avg score"
              value={avgScore.toLocaleString()}
              sub={`/ ${totalPossible.toLocaleString()} max`}
            />
            <StatTile
              icon={<Percent className="h-4 w-4 text-green-500" />}
              label="Avg accuracy"
              value={
                leaderboard.length === 0
                  ? "—"
                  : `${Math.round(
                      (leaderboard.reduce((s, p) => s + p.correctCount, 0) /
                        Math.max(
                          1,
                          leaderboard.reduce((s, p) => s + p.answeredCount, 0),
                        )) *
                        100,
                    )}%`
              }
              sub="correct / answered"
            />
          </div>
        </CardContent>
      </Card>

      {/* Final Leaderboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Final Leaderboard
          </CardTitle>
          <CardDescription>
            Ranked by score (tiebreakers: more correct · faster avg response ·
            earlier join).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No participants joined this quiz.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Podium — top 3 */}
              {leaderboard.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                  {leaderboard.slice(0, 3).map((p, idx) => {
                    const medal = idx === 0
                      ? <Medal className="h-5 w-5 text-yellow-500" />
                      : idx === 1
                        ? <Award className="h-5 w-5 text-gray-400" />
                        : <Award className="h-5 w-5 text-amber-600" />;
                    const placeLabel = idx === 0 ? "1st" : idx === 1 ? "2nd" : "3rd";
                    return (
                      <div
                        key={p.id}
                        className={`rounded-lg border-2 p-3 ${PODIUM_STYLES[idx] ?? "border-gray-200"}`}
                      >
                        <div className="flex items-center gap-2">
                          {medal}
                          <Badge variant="outline" className="text-[10px]">
                            {placeLabel}
                          </Badge>
                        </div>
                        <p className="font-semibold text-sm mt-1.5 truncate">
                          {p.displayName}
                        </p>
                        <p className="text-2xl font-mono font-bold tabular-nums mt-1">
                          {p.totalScore.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {p.correctCount}/{p.answeredCount} correct ·{" "}
                          {p.avgResponseMs
                            ? `${(p.avgResponseMs / 1000).toFixed(1)}s avg`
                            : "—"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Full standings table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Correct</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Answered</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Avg time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((p) => (
                    <TableRow
                      key={p.id}
                      className={p.isPodium ? "bg-amber-50/50" : ""}
                    >
                      <TableCell className="text-center font-bold text-muted-foreground">
                        {p.rank}
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.displayName}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold tabular-nums">
                        {p.totalScore.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {p.correctCount}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        {p.answeredCount}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        {p.avgResponseMs != null
                          ? `${(p.avgResponseMs / 1000).toFixed(1)}s`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-question breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-[#FF005A]" />
                Question-by-question breakdown
              </CardTitle>
              <CardDescription className="mt-1">
                Click a question to see every participant&apos;s answer, response
                time, and points awarded.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                Expand all
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                Collapse all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {questions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No questions in this session.
            </div>
          ) : (
            questions.map((q) => {
              const isOpen = openQuestions.has(q.order);
              const correctPct = q.totalParticipants > 0
                ? Math.round((q.totalCorrect / q.totalParticipants) * 100)
                : 0;
              const answeredPct = q.totalParticipants > 0
                ? Math.round((q.totalAnswered / q.totalParticipants) * 100)
                : 0;
              return (
                <Collapsible
                  key={q.id}
                  open={isOpen}
                  onOpenChange={() => toggleQuestion(q.order)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className={`w-full text-left rounded-md border p-3 transition-colors ${
                        isOpen
                          ? "border-[#FF005A] bg-[#FF005A]/5"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-xs font-bold text-muted-foreground mt-0.5 shrink-0">
                          Q{q.order + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug line-clamp-2">
                            {q.text}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                              {q.totalCorrect}/{q.totalParticipants} correct ({correctPct}%)
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {q.totalAnswered}/{q.totalParticipants} answered ({answeredPct}%)
                            </span>
                            {q.sourceAreaId && (
                              <span className="inline-flex items-center gap-1">
                                <Brain className="h-3 w-3" />
                                {q.sourceAreaId}
                              </span>
                            )}
                          </div>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md border border-gray-200 bg-white p-3 space-y-3">
                      {/* Options + distribution */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, i) => {
                          const isCorrect = i === q.correctIndex;
                          const count = q.distribution[i] ?? 0;
                          const pct = q.totalAnswered > 0
                            ? Math.round((count / q.totalAnswered) * 100)
                            : 0;
                          return (
                            <div
                              key={i}
                              className={`relative rounded-lg border-2 p-2.5 ${
                                isCorrect
                                  ? "border-green-500 bg-green-50"
                                  : "border-gray-200"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5">
                                  <span className="font-bold text-[10px] text-muted-foreground mt-0.5">
                                    {String.fromCharCode(65 + i)}
                                  </span>
                                  <span className="text-xs">{opt}</span>
                                </div>
                                {isCorrect && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] bg-green-100 text-green-700 border-green-300 shrink-0"
                                  >
                                    CORRECT
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-1.5">
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      isCorrect ? "bg-green-500" : "bg-[#FF005A]"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-muted-foreground mt-0.5 block">
                                  {count} answer{count !== 1 ? "s" : ""} ({pct}%)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Deep dive */}
                      {q.deepDive && (
                        <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5">
                          <p className="text-[10px] font-semibold text-amber-900 mb-0.5">
                            Deep dive
                          </p>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            {q.deepDive}
                          </p>
                        </div>
                      )}

                      {/* Per-participant response table */}
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                          Participant answers
                        </p>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10 text-center">#</TableHead>
                                <TableHead>Participant</TableHead>
                                <TableHead>Their answer</TableHead>
                                <TableHead className="text-right">
                                  <Clock className="h-3 w-3 inline mr-0.5" />
                                  Time
                                </TableHead>
                                <TableHead className="text-center">Result</TableHead>
                                <TableHead className="text-right">Points</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {q.responses.map((r) => {
                                const opt =
                                  r.selectedIndex != null
                                    ? q.options[r.selectedIndex]
                                    : null;
                                return (
                                  <TableRow key={r.participantId}>
                                    <TableCell className="text-center text-[10px] font-bold text-muted-foreground">
                                      {r.rank}
                                    </TableCell>
                                    <TableCell className="font-medium text-xs">
                                      {r.displayName}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {!r.answered || r.selectedIndex == null ? (
                                        <span className="inline-flex items-center gap-1 text-muted-foreground italic">
                                          <MinusCircle className="h-3 w-3" />
                                          No answer
                                        </span>
                                      ) : (
                                        <span
                                          className={
                                            r.isCorrect
                                              ? "text-green-700 font-medium"
                                              : "text-red-700"
                                          }
                                        >
                                          <span className="text-[10px] text-muted-foreground mr-1">
                                            {String.fromCharCode(65 + r.selectedIndex)}.
                                          </span>
                                          {opt}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-mono tabular-nums">
                                      {formatMs(r.responseMs)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {r.isCorrect ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-500 inline" />
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-mono font-bold tabular-nums">
                                      {r.points}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border bg-white p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {sub && (
          <span className="text-[10px] text-muted-foreground">{sub}</span>
        )}
      </div>
    </div>
  );
}
