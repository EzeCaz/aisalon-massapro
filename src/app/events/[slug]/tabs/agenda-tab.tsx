"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Coffee,
  Mic,
  Network,
  Rocket,
  Hand,
  ImageIcon,
  FileText,
  Mail,
  Send,
  Loader2,
  ExternalLink,
  Link2,
} from "lucide-react";

type SlimImage = {
  id: string;
  fileUrl: string;
  fileName: string;
  caption: string | null;
};

type SlimPresentation = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  title: string | null;
};

type SlimUser = {
  id: string;
  name: string | null;
  email: string;
  photoUrl: string | null;
  image: string | null;
  company: string | null;
  bio: string | null;
  tags: { id: string; label: string; color: string | null }[];
};

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl: string | null;
  order: number;
  contactEmail?: string | null;
  user?: SlimUser | null;
  images?: SlimImage[];
  presentations?: SlimPresentation[];
};

type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  description: string | null;
  type: string;
  speaker: Speaker | null;
  presentations?: SlimPresentation[];
};

type EventData = {
  id: string;
  speakers: Speaker[];
  agenda: AgendaItem[];
};

type Me = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

const typeIcon: Record<string, React.ReactNode> = {
  WELCOME: <Hand className="h-4 w-4" />,
  TALK: <Mic className="h-4 w-4" />,
  BREAK: <Coffee className="h-4 w-4" />,
  NETWORKING: <Network className="h-4 w-4" />,
  FAST_PITCH: <Rocket className="h-4 w-4" />,
};

const typeColor: Record<string, string> = {
  WELCOME: "bg-[#00E6FF]/10 text-[#007E72] border-[#00E6FF]/30",
  TALK: "bg-[#FF005A]/10 text-[#FF005A] border-[#FF005A]/30",
  BREAK: "bg-black/5 text-black/60 border-black/10",
  NETWORKING: "bg-[#820A7D]/10 text-[#820A7D] border-[#820A7D]/30",
  FAST_PITCH: "bg-[#FFAC30]/10 text-[#FFAC30] border-[#FFAC30]/30",
};

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Extract the first http(s) URL from a block of text (e.g. an agenda
 * item description). Returns null when none is found.
 */
function extractFirstUrl(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0] : null;
}

/**
 * Decide whether a given agenda item should show the "Pictures",
 * "Presentation", "URL", and "Contact" thumbnails row.
 *
 * Rules (per the user's request):
 *   - Show pictures thumbnail if the speaker has any linked images.
 *   - Show presentation thumbnail if EITHER the agenda item has a
 *     linked presentation OR the speaker has a linked presentation.
 *   - Show URL thumbnail if the description contains an http(s) URL.
 *   - Always show the "Contact speaker" button if there is a speaker
 *     (the user said "when a specific session / speaker box has
 *     either a url, attachment or images attached to the speaker" —
 *     and the contact button is a per-speaker feature, so we show it
 *     whenever there is a speaker).
 *
 * If none of the above are true, the agenda box stays compact (no
 * thumbnails row).
 */
function agendaItemHasAssets(item: AgendaItem): {
  hasPictures: boolean;
  hasPresentation: boolean;
  hasUrl: boolean;
  hasContact: boolean;
  firstImage: SlimImage | null;
  firstPresentation: SlimPresentation | null;
  sessionUrl: string | null;
} {
  const speakerImages = item.speaker?.images ?? [];
  const itemPresentations = item.presentations ?? [];
  const speakerPresentations = item.speaker?.presentations ?? [];

  const firstImage = speakerImages[0] ?? null;
  const firstPresentation =
    itemPresentations[0] ?? speakerPresentations[0] ?? null;
  const sessionUrl = extractFirstUrl(item.description);

  return {
    hasPictures: speakerImages.length > 0,
    hasPresentation: firstPresentation !== null,
    hasUrl: sessionUrl !== null,
    hasContact: !!item.speaker,
    firstImage,
    firstPresentation,
    sessionUrl,
  };
}

