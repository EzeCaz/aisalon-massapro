"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brain, Plus, Trash2, Play, ExternalLink, Users, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface QuizSessionListItem {
  id: string;
  title: string;
  status: string;
  questionTimeLimitSec: number;
  totalQuestions: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  host: { id: string; name: string | null; email: string } | null;
  event: { id: string; title: string; slug: string } | null;
  _count: { questions: number; participants: number; responses: number };
}

interface EventOption {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  chapter: string;
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

export function QuizAdminList({
  sessions,
  events,
  hostUserId,
}: {
  sessions: QuizSessionListItem[];
  events: EventOption[];
  hostUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTimeLimit, setNewTimeLimit] = useState(30);
  const [newEventId, setNewEventId] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
          eventId: newEventId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create session");
      }
      const { session } = await res.json();
      toast({
        title: "Quiz session created",
        description: `Seeded ${session._count.questions} questions from the AI Salon field guide.`,
      });
      setNewTitle("");
      setNewTimeLimit(30);
      setNewEventId("");
      router.push(`/admin/quiz/${session.id}`);
    } catch (e: unknown) {
      toast({
        title: "Could not create session",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This removes all questions, responses, and participants. No undo.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/quiz/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete");
      }
      toast({ title: "Session deleted" });
      router.refresh();
    } catch (e: unknown) {
      toast({
        title: "Could not delete",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-[#FF005A]" />
            Flourishing Quiz
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Real-time, Kahoot-style quiz engine for AI Salon events.
            Create a session, seed it from the field guide, edit the questions
            to taste, and host it live with the Control Room. Members join
            from the event page&apos;s Quiz tab.
          </p>
        </div>
      </div>

      {/* Create new session card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-4 w-4" />
            New quiz session
          </CardTitle>
          <CardDescription>
            Seeds ~18 questions from the AI &amp; Human Flourishing field
            guide (six conversation areas, four postures). You can edit every
            question, option, and the correct answer in the Control Room.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Session title</label>
              <Input
                placeholder="e.g. AI & Human Flourishing — July 2026"
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
                onChange={(e) =>
                  setNewTimeLimit(Number(e.target.value) || 30)
                }
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating}
            >
              {creating ? "Creating..." : "Create & seed"}
            </Button>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Linked event (optional — recommended)
            </label>
            <Select value={newEventId} onValueChange={setNewEventId}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    events.length === 0
                      ? "No events available"
                      : "Pick an event to show this quiz on its Quiz tab…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {events.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>
                    {ev.title} —{" "}
                    {new Date(ev.startsAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ({ev.chapter})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              When you link an event, all members logged in to the event page
              see a Quiz tab and can join the session with one tap.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sessions list */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          All sessions ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Brain className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                No quiz sessions yet. Create your first one above.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {sessions.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Link
                          href={`/admin/quiz/${s.id}`}
                          className="font-semibold hover:underline"
                        >
                          {s.title}
                        </Link>
                        <Badge
                          variant="outline"
                          className={STATUS_COLORS[s.status] || STATUS_COLORS.DRAFT}
                        >
                          {s.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Brain className="h-3 w-3" />
                          {s._count.questions} questions
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {s._count.participants} participants
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {s.questionTimeLimitSec}s / Q
                        </span>
                        {s.event ? (
                          <Link
                            href={`/events/${s.event.slug}`}
                            className="text-[#FF005A] hover:underline"
                          >
                            Event: {s.event.title}
                          </Link>
                        ) : (
                          <span className="text-amber-700">
                            ⚠ No event linked
                          </span>
                        )}
                        <span>
                          Host: {s.host?.name || s.host?.email || "—"}
                        </span>
                        <span>
                          Created {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm">
                        <Link href={`/admin/quiz/${s.id}`}>
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Open Control Room
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/quiz/${s.id}`} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Member view
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(s.id, s.title)}
                        disabled={deletingId === s.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
