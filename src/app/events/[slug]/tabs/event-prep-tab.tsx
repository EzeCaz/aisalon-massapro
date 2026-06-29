"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Check, X, Pencil, Plus, MessageSquare, Lightbulb, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

/**
 * EventPrepTab — interactive "Event prep" tab.
 *
 * Layout (per user spec 2026-06-30):
 *   LEFT column  — one box per speaker, showing their personalized questions
 *                  (scope="SPEAKER"). Each question is editable (Super Admin)
 *                  or suggestable (Admin / Co-host).
 *   RIGHT column — the generic questions list (scope="GENERIC"), applying to
 *                  all speakers. Same edit/suggest flow.
 *
 * Permissions:
 *   - Super Admin: can directly edit any question text/tag, add new ones,
 *     delete, and accept/reject pending suggestions.
 *   - Admin / Co-host of this event: cannot edit directly. Instead, clicking
 *     "Suggest" opens a dialog where they can propose a new text. Their
 *     suggestion is stored with their name + timestamp, visible to all
 *     other admins/co-hosts/super admin. Super Admin can accept (apply)
 *     or reject each suggestion.
 *
 * Data flow:
 *   - On mount: GET /api/events/[slug]/event-prep → { questions, suggestions, me }
 *   - On Super Admin edit: PUT /api/events/[slug]/event-prep with mode=replaceOne
 *   - On Admin/Co-host suggest: POST /api/events/[slug]/event-prep
 *   - On Super Admin accept/reject: PATCH .../suggestions/[id]
 */

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  photoUrl: string | null;
};

type Suggestion = {
  id: string;
  questionId: string | null;
  proposedText: string;
  proposedTag: string | null;
  proposedScope: string | null;
  proposedSpeakerId: string | null;
  suggestedBy: string;
  suggestedByUserId: string | null;
  suggestedByUser: { id: string; name: string | null; email: string } | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  reviewerNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type Question = {
  id: string;
  scope: "GENERIC" | "SPEAKER";
  speakerId: string | null;
  speaker: Speaker | null;
  text: string;
  tag: string | null;
  order: number;
  suggestions: Suggestion[];
};

type Me = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isSuperAdmin: boolean;
};

type EventData = {
  id: string;
  slug: string;
  title: string;
  speakers: { id: string; name: string; role: string | null; company: string | null; photoUrl: string | null }[];
};

