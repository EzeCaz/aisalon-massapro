"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Save,
  Loader2,
  Plus,
  X,
  Users,
  Sparkles,
  ClipboardPaste,
  Wand2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type Member = {
  id: string;
  email: string;
  name: string | null;
  photoUrl: string | null;
  image: string | null;
  company: string | null;
  role: string;
};

type Props = {
  members: Member[];
};

// Default datetime-local values: now + 7 days at 18:00, ends 22:00 same day.
function defaultStartEnd(): { startsAt: string; endsAt: string } {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(18, 0, 0, 0);
  const end = new Date(d);
  end.setHours(22, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocal = (x: Date) =>
    `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  return { startsAt: toLocal(d), endsAt: toLocal(end) };
}

function localInputToISO(local: string): string {
  return new Date(local).toISOString();
}

// Parses a free-form pasted event brief. The brief is expected to look
// like the typical Word / Google Docs event description with labeled
// fields, e.g.:
//
//   Event Title: AI CMO Blueprint
//   Subtitle: Marketing in the age of AI
//   Date: June 18, 2026
//   Time: 18:00 – 22:00
//   Venue: Google for Startups Campus TLV
//   Address: Yigal Alon 98, Tel Aviv
//   Map: https://maps.google.com/...
//   Description: ...
//   Takeaways: ...
//   Intended for: ...
//   RSVP URL: https://lu.ma/...
//
// The parser is forgiving — it accepts "Event Title", "Title", "Name"
// as labels for the title, etc. — and ignores blank / unknown lines.
function parseBrief(brief: string): Partial<{
  title: string;
  subtitle: string;
  chapter: string;
  venue: string;
  address: string;
  city: string;
  country: string;
  mapUrl: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  description: string;
  takeaways: string;
  intendedFor: string;
  rsvpUrl: string;
}> {
  const out: Record<string, string> = {};
  const lines = brief.split(/\r?\n/);

  // Field aliases — case-insensitive match against the part before the first colon
  const aliases: { keys: string[]; field: string }[] = [
    { keys: ["event title", "title", "name", "event name"], field: "title" },
    { keys: ["subtitle", "tagline"], field: "subtitle" },
    { keys: ["chapter"], field: "chapter" },
    { keys: ["venue", "location", "place"], field: "venue" },
    { keys: ["address", "street address"], field: "address" },
    { keys: ["city"], field: "city" },
    { keys: ["country"], field: "country" },
    { keys: ["map", "map url", "maps", "google maps", "maps link"], field: "mapUrl" },
    { keys: ["date", "event date", "day"], field: "_date" },
    { keys: ["time", "hours", "schedule"], field: "_time" },
    { keys: ["start", "starts at", "start time"], field: "_start" },
    { keys: ["end", "ends at", "end time"], field: "_end" },
    { keys: ["description", "about", "about event", "details"], field: "description" },
    { keys: ["takeaways", "what you'll take home", "take home", "what you will take home"], field: "takeaways" },
    { keys: ["intended for", "audience", "for", "target audience", "who should attend"], field: "intendedFor" },
    { keys: ["rsvp", "rsvp url", "registration", "registration url", "register"], field: "rsvpUrl" },
  ];

  let currentField: string | null = null;
  let currentBuf: string[] = [];

  function flush() {
    if (!currentField) return;
    const value = currentBuf.join("\n").trim();
    if (value) out[currentField] = value;
    currentField = null;
    currentBuf = [];
  }

  for (const line of lines) {
    // Check if this line starts a new labeled field
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < 40) {
      const label = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      const alias = aliases.find((a) => a.keys.includes(label));
      if (alias) {
        flush();
        currentField = alias.field;
        if (value) currentBuf.push(value);
        continue;
      }
    }
    // Continuation of current multi-line field
    if (currentField) {
      currentBuf.push(line);
    }
  }
  flush();

  // Build the final result
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(out)) {
    if (!k.startsWith("_")) result[k] = v;
  }

  // Parse date + time into startsAt / endsAt
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  // Try _start / _end first (most explicit)
  if (out._start) {
    const d = new Date(out._start);
    if (!isNaN(d.getTime())) startDate = d;
  }
  if (out._end) {
    const d = new Date(out._end);
    if (!isNaN(d.getTime())) endDate = d;
  }

  // If we have a date + time like "18:00 – 22:00", parse it
  if (!startDate && out._date) {
    // Try parsing the date string naturally
    const dateOnly = new Date(out._date);
    if (!isNaN(dateOnly.getTime())) {
      // If we have a time range like "18:00 – 22:00"
      if (out._time) {
        const timeMatch = out._time.match(/(\d{1,2}):(\d{2})\s*(?:–|-|to)?\s*(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          startDate = new Date(dateOnly);
          startDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
          endDate = new Date(dateOnly);
          endDate.setHours(parseInt(timeMatch[3], 10), parseInt(timeMatch[4], 10), 0, 0);
        } else {
          startDate = dateOnly;
        }
      } else {
        startDate = dateOnly;
      }
    }
  }

  if (startDate) result.startsAt = startDate.toISOString();
  if (endDate) result.endsAt = endDate.toISOString();

  return result;
}

export function EventCreator({ members }: Props) {
  const router = useRouter();
  const defaults = useMemo(defaultStartEnd, []);
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    chapter: "Tel Aviv",
    venue: "",
    address: "",
    city: "",
    country: "ISR",
    mapUrl: "",
    startsAt: defaults.startsAt,
    endsAt: defaults.endsAt,
    description: "",
    takeaways: "",
    intendedFor: "",
    rsvpUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [coHostIds, setCoHostIds] = useState<string[]>([]);
  const [addCoHostOpen, setAddCoHostOpen] = useState(false);

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyParsedBrief() {
    const parsed = parseBrief(pasteText);
    const applied: string[] = [];
    if (parsed.title) { setField("title", parsed.title); applied.push("title"); }
    if (parsed.subtitle) { setField("subtitle", parsed.subtitle); applied.push("subtitle"); }
    if (parsed.chapter) { setField("chapter", parsed.chapter); applied.push("chapter"); }
    if (parsed.venue) { setField("venue", parsed.venue); applied.push("venue"); }
    if (parsed.address) { setField("address", parsed.address); applied.push("address"); }
    if (parsed.city) { setField("city", parsed.city); applied.push("city"); }
    if (parsed.country) { setField("country", parsed.country); applied.push("country"); }
    if (parsed.mapUrl) { setField("mapUrl", parsed.mapUrl); applied.push("mapUrl"); }
    if (parsed.description) { setField("description", parsed.description); applied.push("description"); }
    if (parsed.takeaways) { setField("takeaways", parsed.takeaways); applied.push("takeaways"); }
    if (parsed.intendedFor) { setField("intendedFor", parsed.intendedFor); applied.push("intendedFor"); }
    if (parsed.rsvpUrl) { setField("rsvpUrl", parsed.rsvpUrl); applied.push("rsvpUrl"); }

    // Convert ISO back to local datetime-local format
    if (parsed.startsAt) {
      const d = new Date(parsed.startsAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setField("startsAt", local);
      applied.push("startsAt");
    }
    if (parsed.endsAt) {
      const d = new Date(parsed.endsAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setField("endsAt", local);
      applied.push("endsAt");
    }

    setPasteOpen(false);
    setPasteText("");

    if (applied.length === 0) {
      toast.warning("Couldn't parse any fields — make sure each line is 'Label: value'");
    } else {
      toast.success(`Imported ${applied.length} field${applied.length === 1 ? "" : "s"}: ${applied.join(", ")}`);
    }
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.startsAt || !form.endsAt) {
      toast.error("Start and end times are required");
      return;
    }
    const startsAt = localInputToISO(form.startsAt);
    const endsAt = localInputToISO(form.endsAt);
    if (new Date(endsAt) < new Date(startsAt)) {
      toast.error("End time must be after start time");
      return;
    }

    setSaving(true);
    const t = toast.loading("Creating event…");
    try {
      // Step 1: create the event
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          subtitle: form.subtitle,
          chapter: form.chapter,
          venue: form.venue,
          address: form.address,
          city: form.city,
          country: form.country,
          mapUrl: form.mapUrl,
          startsAt,
          endsAt,
          description: form.description,
          takeaways: form.takeaways,
          intendedFor: form.intendedFor,
          rsvpUrl: form.rsvpUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const eventId = data.event.id as string;
      const eventSlug = data.event.slug as string;

      // Step 2: add co-hosts (if any)
      if (coHostIds.length > 0) {
        await Promise.all(
          coHostIds.map((userId) =>
            fetch(`/api/admin/events/${eventId}/cohosts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            })
          )
        );
      }

      toast.success(`Event created — redirecting to ${eventSlug}…`, { id: t });
      router.push(`/events/${eventSlug}`);
    } catch (e) {
      toast.error((e as Error).message || "Create failed", { id: t });
    } finally {
      setSaving(false);
    }
  }

  const coHostMembers = members.filter((m) => coHostIds.includes(m.id));
  const availableMembers = members.filter((m) => !coHostIds.includes(m.id));

  return (
    <div className="space-y-6">
      {/* Paste structured brief dialog */}
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-[#FF005A]" />
              Paste structured event brief
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-black/80">
            Paste the entire event description copied from your Word doc,
            email, or shared file. The parser looks for labeled lines like
            <code className="mx-1 px-1 py-0.5 bg-black/5 rounded">Title:</code>
            <code className="mx-1 px-1 py-0.5 bg-black/5 rounded">Venue:</code>
            <code className="mx-1 px-1 py-0.5 bg-black/5 rounded">Date:</code>
            <code className="mx-1 px-1 py-0.5 bg-black/5 rounded">Description:</code>
            etc. Multi-line values (like a long description) are captured
            until the next labeled line. Unknown lines are ignored.
          </p>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={12}
            placeholder={`Event Title: AI CMO Blueprint
Subtitle: Marketing in the age of AI
Date: June 18, 2026
Time: 18:00 – 22:00
Venue: Google for Startups Campus TLV
Address: Yigal Alon 98, Tel Aviv
Map: https://maps.google.com/...
Description: A hands-on workshop for CMOs...
Takeaways:
- A working AI marketing stack
- A playbook for AI-driven content
Intended for: CMOs, VPs of Marketing, marketing leads
RSVP URL: https://lu.ma/...`}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={applyParsedBrief}
              disabled={!pasteText.trim()}
              className="bg-[#FF005A] hover:bg-[#FF005A]/90"
            >
              <Sparkles className="h-4 w-4 mr-1.5" /> Parse & fill form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Co-hosts panel */}
      <Card className="p-5 border border-black/10 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#FF005A]" />
            <h3 className="font-bold text-black text-sm">Co-hosts (collaborators)</h3>
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-black/80">
              {coHostIds.length} selected
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddCoHostOpen(true)}
            className="border-[#FF005A] text-[#FF005A] hover:bg-[#FF005A]/5"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add co-host
          </Button>
        </div>
        <p className="text-xs text-black/80 mb-3">
          Co-hosts are members who can edit this event's details, manage the
          agenda, upload and star photos, and add other co-hosts. They'll see
          an "Edit Event" tab when they open the event page after creation.
        </p>
        {coHostMembers.length === 0 ? (
          <p className="text-xs text-black/80 italic">
            No co-hosts selected. You can add them now or after creation.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {coHostMembers.map((m) => (
              <div
                key={m.id}
                className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white pl-1.5 pr-2 py-1"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={m.photoUrl || m.image || undefined} alt={m.name || m.email} />
                  <AvatarFallback className="bg-black text-white text-[0.6rem]">
                    {(m.name || m.email).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-semibold text-black">
                  {m.name || m.email.split("@")[0]}
                </span>
                <button
                  onClick={() => setCoHostIds((prev) => prev.filter((id) => id !== m.id))}
                  className="ml-1 rounded-full hover:bg-black/10 p-0.5 text-black/80 hover:text-[#FF005A]"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Dialog open={addCoHostOpen} onOpenChange={setAddCoHostOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pick co-hosts</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-black/80">
              Click any member to add them as a co-host. They'll be notified
              the next time they sign in (and will see the "Edit Event" tab).
            </p>
            <div className="max-h-80 overflow-y-auto ais-scroll space-y-1">
              {availableMembers.length === 0 ? (
                <p className="text-sm text-black/50 text-center py-4">
                  No more members to add.
                </p>
              ) : (
                availableMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setCoHostIds((prev) => [...prev, m.id]);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-black/5 text-left transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.photoUrl || m.image || undefined} alt={m.name || m.email} />
                      <AvatarFallback className="bg-black text-white text-[0.65rem]">
                        {(m.name || m.email).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-black">
                        {m.name || m.email.split("@")[0]}
                      </div>
                      <div className="text-xs text-black/50 truncate">{m.email}</div>
                    </div>
                    <Plus className="h-4 w-4 text-[#FF005A]" />
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>

      {/* The form itself */}
      <Card className="p-6 border border-black/10 bg-white space-y-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-bold text-black text-sm">Event details</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPasteOpen(true)}
            className="border-[#FF005A] text-[#FF005A] hover:bg-[#FF005A]/5"
          >
            <ClipboardPaste className="h-4 w-4 mr-1.5" /> Paste from brief
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Title" required>
            <Input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="AI CMO Blueprint"
            />
          </Field>
          <Field label="Subtitle">
            <Input
              value={form.subtitle}
              onChange={(e) => setField("subtitle", e.target.value)}
              placeholder="A short tagline"
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Chapter">
            <Input
              value={form.chapter}
              onChange={(e) => setField("chapter", e.target.value)}
              placeholder="Tel Aviv"
            />
          </Field>
          <Field label="Country">
            <Input
              value={form.country}
              onChange={(e) => setField("country", e.target.value)}
              placeholder="ISR"
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => setField("city", e.target.value)}
              placeholder="Tel Aviv"
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Venue">
            <Input
              value={form.venue}
              onChange={(e) => setField("venue", e.target.value)}
              placeholder="Google for Startups Campus TLV"
            />
          </Field>
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              placeholder="Yigal Alon 98, Tel Aviv"
            />
          </Field>
        </div>

        <Field label="Map URL">
          <Input
            value={form.mapUrl}
            onChange={(e) => setField("mapUrl", e.target.value)}
            placeholder="https://maps.google.com/..."
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Starts at" required>
            <Input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setField("startsAt", e.target.value)}
            />
          </Field>
          <Field label="Ends at" required>
            <Input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setField("endsAt", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Description / About">
          <Textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={4}
            placeholder="Long-form description shown on the Overview tab"
          />
        </Field>

        <Field label="Takeaways (what you'll take home)">
          <Textarea
            value={form.takeaways}
            onChange={(e) => setField("takeaways", e.target.value)}
            rows={3}
            placeholder="One takeaway per line — rendered as a bulleted list"
          />
        </Field>

        <Field label="Intended for">
          <Textarea
            value={form.intendedFor}
            onChange={(e) => setField("intendedFor", e.target.value)}
            rows={2}
            placeholder="This event is built for: CMOs, marketing leaders, AI builders..."
          />
        </Field>

        <Field label="External RSVP URL (optional)">
          <Input
            value={form.rsvpUrl}
            onChange={(e) => setField("rsvpUrl", e.target.value)}
            placeholder="https://lu.ma/..."
          />
        </Field>

        <div className="flex justify-end pt-2 border-t border-black/10 gap-2">
          <Button variant="outline" onClick={() => router.push("/admin")}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving}
            className="bg-[#FF005A] hover:bg-[#FF005A]/90"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" /> Create event
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-black/70 uppercase tracking-wider">
        {label}
        {required && <span className="text-[#FF005A] ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
