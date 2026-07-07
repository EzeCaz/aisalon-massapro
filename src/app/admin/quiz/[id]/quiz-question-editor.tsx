"use client";

import { useState } from "react";
import { Plus, Trash2, Save, X, ChevronUp, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export interface Question {
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

interface Props {
  sessionId: string;
  questions: Question[];
  sessionStatus: string;
  sessionDefaultTimeSec: number;
  /** Called after any mutation so the parent can refresh its in-memory copy */
  onQuestionsChanged: (questions: Question[]) => void;
}

const AREA_OPTIONS = [
  { value: "", label: "(no area)" },
  { value: "identity-purpose", label: "Identity & Purpose" },
  { value: "education-development", label: "Education & Development" },
  { value: "work-economic", label: "Work & Economic" },
  { value: "wellbeing", label: "Wellbeing" },
  { value: "relationships-community", label: "Relationships & Community" },
  { value: "creativity-culture", label: "Creativity & Culture" },
];

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export function QuizQuestionEditor({
  sessionId,
  questions: initialQuestions,
  sessionStatus,
  sessionDefaultTimeSec,
  onQuestionsChanged,
}: Props) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const readOnly = sessionStatus === "FINISHED" || sessionStatus === "ABORTED";

  const persistQuestion = async (qid: string, body: Partial<Question>) => {
    setSavingId(qid);
    try {
      const res = await fetch(
        `/api/admin/quiz/${sessionId}/questions/${qid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      const { question } = await res.json();
      setQuestions((prev) =>
        prev.map((q) => (q.id === qid ? { ...q, ...question } : q)),
      );
      onQuestionsChanged(
        questions.map((q) => (q.id === qid ? { ...q, ...question } : q)),
      );
      toast({ title: "Saved", description: "Question updated." });
      setEditingId(null);
    } catch (e: unknown) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const deleteQuestion = async (qid: string) => {
    if (!confirm("Delete this question? Re-orders remaining questions.")) return;
    setDeletingId(qid);
    try {
      const res = await fetch(
        `/api/admin/quiz/${sessionId}/questions/${qid}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete");
      }
      const updated = questions.filter((q) => q.id !== qid)
        .map((q, i) => ({ ...q, order: i }));
      setQuestions(updated);
      onQuestionsChanged(updated);
      toast({ title: "Deleted", description: "Question removed." });
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Question editor
            </CardTitle>
            <CardDescription>
              Edit text, options, correct answer, deep dive, and time limit.
              Changes are live for members the moment you hit Save.
            </CardDescription>
          </div>
          <Badge variant="outline">{questions.length} questions</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {readOnly && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              This session is <strong>{sessionStatus}</strong> — questions are
              read-only to preserve the historical record.
            </div>
          </div>
        )}

        {questions.length === 0 && !addingNew && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No questions yet. Click &quot;Add question&quot; below to create
            your first one.
          </div>
        )}

        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            isEditing={editingId === q.id}
            readOnly={readOnly}
            saving={savingId === q.id}
            deleting={deletingId === q.id}
            sessionDefaultTimeSec={sessionDefaultTimeSec}
            onEdit={() => setEditingId(q.id)}
            onCancel={() => setEditingId(null)}
            onSave={(body) => persistQuestion(q.id, body)}
            onDelete={() => deleteQuestion(q.id)}
          />
        ))}

        {addingNew && (
          <NewQuestionCard
            sessionDefaultTimeSec={sessionDefaultTimeSec}
            order={questions.length}
            saving={savingId === "__new__"}
            onCancel={() => setAddingNew(false)}
            onSave={async (body) => {
              setSavingId("__new__");
              try {
                const res = await fetch(
                  `/api/admin/quiz/${sessionId}/questions`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  },
                );
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || "Failed to add");
                }
                const { question } = await res.json();
                const updated = [...questions, question];
                setQuestions(updated);
                onQuestionsChanged(updated);
                toast({ title: "Question added" });
                setAddingNew(false);
              } catch (e: unknown) {
                toast({
                  title: "Could not add",
                  description: e instanceof Error ? e.message : "Unknown error",
                  variant: "destructive",
                });
              } finally {
                setSavingId(null);
              }
            }}
          />
        )}

        {!readOnly && !addingNew && (
          <Button
            variant="outline"
            onClick={() => setAddingNew(true)}
            className="w-full border-dashed"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add question
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Single-question card (read or edit mode) ───────────────────────────

function QuestionCard({
  question: q,
  index,
  isEditing,
  readOnly,
  saving,
  deleting,
  sessionDefaultTimeSec,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  question: Question;
  index: number;
  isEditing: boolean;
  readOnly: boolean;
  saving: boolean;
  deleting: boolean;
  sessionDefaultTimeSec: number;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (body: Partial<Question>) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(q.text);
  const [options, setOptions] = useState<string[]>(q.options);
  const [correctIndex, setCorrectIndex] = useState(q.correctIndex);
  const [deepDive, setDeepDive] = useState(q.deepDive ?? "");
  const [sourceAreaId, setSourceAreaId] = useState(q.sourceAreaId ?? "");
  const [timeLimitSec, setTimeLimitSec] = useState<string>(
    q.timeLimitSec != null ? String(q.timeLimitSec) : "",
  );
  const [enabled, setEnabled] = useState(q.enabled);

  // Re-sync local state if the question prop changes (e.g. parent refresh)
  // but only when NOT editing, so we don't clobber the user's in-progress edits.
  // React keys on q.id ensure a fresh mount when switching questions.

  if (isEditing) {
    return (
      <div className="rounded-md border-2 border-[#FF005A]/40 bg-[#FF005A]/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground">
            Q{index + 1} — editing
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() =>
                onSave({
                  text: text.trim(),
                  options: options.map((o) => o.trim()),
                  correctIndex,
                  deepDive: deepDive.trim() || null,
                  sourceAreaId: sourceAreaId.trim() || null,
                  timeLimitSec: timeLimitSec
                    ? Math.max(5, Math.min(300, Number(timeLimitSec)))
                    : null,
                  enabled,
                })
              }
              disabled={saving}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>

        <QuestionEditorBody
          text={text}
          options={options}
          correctIndex={correctIndex}
          deepDive={deepDive}
          sourceAreaId={sourceAreaId}
          timeLimitSec={timeLimitSec}
          enabled={enabled}
          sessionDefaultTimeSec={sessionDefaultTimeSec}
          onTextChange={setText}
          onOptionsChange={(next, nextCorrect) => {
            setOptions(next);
            if (nextCorrect != null) setCorrectIndex(nextCorrect);
          }}
          onCorrectChange={setCorrectIndex}
          onDeepDiveChange={setDeepDive}
          onSourceAreaChange={setSourceAreaId}
          onTimeLimitChange={setTimeLimitSec}
          onEnabledChange={setEnabled}
        />
      </div>
    );
  }

  // Read-only / collapsed view
  return (
    <div
      className={`rounded-md border p-3 transition-colors ${
        !enabled ? "opacity-60" : ""
      } ${
        q.correctIndex >= q.options.length
          ? "border-red-400 bg-red-50"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-muted-foreground mt-0.5 shrink-0">
          Q{index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{q.text}</p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {q.options.map((opt, i) => (
              <li
                key={i}
                className={`flex items-center gap-1.5 ${
                  i === q.correctIndex ? "text-green-700 font-medium" : ""
                }`}
              >
                <span className="w-3.5 font-bold">{OPTION_LABELS[i]}</span>
                <span className="truncate">{opt}</span>
                {i === q.correctIndex && (
                  <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                )}
              </li>
            ))}
          </ul>
          {q.deepDive && (
            <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5">
              <span className="font-semibold">Deep dive: </span>
              {q.deepDive.length > 120
                ? q.deepDive.slice(0, 120) + "…"
                : q.deepDive}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {q.sourceAreaId || "no area"}
            </Badge>
            <span>
              ⏱ {q.timeLimitSec != null ? `${q.timeLimitSec}s` : `${sessionDefaultTimeSec}s (default)`}
            </span>
            {!enabled && (
              <Badge variant="outline" className="text-[10px] bg-gray-100">
                Disabled
              </Badge>
            )}
            {q.correctIndex >= q.options.length && (
              <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-300">
                ⚠ correctIndex out of range
              </Badge>
            )}
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-col gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              disabled={deleting}
              className="text-red-600 hover:bg-red-50"
            >
              {deleting ? "…" : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New-question card ───────────────────────────────────────────────────

function NewQuestionCard({
  order,
  saving,
  sessionDefaultTimeSec,
  onCancel,
  onSave,
}: {
  order: number;
  saving: boolean;
  sessionDefaultTimeSec: number;
  onCancel: () => void;
  onSave: (body: {
    text: string;
    options: string[];
    correctIndex: number;
    deepDive: string | null;
    sourceAreaId: string | null;
    timeLimitSec: number | null;
    enabled: boolean;
  }) => void;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [deepDive, setDeepDive] = useState("");
  const [sourceAreaId, setSourceAreaId] = useState("");
  const [timeLimitSec, setTimeLimitSec] = useState<string>("");
  const [enabled, setEnabled] = useState(true);

  const canSave =
    text.trim().length > 0 &&
    options.length >= 2 &&
    options.every((o) => o.trim().length > 0) &&
    correctIndex >= 0 &&
    correctIndex < options.length;

  return (
    <div className="rounded-md border-2 border-green-500/40 bg-green-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">
          Q{order + 1} — new question
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() =>
              onSave({
                text: text.trim(),
                options: options.map((o) => o.trim()),
                correctIndex,
                deepDive: deepDive.trim() || null,
                sourceAreaId: sourceAreaId.trim() || null,
                timeLimitSec: timeLimitSec
                  ? Math.max(5, Math.min(300, Number(timeLimitSec)))
                  : null,
                enabled,
              })
            }
            disabled={!canSave || saving}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {saving ? "Adding…" : "Add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
      <QuestionEditorBody
        text={text}
        options={options}
        correctIndex={correctIndex}
        deepDive={deepDive}
        sourceAreaId={sourceAreaId}
        timeLimitSec={timeLimitSec}
        enabled={enabled}
        sessionDefaultTimeSec={sessionDefaultTimeSec}
        onTextChange={setText}
        onOptionsChange={(next, nextCorrect) => {
          setOptions(next);
          if (nextCorrect != null) setCorrectIndex(nextCorrect);
        }}
        onCorrectChange={setCorrectIndex}
        onDeepDiveChange={setDeepDive}
        onSourceAreaChange={setSourceAreaId}
        onTimeLimitChange={setTimeLimitSec}
        onEnabledChange={setEnabled}
      />
    </div>
  );
}

// ── Shared editor body (used by both Edit and New) ──────────────────────

function QuestionEditorBody({
  text,
  options,
  correctIndex,
  deepDive,
  sourceAreaId,
  timeLimitSec,
  enabled,
  sessionDefaultTimeSec,
  onTextChange,
  onOptionsChange,
  onCorrectChange,
  onDeepDiveChange,
  onSourceAreaChange,
  onTimeLimitChange,
  onEnabledChange,
}: {
  text: string;
  options: string[];
  correctIndex: number;
  deepDive: string;
  sourceAreaId: string;
  timeLimitSec: string;
  enabled: boolean;
  sessionDefaultTimeSec: number;
  onTextChange: (v: string) => void;
  onOptionsChange: (next: string[], nextCorrect?: number) => void;
  onCorrectChange: (v: number) => void;
  onDeepDiveChange: (v: string) => void;
  onSourceAreaChange: (v: string) => void;
  onTimeLimitChange: (v: string) => void;
  onEnabledChange: (v: boolean) => void;
}) {
  const updateOption = (i: number, val: string) => {
    const next = [...options];
    next[i] = val;
    onOptionsChange(next);
  };
  const addOption = () => {
    if (options.length >= 6) return;
    onOptionsChange([...options, ""]);
  };
  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    const next = options.filter((_, idx) => idx !== i);
    // If we're removing the correct one, default to first.
    const nextCorrect =
      i === correctIndex ? 0 : i < correctIndex ? correctIndex - 1 : correctIndex;
    onOptionsChange(next, nextCorrect);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Question text
        </label>
        <Textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="e.g. According to the field guide, what makes human work irreplaceable in the age of AI?"
          rows={2}
          maxLength={1000}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Options (tap the circle to mark the correct answer)
        </label>
        <div className="space-y-1.5">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onCorrectChange(i)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  i === correctIndex
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-gray-300 text-muted-foreground hover:border-gray-400"
                }`}
                title={
                  i === correctIndex
                    ? "Marked as correct — click another to change"
                    : "Mark as correct"
                }
              >
                {i === correctIndex ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-bold">{OPTION_LABELS[i]}</span>
                )}
              </button>
              <Input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`Option ${OPTION_LABELS[i]}`}
                maxLength={200}
                className="flex-1"
              />
              {options.length > 2 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeOption(i)}
                  className="text-red-600 hover:bg-red-50 px-2"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={addOption}
            className="text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add option
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deep dive (shown at reveal — optional)
        </label>
        <Textarea
          value={deepDive}
          onChange={(e) => onDeepDiveChange(e.target.value)}
          placeholder="Context, source reference, or follow-up discussion prompt shown after the answer is revealed."
          rows={2}
          maxLength={2000}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Source area
          </label>
          <select
            value={sourceAreaId}
            onChange={(e) => onSourceAreaChange(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {AREA_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Time limit (sec)
          </label>
          <Input
            type="number"
            min={5}
            max={300}
            value={timeLimitSec}
            onChange={(e) => onTimeLimitChange(e.target.value)}
            placeholder={`${sessionDefaultTimeSec} (session default)`}
          />
        </div>
        <div className="space-y-1 flex flex-col">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Enabled
          </label>
          <div className="flex items-center h-9 gap-2">
            <Switch checked={enabled} onCheckedChange={onEnabledChange} />
            <span className="text-xs text-muted-foreground">
              {enabled ? "Will be asked" : "Skipped in live run"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