export function EventPrepTab({ event, me }: { event: EventData; me: Me }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Suggest dialog state — opened by Admin/Co-host to propose an edit.
  const [suggestFor, setSuggestFor] = useState<Question | "new-generic" | { newForSpeaker: Speaker } | null>(null);
  // Accept/reject dialog state — opened by Super Admin to review a suggestion.
  const [reviewing, setReviewing] = useState<Suggestion | null>(null);
  // Inline edit state — Super Admin only.
  const [editing, setEditing] = useState<Question | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.slug}/event-prep`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}) as Record<string, unknown>);
        throw new Error((j.error as string) || `Failed (${res.status})`);
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [event.slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group questions by scope + speaker for rendering.
  const genericQs = useMemo(
    () => questions.filter((q) => q.scope === "GENERIC").sort((a, b) => a.order - b.order),
    [questions]
  );
  const speakerQs = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of questions) {
      if (q.scope === "SPEAKER" && q.speakerId) {
        const arr = map.get(q.speakerId) ?? [];
        arr.push(q);
        map.set(q.speakerId, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.order - b.order);
    return map;
  }, [questions]);

  // Speakers that don't yet have any questions get an empty box.
  const speakersWithBoxes = useMemo(() => {
    return event.speakers.map((sp) => ({
      speaker: sp,
      questions: speakerQs.get(sp.id) ?? [],
    }));
  }, [event.speakers, speakerQs]);

  // All pending suggestions across the event (for the "Pending review" panel).
  const pendingSuggestions = useMemo(
    () => suggestions.filter((s) => s.status === "PENDING"),
    [suggestions]
  );

  const isSuperAdmin = me.isSuperAdmin;

  async function handleSuperAdminSave(qId: string, text: string, tag: string | null) {
    try {
      const res = await fetch(`/api/events/${event.slug}/event-prep`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "replaceOne", questionId: qId, text, tag }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Question updated");
      setEditing(null);
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleSuperAdminDelete(qId: string) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/events/${event.slug}/event-prep`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "delete", questionId: qId }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Question deleted");
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleSuperAdminCreate(scope: "GENERIC" | "SPEAKER", speakerId: string | null, text: string, tag: string | null) {
    try {
      const res = await fetch(`/api/events/${event.slug}/event-prep`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", scope, speakerId, text, tag, order: 0 }),
      });
      if (!res.ok) throw new Error("Failed to create");
      toast.success("Question added");
      setSuggestFor(null);
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  }

  async function handleSuggest(payload: {
    questionId?: string | null;
    proposedText: string;
    proposedScope?: string | null;
    proposedSpeakerId?: string | null;
    proposedTag?: string | null;
  }) {
    try {
      const res = await fetch(`/api/events/${event.slug}/event-prep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to submit suggestion");
      toast.success("Suggestion submitted — Super Admin will review");
      setSuggestFor(null);
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit suggestion");
    }
  }

  async function handleReviewSuggestion(suggestionId: string, action: "accept" | "reject", reviewerNote?: string) {
    try {
      const res = await fetch(`/api/events/${event.slug}/event-prep/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewerNote: reviewerNote || null }),
      });
      if (!res.ok) throw new Error("Failed to review");
      toast.success(action === "accept" ? "Suggestion accepted + applied" : "Suggestion rejected");
      setReviewing(null);
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to review");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-black/50">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading event prep…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700 font-semibold mb-2">Couldn't load event prep</p>
        <p className="text-red-600/80 text-sm mb-4">{error}</p>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const roleLabel = isSuperAdmin ? "Super Admin — can edit directly" : me.role + " — can suggest";
  const pendingCount = pendingSuggestions.length;
  const pendingLabel = pendingCount + " pending suggestion" + (pendingCount === 1 ? "" : "s");

  return (
    <div className="space-y-6">
      {/* Header / explanation strip */}
      <Card className="p-5 bg-gradient-to-r from-[#FF005A]/5 to-[#00E6FF]/5 border-black/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-[260px]">
            <h2 className="text-xl font-bold text-black flex items-center gap-2 mb-1">
              <Lightbulb className="h-5 w-5 text-[#FF005A]" />
              Event prep
            </h2>
            <p className="text-sm text-black/70 leading-relaxed">
              Curated questions for each speaker (left) — 5 personalized based on expertise —
              plus 10 generic questions for all (right). Topic:{" "}
              <a
                href="/resources/ai-human-flourishing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#004F98] font-semibold underline-offset-4 hover:underline"
              >
                AI &amp; Human Flourishing
              </a>{" "}
              (Identity &amp; Purpose, Education, Work, Wellbeing, Relationships, Creativity).
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={isSuperAdmin ? "bg-[#820A7D] text-white" : "bg-[#00E6FF]/20 text-[#007E72] border border-[#00E6FF]/40"}>
              {roleLabel}
            </Badge>
            <span className="text-[0.7rem] text-black/50">
              {pendingLabel}
            </span>
          </div>
        </div>
      </Card>

      {/* Two-column layout: speakers (left, wider) + generic (right, narrower) */}
      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* LEFT — speaker boxes */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-black/70">
              Speaker questions ({speakersWithBoxes.reduce((n, s) => n + s.questions.length, 0)})
            </h3>
          </div>
          {speakersWithBoxes.map(({ speaker, questions: qs }) => (
            <SpeakerBox
              key={speaker.id}
              speaker={speaker}
              questions={qs}
              isSuperAdmin={isSuperAdmin}
              onEdit={(q) => setEditing(q)}
              onDelete={handleSuperAdminDelete}
              onSuggest={(q) => setSuggestFor(q)}
              onAddNew={() => setSuggestFor({ newForSpeaker: speaker })}
            />
          ))}
          {speakersWithBoxes.length === 0 && (
            <p className="text-sm text-black/50 italic">No speakers on this event yet.</p>
          )}
        </div>

        {/* RIGHT — generic questions + pending suggestions */}
        <div className="space-y-4">
          <Card className="p-4 bg-white border-black/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-black/70">
                Generic questions ({genericQs.length})
              </h3>
              {isSuperAdmin ? (
                <Button size="sm" variant="outline" onClick={() => setSuggestFor("new-generic")}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setSuggestFor("new-generic")}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1" /> Suggest new
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {genericQs.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  index={i + 1}
                  question={q}
                  isSuperAdmin={isSuperAdmin}
                  onEdit={() => setEditing(q)}
                  onDelete={() => handleSuperAdminDelete(q.id)}
                  onSuggest={() => setSuggestFor(q)}
                />
              ))}
              {genericQs.length === 0 && (
                <p className="text-xs text-black/40 italic py-4 text-center">No generic questions yet.</p>
              )}
            </div>
          </Card>

          {/* Pending suggestions panel — visible to all admins/co-hosts/super admin */}
          {pendingSuggestions.length > 0 && (
            <Card className="p-4 bg-[#FFAC30]/5 border-[#FFAC30]/30">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#9A6800] mb-3 flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Pending suggestions ({pendingSuggestions.length})
              </h3>
              <div className="space-y-2">
                {pendingSuggestions.map((s) => (
                  <PendingSuggestionRow
                    key={s.id}
                    suggestion={s}
                    isSuperAdmin={isSuperAdmin}
                    onReview={() => setReviewing(s)}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Accepted/rejected history (collapsed) */}
          {suggestions.filter((s) => s.status !== "PENDING").length > 0 && (
            <ReviewedHistory suggestions={suggestions.filter((s) => s.status !== "PENDING")} />
          )}
        </div>
      </div>

      {/* Suggest dialog (Admin / Co-host) OR Add dialog (Super Admin) */}
      {suggestFor && (
        <SuggestDialog
          target={suggestFor}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSuggestFor(null)}
          onSubmit={(payload) => {
            if (isSuperAdmin && (suggestFor === "new-generic" || (typeof suggestFor === "object" && "newForSpeaker" in suggestFor))) {
              const scope = suggestFor === "new-generic" ? "GENERIC" : "SPEAKER";
              const speakerId = suggestFor === "new-generic" ? null : suggestFor.newForSpeaker.id;
              handleSuperAdminCreate(scope, speakerId, payload.proposedText, payload.proposedTag ?? null);
            } else {
              handleSuggest(payload);
            }
          }}
        />
      )}

      {/* Inline edit dialog (Super Admin only) */}
      {editing && isSuperAdmin && (
        <EditDialog
          question={editing}
          onClose={() => setEditing(null)}
          onSave={(text, tag) => handleSuperAdminSave(editing.id, text, tag)}
        />
      )}

      {/* Review suggestion dialog (Super Admin only) */}
      {reviewing && isSuperAdmin && (
        <ReviewDialog
          suggestion={reviewing}
          questions={questions}
          onClose={() => setReviewing(null)}
          onReview={(action, note) => handleReviewSuggestion(reviewing.id, action, note)}
        />
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function SpeakerBox({
  speaker,
  questions,
  isSuperAdmin,
  onEdit,
  onDelete,
  onSuggest,
  onAddNew,
}: {
  speaker: Speaker;
  questions: Question[];
  isSuperAdmin: boolean;
  onEdit: (q: Question) => void;
  onDelete: (qId: string) => void;
  onSuggest: (q: Question) => void;
  onAddNew: () => void;
}) {
  const roleCompany = [speaker.role, speaker.company].filter(Boolean).join(", ");
  const [expanded, setExpanded] = useState(true);
  return (
    <Card className="p-4 bg-white border-black/10">
      <div className="flex items-start gap-3 mb-3">
        {/* Speaker photo / avatar */}
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={speaker.photoUrl}
            alt={speaker.name}
            className="h-12 w-12 rounded-full object-cover border border-black/10"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-[#FF005A]/10 border border-[#FF005A]/30 flex items-center justify-center text-[#FF005A] font-bold">
            {speaker.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-black text-base leading-tight">{speaker.name}</h4>
          <p className="text-xs text-black/60 truncate">{roleCompany}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onAddNew}>
            {isSuperAdmin ? <><Plus className="h-3.5 w-3.5 mr-1" /> Add</> : <><MessageSquare className="h-3.5 w-3.5 mr-1" /> Suggest</>}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((e) => !e)}
            className="px-2"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2">
          {questions.length === 0 && (
            <p className="text-xs text-black/40 italic py-2 text-center">
              No personalized questions yet. {isSuperAdmin ? "Click Add to create one." : "Click Suggest to propose one."}
            </p>
          )}
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              index={i + 1}
              question={q}
              isSuperAdmin={isSuperAdmin}
              onEdit={() => onEdit(q)}
              onDelete={() => onDelete(q.id)}
              onSuggest={() => onSuggest(q)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function QuestionCard({
  index,
  question,
  isSuperAdmin,
  onEdit,
  onDelete,
  onSuggest,
}: {
  index: number;
  question: Question;
  isSuperAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSuggest: () => void;
}) {
  const pendingCount = question.suggestions.filter((s) => s.status === "PENDING").length;
  return (
    <div className="rounded-md border border-black/10 bg-white p-3 hover:border-black/20 transition">
      <div className="flex items-start gap-2">
        <span className="text-[0.7rem] font-bold text-black/40 mt-0.5 min-w-[1.5rem]">{index}.</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-black/85 leading-snug">{question.text}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {question.tag && (
              <Badge variant="secondary" className="text-[0.6rem] py-0 px-1.5 font-mono">
                {question.tag}
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge className="text-[0.6rem] py-0 px-1.5 bg-[#FFAC30]/20 text-[#9A6800] border border-[#FFAC30]/40">
                {pendingCount} pending suggestion{pendingCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          {/* Show pending suggestions inline (collapsible) */}
          {pendingCount > 0 && (
            <div className="mt-2 space-y-1.5">
              {question.suggestions.filter((s) => s.status === "PENDING").map((s) => (
                <div key={s.id} className="rounded bg-[#FFAC30]/8 border border-[#FFAC30]/20 p-2 text-xs">
                  <p className="text-black/80 italic">“{s.proposedText}”</p>
                  <p className="text-[0.6rem] text-black/50 mt-1">
                    — suggested by <span className="font-semibold">{s.suggestedBy}</span> · {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {isSuperAdmin ? (
            <>
              <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 px-2" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 px-2 text-red-500 hover:text-red-700" title="Delete">
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onSuggest} className="h-7 text-[0.65rem]" title="Suggest an edit">
              <MessageSquare className="h-3 w-3 mr-1" /> Suggest
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingSuggestionRow({
  suggestion,
  isSuperAdmin,
  onReview,
}: {
  suggestion: Suggestion;
  isSuperAdmin: boolean;
  onReview: () => void;
}) {
  const isForNew = !suggestion.questionId;
  return (
    <div className="rounded bg-white border border-[#FFAC30]/30 p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-semibold text-[#9A6800]">
          {isForNew ? "🆕 New question" : "✎ Edit"}
        </span>
        <span className="text-[0.6rem] text-black/50">{new Date(suggestion.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-black/80 italic">“{suggestion.proposedText}”</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[0.6rem] text-black/50">
          — <span className="font-semibold">{suggestion.suggestedBy}</span>
        </span>
        {isSuperAdmin && (
          <Button size="sm" onClick={onReview} className="h-6 text-[0.6rem] px-2">
            Review
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewedHistory({ suggestions }: { suggestions: Suggestion[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="p-3 bg-black/[0.02] border-black/10">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-xs font-semibold text-black/60 hover:text-black/80"
      >
        <span>Reviewed history ({suggestions.length})</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <div key={s.id} className="text-[0.7rem] p-2 rounded border border-black/10 bg-white">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge className={
                  s.status === "ACCEPTED"
                    ? "bg-green-100 text-green-800 text-[0.55rem] px-1.5 py-0"
                    : "bg-red-100 text-red-800 text-[0.55rem] px-1.5 py-0"
                }>
                  {s.status}
                </Badge>
                <span className="text-black/50">{new Date(s.reviewedAt || s.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-black/70 italic">“{s.proposedText}”</p>
              <p className="text-[0.6rem] text-black/50 mt-0.5">— {s.suggestedBy}</p>
              {s.reviewerNote && <p className="text-[0.6rem] text-black/60 mt-0.5">Review note: {s.reviewerNote}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Dialogs ----------

function SuggestDialog({
  target,
  isSuperAdmin,
  onClose,
  onSubmit,
}: {
  target: Question | "new-generic" | { newForSpeaker: Speaker };
  isSuperAdmin: boolean;
  onClose: () => void;
  onSubmit: (payload: { questionId?: string | null; proposedText: string; proposedScope?: string | null; proposedSpeakerId?: string | null; proposedTag?: string | null }) => void;
}) {
  const isEditExisting = typeof target === "object" && "id" in target;
  const isNewGeneric = target === "new-generic";
  const isNewForSpeaker = typeof target === "object" && "newForSpeaker" in target;
  const targetSpeaker = isNewForSpeaker ? target.newForSpeaker : (isEditExisting ? target.speaker : null);

  const [text, setText] = useState(isEditExisting ? (target as Question).text : "");
  const [tag, setTag] = useState(isEditExisting ? (target as Question).tag ?? "" : "");

  const speakerName = targetSpeaker?.name ?? "this speaker";
  let title: string;
  if (isSuperAdmin) {
    if (isEditExisting) title = "Edit question";
    else if (isNewGeneric) title = "Add generic question";
    else title = "Add question for " + speakerName;
  } else {
    if (isEditExisting) title = "Suggest an edit";
    else if (isNewGeneric) title = "Suggest a new generic question";
    else title = "Suggest a question for " + speakerName;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? (isEditExisting
                ? "Edit the question text and tag. Changes apply immediately."
                : "Add a new question. It will appear in the corresponding box.")
              : (isEditExisting
                ? "Propose a new wording for this question. The Super Admin will review and apply it."
                : "Propose a new question. The Super Admin will review and add it if accepted.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="q-text" className="text-xs font-semibold">Question text</Label>
            <Textarea
              id="q-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              autoFocus
              placeholder="e.g. How does AI change the way we make decisions under uncertainty?"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="q-tag" className="text-xs font-semibold">Tag (optional)</Label>
            <Input
              id="q-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. behavioral economics"
              className="mt-1"
            />
            <p className="text-[0.65rem] text-black/50 mt-1">A short label to help scan the list.</p>
          </div>
          {isEditExisting && (
            <div className="rounded bg-black/[0.03] border border-black/10 p-2 text-xs text-black/60">
              <span className="font-semibold">Current text:</span> {(target as Question).text}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!text.trim()}
            onClick={() =>
              onSubmit({
                questionId: isEditExisting ? (target as Question).id : null,
                proposedText: text.trim(),
                proposedTag: tag.trim() || null,
                proposedScope: isNewGeneric ? "GENERIC" : (isNewForSpeaker ? "SPEAKER" : null),
                proposedSpeakerId: targetSpeaker?.id ?? null,
              })
            }
          >
            {isSuperAdmin ? (isEditExisting ? "Save" : "Add") : "Submit suggestion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  question,
  onClose,
  onSave,
}: {
  question: Question;
  onClose: () => void;
  onSave: (text: string, tag: string | null) => void;
}) {
  const [text, setText] = useState(question.text);
  const [tag, setTag] = useState(question.tag ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit question</DialogTitle>
          <DialogDescription>Super Admin — changes apply immediately.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs font-semibold">Question text</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Tag</Label>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!text.trim()} onClick={() => onSave(text.trim(), tag.trim() || null)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  suggestion,
  questions,
  onClose,
  onReview,
}: {
  suggestion: Suggestion;
  questions: Question[];
  onClose: () => void;
  onReview: (action: "accept" | "reject", reviewerNote?: string) => void;
}) {
  const [note, setNote] = useState("");
  const targetQuestion = suggestion.questionId ? questions.find((q) => q.id === suggestion.questionId) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review suggestion</DialogTitle>
          <DialogDescription>
            {suggestion.questionId ? "Apply this edit to the existing question?" : "Promote this to a new question?"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded bg-black/[0.03] border border-black/10 p-3 text-xs space-y-2">
            <div>
              <span className="font-semibold text-black/70">Suggested by:</span>{" "}
              <span className="text-black/90">{suggestion.suggestedBy}</span>
              <span className="text-black/40"> · {new Date(suggestion.createdAt).toLocaleString()}</span>
            </div>
            {targetQuestion && (
              <div>
                <span className="font-semibold text-black/70">Current text:</span>
                <p className="text-black/80 italic mt-0.5">“{targetQuestion.text}”</p>
              </div>
            )}
            <div>
              <span className="font-semibold text-black/70">Proposed {suggestion.questionId ? "new text" : "question"}:</span>
              <p className="text-black/90 italic mt-0.5">“{suggestion.proposedText}”</p>
            </div>
            {suggestion.proposedTag && (
              <div>
                <span className="font-semibold text-black/70">Proposed tag:</span>{" "}
                <Badge variant="secondary" className="text-[0.6rem] font-mono ml-1">{suggestion.proposedTag}</Badge>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs font-semibold">Reviewer note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Applied as-is / tweaked wording / rejected because…"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => onReview("reject", note)}>
            <X className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button onClick={() => onReview("accept", note)}>
            <Check className="h-4 w-4 mr-1" /> Accept &amp; apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