// ============================================================================
// Contact Speaker Dialog
// ----------------------------------------------------------------------------
// Two modes:
//   1. Speaker is linked to a platform User (speaker.user is set) — use
//      the proper ConversationMessage system (two-way in-app chat). Both
//      directions are rendered as chat bubbles (mine right/PINK, partner's
//      left/white). Messages auto-mark-as-read on load.
//   2. Speaker is NOT linked — fall back to the legacy SpeakerMessage
//      flow (one-way email relay via admin). Only this user's outgoing
//      messages are shown.
// ============================================================================

type ContactMessage = {
  id: string;
  fromName: string;
  fromEmail: string;
  body: string;
  createdAt: string;
};

type DmMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function ContactSpeakerDialog({
  speaker,
  me,
  open,
  onOpenChange,
}: {
  speaker: Speaker;
  me: Me;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const linkedUserId = speaker.user?.id ?? null;
  const isLinked = !!linkedUserId;

  // Legacy SpeakerMessage state
  const [legacyMessages, setLegacyMessages] = useState<ContactMessage[]>([]);
  // ConversationMessage state (linked-user mode)
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");

  // ------- Load thread -------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isLinked && linkedUserId) {
        // Use the new ConversationMessage API
        const res = await fetch(`/api/messages/${linkedUserId}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setDmMessages(data.messages || []);
      } else {
        // Fall back to the legacy SpeakerMessage API
        const res = await fetch(`/api/speakers/${speaker.id}/messages`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setLegacyMessages(data.messages || []);
      }
    } catch {
      // silent — empty thread is fine
    } finally {
      setLoading(false);
    }
  }, [isLinked, linkedUserId, speaker.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Poll for new incoming DMs every 5s while the dialog is open (so live
  // replies from the speaker appear without re-opening the dialog).
  useEffect(() => {
    if (!open || !isLinked || !linkedUserId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/messages/${linkedUserId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDmMessages(data.messages || []);
      } catch {
        /* ignore */
      }
    };
    const t = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, isLinked, linkedUserId]);

  // ------- Send message -------
  async function send() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    const t = toast.loading("Sending message…");
    try {
      if (isLinked && linkedUserId) {
        // Optimistic append
        const tempId = `tmp-${Date.now()}`;
        const optimistic: DmMessage = {
          id: tempId,
          senderId: me.id,
          recipientId: linkedUserId,
          body: text,
          readAt: null,
          createdAt: new Date().toISOString(),
        };
        setDmMessages((prev) => [...prev, optimistic]);
        setDraft("");

        const res = await fetch(`/api/messages/${linkedUserId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const err = await res.json();
            if (err?.error) msg = err.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const data = await res.json();
        // Replace the optimistic message with the real one
        setDmMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.message : m))
        );
        toast.success("Message sent — you'll see their reply here.", {
          id: t,
          duration: 4000,
        });
      } else {
        // Legacy SpeakerMessage flow (one-way via admin email relay)
        const res = await fetch(`/api/speakers/${speaker.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Send failed");
        }
        const data = await res.json();
        setLegacyMessages((prev) => [...prev, data.message]);
        setDraft("");
        toast.success(
          "Message sent — the speaker will get back to you via email.",
          { id: t, duration: 5000 }
        );
      }
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setSending(false);
    }
  }

  const speakerPhoto = speaker.photoUrl || speaker.user?.photoUrl || speaker.user?.image || undefined;
  const speakerDisplayName = speaker.user?.name || speaker.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#FF005A]" />
            Contact {speakerDisplayName}
            {isLinked && (
              <span
                className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#007E72]/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-[#007E72]"
                title="This speaker has a linked platform account — you can chat in real time."
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#007E72]" /> Live chat
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Speaker mini-card */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/5">
          <Avatar className="h-10 w-10 border border-black/10">
            <AvatarImage src={speakerPhoto} alt={speakerDisplayName} />
            <AvatarFallback className="bg-black text-white text-xs font-bold">
              {speakerDisplayName
                .split(" ")
                .slice(0, 2)
                .map((p) => p[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-black truncate">
              {speakerDisplayName}
            </div>
            {speaker.role && (
              <div className="text-xs text-black/60 truncate">{speaker.role}</div>
            )}
          </div>
        </div>

        {/* Mode notice */}
        {!isLinked && (
          <div className="text-[0.65rem] text-black/50 italic bg-black/[0.03] rounded px-2 py-1.5">
            This speaker isn&apos;t linked to a platform account yet — your
            message will be emailed to them via the admin. They&apos;ll reply
            to you directly at <strong>{me.email}</strong>.
          </div>
        )}

        {/* Message thread */}
        <div className="max-h-64 overflow-y-auto ais-scroll space-y-2">
          {loading ? (
            <div className="text-center py-6 text-xs text-black/40">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
              Loading conversation…
            </div>
          ) : isLinked ? (
            // ---- Two-way chat bubbles (ConversationMessage mode) ----
            dmMessages.length === 0 ? (
              <div className="text-center py-6 text-xs text-black/40">
                No messages yet. Start the conversation below.
              </div>
            ) : (
              dmMessages.map((m) => {
                const mine = m.senderId === me.id;
                return (
                  <div
                    key={m.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                        mine
                          ? "bg-[#FF005A] text-white rounded-br-sm"
                          : "bg-white border border-black/10 text-black rounded-bl-sm"
                      }`}
                    >
                      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {m.body}
                      </div>
                      <div
                        className={`mt-1 text-[0.6rem] text-right ${
                          mine ? "text-white/70" : "text-black/40"
                        }`}
                      >
                        {fmtDateTime(m.createdAt)}
                        {mine && (
                          <span className="ml-1">
                            {m.readAt ? "· Read" : "· Sent"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            // ---- One-way legacy bubbles (SpeakerMessage mode) ----
            legacyMessages.length === 0 ? (
              <div className="text-center py-6 text-xs text-black/40">
                No messages yet. Start the conversation below.
              </div>
            ) : (
              legacyMessages.map((m) => (
                <div key={m.id} className="flex flex-col items-end">
                  <div className="bg-[#FF005A] text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">
                    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {m.body}
                    </div>
                  </div>
                  <div className="text-[0.6rem] text-black/40 mt-0.5 pr-1">
                    {fmtDateTime(m.createdAt)}
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Composer */}
        <div className="space-y-2">
          <Textarea
            placeholder={`Hi ${speakerDisplayName.split(" ")[0]}, I really enjoyed your talk and wanted to follow up on…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="resize-none text-sm"
            disabled={sending}
            maxLength={4000}
          />
          <div className="flex items-center justify-between">
            <div className="text-[0.65rem] text-black/40">
              {isLinked ? (
                <>
                  From: <strong>{me.name || me.email}</strong> · replies will
                  appear here in real time.
                </>
              ) : (
                <>
                  From: <strong>{me.name || me.email}</strong> · the speaker
                  will reply to your email.
                </>
              )}
            </div>
            <Button
              onClick={send}
              disabled={!draft.trim() || sending}
              size="sm"
              className="bg-black hover:bg-black/90"
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Send
                </>
              )}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Pictures preview dialog (quick strip of the speaker's images)
// ============================================================================

function PicturesPreviewDialog({
  speaker,
  open,
  onOpenChange,
}: {
  speaker: Speaker;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const images = speaker.images ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[#FF005A]" />
            Pictures of {speaker.name}&apos;s session
          </DialogTitle>
        </DialogHeader>
        {images.length === 0 ? (
          <div className="text-center py-8 text-sm text-black/50">
            No pictures linked to this speaker yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto ais-scroll">
            {images.map((img) => (
              <a
                key={img.id}
                href={img.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square overflow-hidden rounded-md border border-black/10 hover:border-[#FF005A]/40 transition-colors"
              >
                <img
                  src={img.fileUrl}
                  alt={img.caption || img.fileName}
                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                />
              </a>
            ))}
          </div>
        )}
        <div className="text-xs text-black/50 text-center">
          Want to see all event photos? Switch to the <strong>Photos</strong> tab.
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main AgendaTab component
// ============================================================================

export function AgendaTab({ event, me }: { event: EventData; me: Me }) {
  // Track which speaker the user is currently contacting (for the dialog)
  const [contactSpeaker, setContactSpeaker] = useState<Speaker | null>(null);
  const [picturesSpeaker, setPicturesSpeaker] = useState<Speaker | null>(null);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      {/* Agenda timeline */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF005A] mb-4">
          Event agenda
        </h2>
        <div className="space-y-2">
          {event.agenda.map((item) => {
            const start = new Date(item.startsAt);
            const end = item.endsAt ? new Date(item.endsAt) : null;
            const assets = agendaItemHasAssets(item);
            const showThumbnails =
              assets.hasPictures ||
              assets.hasPresentation ||
              assets.hasUrl ||
              assets.hasContact;

            return (
              <Card
                key={item.id}
                className={`p-4 border ${typeColor[item.type] || "bg-white border-black/10"}`}
              >
                {/* Top row: time · icon · title · description · speaker (all centered) */}
                <div className="flex flex-col items-center text-center gap-1.5">
                  <div className="flex items-center gap-3 text-black/60">
                    <span className="font-mono text-sm font-bold text-black">
                      {fmtTime(item.startsAt)}
                    </span>
                    {end && (
                      <span className="font-mono text-[0.65rem] text-black/40">
                        → {fmtTime(item.endsAt!)}
                      </span>
                    )}
                  </div>

                  <div className={typeColor[item.type] ? "" : "text-black/40"}>
                    {typeIcon[item.type]}
                  </div>

                  <div className="font-semibold text-sm text-black leading-snug">
                    {item.title}
                  </div>

                  {item.description && (
                    <p className="text-xs text-black/60 leading-relaxed max-w-prose">
                      {item.description}
                    </p>
                  )}

                  {item.speaker && (
                    <div className="text-xs text-black/60">
                      {item.speaker.name}
                      {item.speaker.role && <span> · {item.speaker.role}</span>}
                    </div>
                  )}
                </div>

                {/* Thumbnails row (only if speaker has assets) */}
                {showThumbnails && (
                  <div className="mt-3 pt-3 border-t border-black/10 flex flex-wrap items-stretch justify-center gap-2">
                    {/* Pictures of the session */}
                    {assets.hasPictures && assets.firstImage && item.speaker && (
                      <button
                        onClick={() => setPicturesSpeaker(item.speaker!)}
                        className="group flex flex-col items-center gap-1 w-24 rounded-md border border-black/10 hover:border-[#FF005A]/40 bg-white overflow-hidden transition-colors"
                        title={`Pictures of ${item.speaker.name}'s session`}
                      >
                        <div className="relative w-full h-16 bg-black/5 overflow-hidden">
                          <img
                            src={assets.firstImage.fileUrl}
                            alt={assets.firstImage.caption || assets.firstImage.fileName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                          <div className="absolute top-0.5 right-0.5 bg-black/70 text-white text-[0.55rem] font-bold px-1 rounded">
                            {(item.speaker.images ?? []).length}
                          </div>
                        </div>
                        <div className="text-[0.6rem] font-semibold text-black/70 group-hover:text-[#FF005A] flex items-center gap-1 pb-1">
                          <ImageIcon className="h-2.5 w-2.5" />
                          Pictures
                        </div>
                      </button>
                    )}

                    {/* Session presentation */}
                    {assets.hasPresentation && assets.firstPresentation && (
                      <a
                        href={assets.firstPresentation.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col items-center gap-1 w-24 rounded-md border border-black/10 hover:border-[#004F98]/40 bg-white overflow-hidden transition-colors"
                        title={`Open ${assets.firstPresentation.fileName}`}
                      >
                        <div className="w-full h-16 bg-[#004F98]/5 flex items-center justify-center">
                          <FileText className="h-7 w-7 text-[#004F98]" />
                        </div>
                        <div className="text-[0.6rem] font-semibold text-black/70 group-hover:text-[#004F98] flex items-center gap-1 pb-1 truncate w-full justify-center px-1">
                          <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                          <span className="truncate">
                            {assets.firstPresentation.title || assets.firstPresentation.fileName}
                          </span>
                        </div>
                      </a>
                    )}

                    {/* Session URL — appears next to the Contact thumbnail
                        when the description contains an http(s) link. */}
                    {assets.hasUrl && assets.sessionUrl && (
                      <a
                        href={assets.sessionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col items-center gap-1 w-24 rounded-md border border-black/10 hover:border-[#007E72]/40 bg-white overflow-hidden transition-colors"
                        title={`Open session link: ${assets.sessionUrl}`}
                      >
                        <div className="w-full h-16 bg-[#007E72]/5 flex items-center justify-center">
                          <Link2 className="h-7 w-7 text-[#007E72]" />
                        </div>
                        <div className="text-[0.6rem] font-semibold text-black/70 group-hover:text-[#007E72] flex items-center gap-1 pb-1">
                          <Link2 className="h-2.5 w-2.5" />
                          Session URL
                        </div>
                      </a>
                    )}

                    {/* Contact the speaker */}
                    {assets.hasContact && item.speaker && (
                      <button
                        onClick={() => setContactSpeaker(item.speaker!)}
                        className="group flex flex-col items-center gap-1 w-24 rounded-md border border-black/10 hover:border-[#FF005A]/40 bg-white overflow-hidden transition-colors"
                        title={`Send a message to ${item.speaker.name}`}
                      >
                        <div className="w-full h-16 bg-[#FF005A]/5 flex items-center justify-center">
                          <Mail className="h-7 w-7 text-[#FF005A]" />
                        </div>
                        <div className="text-[0.6rem] font-semibold text-black/70 group-hover:text-[#FF005A] flex items-center gap-1 pb-1">
                          <Mail className="h-2.5 w-2.5" />
                          Contact
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Speakers list (right column — unchanged) */}
      <aside>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF005A] mb-4">
          The lineup
        </h2>
        <div className="space-y-3">
          {event.speakers
            .filter((s) => s.name !== "Ezequiel Sznaider")
            .map((s) => (
              <Card key={s.id} className="p-4 bg-white border border-black/10">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 border border-black/10">
                    <AvatarImage src={s.photoUrl || undefined} alt={s.name} />
                    <AvatarFallback className="bg-black text-white text-xs font-bold">
                      {s.name
                        .split(" ")
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-black">{s.name}</div>
                    {s.role && <div className="text-xs text-black/60">{s.role}</div>}
                    {s.topic && (
                      <div className="mt-2 text-xs font-medium text-[#007E72] italic leading-snug">
                        &ldquo;{s.topic}&rdquo;
                      </div>
                    )}
                    {s.bio && (
                      <p className="mt-2 text-xs text-black/70 leading-relaxed line-clamp-4">
                        {s.bio}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setContactSpeaker(s)}
                    className="h-7 text-[0.7rem] border-[#FF005A]/30 text-[#FF005A] hover:bg-[#FF005A]/5"
                  >
                    <Mail className="h-3 w-3 mr-1" /> Contact
                  </Button>
                  {(s.images?.length ?? 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPicturesSpeaker(s)}
                      className="h-7 text-[0.7rem] border-black/20 text-black/70 hover:bg-black/5"
                    >
                      <ImageIcon className="h-3 w-3 mr-1" /> {s.images!.length} photo
                      {s.images!.length === 1 ? "" : "s"}
                    </Button>
                  )}
                  {(s.presentations?.length ?? 0) > 0 && (
                    <a
                      href={s.presentations![0].fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[0.7rem] border-[#004F98]/30 text-[#004F98] hover:bg-[#004F98]/5"
                      >
                        <FileText className="h-3 w-3 mr-1" /> Deck{" "}
                        <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                      </Button>
                    </a>
                  )}
                </div>
              </Card>
            ))}
        </div>
      </aside>

      {/* Dialogs */}
      {contactSpeaker && (
        <ContactSpeakerDialog
          speaker={contactSpeaker}
          me={me}
          open={true}
          onOpenChange={(v) => {
            if (!v) setContactSpeaker(null);
          }}
        />
      )}
      {picturesSpeaker && (
        <PicturesPreviewDialog
          speaker={picturesSpeaker}
          open={true}
          onOpenChange={(v) => {
            if (!v) setPicturesSpeaker(null);
          }}
        />
      )}
    </div>
  );
}
