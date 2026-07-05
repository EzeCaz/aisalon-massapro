"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Upload,
  Loader2,
  Users,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  ChevronDown,
} from "lucide-react";
import { formatDateTlv } from "@/lib/datetime-tlv";

type EventRow = {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  _count: { rsvps: number };
};

type Rsvp = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  createdAt: string;
  userId: string | null;
};

type Props = {
  events: EventRow[];
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  GOING: { label: "Going", color: "border-[#00E6FF] text-[#007E72] bg-[#00E6FF]/10", icon: CheckCircle2 },
  MAYBE: { label: "Maybe", color: "border-[#FFAC30] text-[#92600a] bg-[#FFAC30]/10", icon: Clock },
  NOT_GOING: { label: "Not going", color: "border-[#FF005A] text-[#FF005A] bg-[#FF005A]/10", icon: XCircle },
  WAITLIST: { label: "Waitlist", color: "border-black/20 text-black/50 bg-black/5", icon: Clock },
};

export function RegistrantsManager({ events }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Fetch RSVPs when the selected event changes
  useEffect(() => {
    if (!selectedEventId) return;
    setLoading(true);
    setRsvps([]);
    fetch(`/api/admin/rsvp?eventId=${selectedEventId}`)
      .then((r) => r.json())
      .then((data) => setRsvps(data.rsvps || []))
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load registrants");
      })
      .finally(() => setLoading(false));
  }, [selectedEventId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rsvps.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q)
      );
    });
  }, [rsvps, search, statusFilter]);

  const stats = useMemo(() => {
    const out: Record<string, number> = { GOING: 0, MAYBE: 0, NOT_GOING: 0, WAITLIST: 0 };
    for (const r of rsvps) {
      out[r.status] = (out[r.status] || 0) + 1;
    }
    return out;
  }, [rsvps]);

  async function handleUpload(lines: string[], defaultStatus: string) {
    // Parse the lines — each can be just an email, or "email,name"
    const entries: { email: string; name?: string }[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // Skip header lines
      if (/^(email|name|e-mail|full name)/i.test(line)) continue;
      // Split on comma OR tab
      const parts = line.split(/[,\t]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      const email = parts[0];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      entries.push({ email: email.toLowerCase(), name: parts[1] });
    }
    if (entries.length === 0) {
      toast.error("No valid emails found in the pasted text");
      return;
    }

    setUploadOpen(false);
    const t = toast.loading(`Adding ${entries.length} registrants…`);
    try {
      let success = 0;
      let failed = 0;
      // Send in batches of 20 to avoid hitting serverless limits
      for (let i = 0; i < entries.length; i += 20) {
        const batch = entries.slice(i, i + 20);
        await Promise.all(
          batch.map(async (entry) => {
            try {
              const res = await fetch("/api/admin/rsvp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  eventId: selectedEventId,
                  email: entry.email,
                  name: entry.name,
                  status: defaultStatus,
                }),
              });
              if (res.ok) success++;
              else failed++;
            } catch {
              failed++;
            }
          })
        );
      }
      toast.success(
        `Added ${success} registrant${success === 1 ? "" : "s"}${
          failed > 0 ? ` (${failed} failed)` : ""
        }`,
        { id: t }
      );
      // Refresh the list
      setLoading(true);
      const r = await fetch(`/api/admin/rsvp?eventId=${selectedEventId}`);
      const data = await r.json();
      setRsvps(data.rsvps || []);
    } catch (e) {
      toast.error("Upload failed", { id: t });
    } finally {
      setLoading(false);
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="space-y-4">
      {/* Event selector + summary stats */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="text-sm border border-black/15 rounded-md px-3 py-2 bg-white font-semibold"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} — {e._count.rsvps} RSVPs
            </option>
          ))}
        </select>
        {selectedEvent && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats).map(([status, count]) => {
              const meta = STATUS_LABELS[status] || { label: status, color: "border-black/15 text-black/50", icon: Users };
              const Icon = meta.icon;
              return (
                <Badge key={status} variant="outline" className={`text-[0.6rem] uppercase tracking-wider ${meta.color}`}>
                  <Icon className="h-3 w-3 mr-1" />
                  {meta.label}: {count}
                </Badge>
              );
            })}
          </div>
        )}
        <div className="flex-1" />
        <Button onClick={() => setUploadOpen(true)} className="bg-[#FF005A] hover:bg-[#FF005A]/90" disabled={!selectedEventId}>
          <Upload className="h-4 w-4 mr-1.5" /> Upload registrants
        </Button>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black/80" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            disabled={loading}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-black/15 rounded-md px-2 py-2 bg-white"
          disabled={loading}
        >
          <option value="">All statuses</option>
          <option value="GOING">Going</option>
          <option value="MAYBE">Maybe</option>
          <option value="NOT_GOING">Not going</option>
          <option value="WAITLIST">Waitlist</option>
        </select>
        <Badge variant="secondary" className="bg-black/5 text-black/80">
          {filtered.length} of {rsvps.length}
        </Badge>
      </div>

      {/* List */}
      {loading ? (
        <Card className="p-8 text-center border border-black/10">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-black/80" />
          <p className="text-sm text-black/80 mt-2">Loading registrants…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center border border-black/10">
          <Users className="h-10 w-10 mx-auto text-black/30 mb-3" />
          <p className="text-sm text-black/80">
            {rsvps.length === 0
              ? "No registrants yet for this event. Use the Upload button to add from a CSV / pasted list."
              : "No registrants match your filters."}
          </p>
        </Card>
      ) : (
        <Card className="border border-black/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/5 border-b border-black/10">
              <tr className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-black/50">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Status</th>
                <th className="p-3">Source</th>
                <th className="p-3">Linked user</th>
                <th className="p-3">RSVP date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = STATUS_LABELS[r.status] || { label: r.status, color: "border-black/15 text-black/50", icon: Users };
                const Icon = meta.icon;
                return (
                  <tr key={r.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="p-3 font-semibold text-black">{r.name || <span className="text-black/80 italic">—</span>}</td>
                    <td className="p-3 text-black/70">{r.email}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-[0.55rem] uppercase tracking-wider ${meta.color}`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="p-3 text-[0.65rem] text-black/50 uppercase">{r.source}</td>
                    <td className="p-3">
                      {r.userId ? (
                        <Badge variant="outline" className="text-[0.55rem] uppercase tracking-wider border-[#00E6FF] text-[#007E72] bg-[#00E6FF]/10">
                          Linked
                        </Badge>
                      ) : (
                        <span className="text-[0.65rem] text-black/80 italic">external</span>
                      )}
                    </td>
                    <td className="p-3 text-[0.65rem] text-black/50">
                      {formatDateTlv(r.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        eventName={selectedEvent?.title || ""}
        onSubmit={handleUpload}
      />
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  eventName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventName: string;
  onSubmit: (lines: string[], defaultStatus: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [defaultStatus, setDefaultStatus] = useState("GOING");
  const [saving, setSaving] = useState(false);

  // Parse pasted lines for live preview
  const preview = useMemo(() => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const line of lines) {
      if (/^(email|name|e-mail|full name)/i.test(line)) continue;
      const parts = line.split(/[,\t]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      const email = parts[0];
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) valid.push(email);
      else invalid.push(line);
    }
    return { valid, invalid, total: lines.length };
  }, [text]);

  async function submit() {
    setSaving(true);
    const lines = text.split(/\r?\n/);
    await onSubmit(lines, defaultStatus);
    setSaving(false);
    setText("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setText(""); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload registrants — {eventName}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-black/80">
          Paste a list of emails (one per line) or a CSV/TSV with columns
          like <code className="px-1 py-0.5 bg-black/5 rounded">email,name</code>.
          Lines starting with "email" or "name" are treated as headers and skipped.
          Each email will be added as an RSVP. If the email matches a platform
          user, the RSVP will be linked to their account.
        </p>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-black/70">Default status</label>
          <select
            value={defaultStatus}
            onChange={(e) => setDefaultStatus(e.target.value)}
            className="text-sm border border-black/15 rounded-md px-2 py-2 bg-white"
          >
            <option value="GOING">Going</option>
            <option value="MAYBE">Maybe</option>
            <option value="WAITLIST">Waitlist</option>
            <option value="NOT_GOING">Not going</option>
          </select>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={`email,name
john@example.com,John Doe
jane@example.com,Jane Smith
bob@example.com,Bob Lee`}
          className="font-mono text-xs"
        />

        {/* Live preview */}
        {text.trim() && (
          <div className="text-xs flex flex-wrap gap-3 items-center pt-2 border-t border-black/10">
            <Badge variant="outline" className="border-[#00E6FF] text-[#007E72] bg-[#00E6FF]/10">
              <Mail className="h-3 w-3 mr-1" /> {preview.valid.length} valid email{preview.valid.length === 1 ? "" : "s"}
            </Badge>
            {preview.invalid.length > 0 && (
              <Badge variant="outline" className="border-[#FF005A] text-[#FF005A] bg-[#FF005A]/10">
                <X className="h-3 w-3 mr-1" /> {preview.invalid.length} skipped
              </Badge>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={!preview.valid.length || saving}
            className="bg-[#FF005A] hover:bg-[#FF005A]/90"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1.5" />
            )}
            Add {preview.valid.length} registrant{preview.valid.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
