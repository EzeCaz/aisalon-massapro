"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Users,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  MapPin,
  ChevronRight,
  GitMerge,
  X,
  Mail,
  Building2,
  Phone,
  Linkedin,
  Clock,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";

type EventRow = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  venue: string | null;
  _count: { registrations: number; nonMemberRegistrations: number };
};

type MemberReg = {
  registrationId: string;
  registeredAt: string;
  source: string;
  importName: string | null;
  importCompany: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    mobile: string | null;
    linkedinUrl: string | null;
    photoUrl: string | null;
    image: string | null;
    createdAt: string;
    tags: { label: string; color: string | null }[];
  };
};

type NonMemberReg = {
  registrationId: string;
  registeredAt: string;
  source: string;
  nonMember: {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    mobile: string | null;
    linkedinUrl: string | null;
    bio: string | null;
    importSource: string | null;
    duplicateStatus: string; // "none" | "pending" | "merged" | "ignored"
    duplicateReason: string | null;
    createdAt: string;
    duplicateOf: {
      id: string;
      email: string;
      name: string | null;
      company: string | null;
      mobile: string | null;
      linkedinUrl: string | null;
      createdAt: string;
      image: string | null;
      tags: { label: string; color: string | null }[];
    } | null;
  };
};

type EventRegsResponse = {
  event: { id: string; title: string };
  members: MemberReg[];
  nonMembers: NonMemberReg[];
};

type UploadResponse = {
  event: { id: string; title: string };
  fileName: string;
  totalRows: number;
  matched: number;
  newNonMembers: number;
  potentialDuplicates: number;
  skipped: number;
  errors: string[];
  duplicateMatches: Array<{
    nonMemberId: string;
    email: string;
    name: string | null;
    matchedUserId: string;
    matchedUserName: string | null;
    matchedUserEmail: string;
    reason: string;
  }>;
  warnings: string[];
  headerColumns: string[];
};

export function AdminRegistrations({
  events,
  preselectedEventId,
}: {
  events: EventRow[];
  preselectedEventId?: string;
}) {
  const [selectedEventId, setSelectedEventId] = useState<string>(
    preselectedEventId && events.some((e) => e.id === preselectedEventId)
      ? preselectedEventId
      : events[0]?.id ?? ""
  );
  const [data, setData] = useState<EventRegsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Load registrations for the selected event
  const loadRegistrations = useCallback(async (eventId: string) => {
    if (!eventId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/registrations`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      toast.error("Failed to load registrations: " + (err as Error).message, { duration: 8000 });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) loadRegistrations(selectedEventId);
  }, [selectedEventId, loadRegistrations]);

  async function handleFile(file: File) {
    if (!selectedEventId) {
      toast.error("Pick an event first");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv", "tsv"].includes(ext)) {
      toast.error("Please upload an .xlsx, .xls, .csv or .tsv file");
      return;
    }
    setUploading(true);
    const t = toast.loading(`Uploading ${file.name}…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/events/${selectedEventId}/registrations/upload`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as UploadResponse | { error: string };
      if (!res.ok) {
        const errMsg = (json as { error: string }).error || `HTTP ${res.status}`;
        throw new Error(errMsg);
      }
      const r = json as UploadResponse;
      setUploadResult(r);
      setResultDialogOpen(true);
      toast.success(
        `Imported ${r.totalRows} rows: ${r.matched} members, ${r.newNonMembers} new leads, ${r.potentialDuplicates} flagged`,
        { id: t, duration: 8000 }
      );
      // Reload the registrations list to show the new data
      await loadRegistrations(selectedEventId);
    } catch (err) {
      toast.error("Upload failed: " + (err as Error).message, { id: t, duration: 10000 });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  // Stats
  const memberCount = data?.members.length ?? 0;
  const nonMemberCount = data?.nonMembers.length ?? 0;
  const pendingDuplicates =
    data?.nonMembers.filter((r) => r.nonMember.duplicateStatus === "pending").length ?? 0;
  const mergedCount =
    data?.nonMembers.filter((r) => r.nonMember.duplicateStatus === "merged").length ?? 0;

  if (events.length === 0) {
    return (
      <Card className="p-8 text-center bg-white border border-black/10">
        <p className="text-sm text-black/60">No events created yet. Create an event first.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Event picker */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-black/40 mb-2 block">
          Select event
        </label>
        <div className="flex flex-wrap gap-2">
          {events.map((e) => {
            const isActive = e.id === selectedEventId;
            const start = new Date(e.startsAt);
            return (
              <button
                key={e.id}
                onClick={() => setSelectedEventId(e.id)}
                className={`text-left rounded-md border px-3 py-2 transition-colors ${
                  isActive
                    ? "border-[#FF005A] bg-[#FF005A]/5 ring-1 ring-[#FF005A]/30"
                    : "border-black/15 hover:border-black/40 bg-white"
                }`}
              >
                <div className="text-sm font-semibold text-black line-clamp-1">{e.title}</div>
                <div className="text-[0.65rem] text-black/50 mt-0.5 inline-flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  <span className="mx-1">·</span>
                  <Users className="h-3 w-3" />
                  {e._count.registrations + e._count.nonMemberRegistrations} regs
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upload card */}
      <Card className="border border-black/10 bg-white p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-black text-sm">Upload RSVP spreadsheet</h3>
            <p className="text-xs text-black/60 mt-1">
              xlsx / xls / csv / tsv. The parser auto-detects columns: email, name (or first+last), timestamp,
              mobile, company, linkedin, bio. Other columns are preserved as raw data.
            </p>
          </div>
          {selectedEvent && (
            <Badge variant="outline" className="text-[0.6rem] whitespace-nowrap">
              For: {selectedEvent.title}
            </Badge>
          )}
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-md border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-[#FF005A] bg-[#FF005A]/5" : "border-black/20 bg-black/[0.01]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv"
            onChange={onFileInput}
            className="hidden"
          />
          <FileSpreadsheet className="h-8 w-8 mx-auto text-black/40 mb-2" />
          <p className="text-sm text-black/70">
            Drag &amp; drop the spreadsheet here, or
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !selectedEventId}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Choose file
              </>
            )}
          </Button>
          <p className="text-[0.65rem] text-black/40 mt-2">
            We&apos;ll cross-reference by email. Existing members get registered; new emails become non-member
            leads; same-name-different-email rows get flagged for your review.
          </p>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Members registered"
          value={memberCount}
          accent="#007E72"
          icon={<Users className="h-3.5 w-3.5" />}
          total={memberCount + nonMemberCount}
        />
        <StatCard
          label="Non-member leads"
          value={nonMemberCount}
          accent="#00E6FF"
          icon={<UserPlus className="h-3.5 w-3.5" />}
          total={memberCount + nonMemberCount}
        />
        <StatCard
          label="Pending duplicates"
          value={pendingDuplicates}
          accent="#FF005A"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          highlight={pendingDuplicates > 0}
          total={nonMemberCount}
        />
        <StatCard
          label="Merged"
          value={mergedCount}
          accent="#820A7D"
          icon={<GitMerge className="h-3.5 w-3.5" />}
          total={nonMemberCount}
        />
      </div>

      {/* Duplicates queue (pending only) */}
      {pendingDuplicates > 0 && (
        <DuplicatesQueue
          items={data?.nonMembers.filter((r) => r.nonMember.duplicateStatus === "pending") ?? []}
          onResolved={() => loadRegistrations(selectedEventId)}
        />
      )}

      {/* Members table */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-black">Registered members</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => loadRegistrations(selectedEventId)}
            disabled={loading}
            className="h-7 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {loading ? (
          <Card className="p-6 text-center text-sm text-black/50">
            <Loader2 className="h-4 w-4 mx-auto animate-spin mb-2" />
            Loading registrations…
          </Card>
        ) : memberCount === 0 ? (
          <Card className="p-6 text-center text-sm text-black/50">
            No members registered for this event yet.
          </Card>
        ) : (
          <RegistrationsTable members={data?.members ?? []} eventId={selectedEventId} onChanged={() => loadRegistrations(selectedEventId)} />
        )}
      </section>

      {/* Non-members table */}
      <section>
        <h2 className="text-lg font-bold text-black mb-2">Non-member leads</h2>
        {loading ? (
          <Card className="p-6 text-center text-sm text-black/50">
            <Loader2 className="h-4 w-4 mx-auto animate-spin mb-2" />
            Loading…
          </Card>
        ) : nonMemberCount === 0 ? (
          <Card className="p-6 text-center text-sm text-black/50">
            No non-member leads for this event.
          </Card>
        ) : (
          <NonMembersTable
            rows={data?.nonMembers ?? []}
            eventId={selectedEventId}
            onChanged={() => loadRegistrations(selectedEventId)}
          />
        )}
      </section>

      {/* Upload result dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload result — {uploadResult?.fileName}</DialogTitle>
          </DialogHeader>
          {uploadResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <ResultStat label="Total rows" value={uploadResult.totalRows} />
                <ResultStat label="Matched members" value={uploadResult.matched} color="#007E72" total={uploadResult.totalRows} />
                <ResultStat label="New leads" value={uploadResult.newNonMembers} color="#00E6FF" total={uploadResult.totalRows} />
                <ResultStat label="Flagged duplicates" value={uploadResult.potentialDuplicates} color="#FF005A" total={uploadResult.totalRows} />
              </div>

              {uploadResult.warnings.length > 0 && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-900">
                  <strong className="block mb-1">Warnings:</strong>
                  <ul className="list-disc ml-4 space-y-0.5">
                    {uploadResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {uploadResult.errors.length > 0 && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-900">
                  <strong className="block mb-1">Errors ({uploadResult.errors.length}):</strong>
                  <ul className="list-disc ml-4 space-y-0.5 max-h-40 overflow-y-auto">
                    {uploadResult.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {uploadResult.errors.length > 20 && <li>… and {uploadResult.errors.length - 20} more</li>}
                  </ul>
                </div>
              )}

              {uploadResult.duplicateMatches.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-black mb-2 inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-[#FF005A]" />
                    Potential duplicates flagged ({uploadResult.duplicateMatches.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {uploadResult.duplicateMatches.map((d, i) => (
                      <div key={i} className="rounded-md border border-black/10 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-black">{d.name ?? d.email}</div>
                            <div className="text-black/60 mt-0.5">
                              <Mail className="inline h-3 w-3 mr-1" />
                              {d.email}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[0.55rem] whitespace-nowrap">
                            {d.reason}
                          </Badge>
                        </div>
                        <div className="mt-2 pt-2 border-t border-black/5 text-black/70">
                          ↔ Possibly same as:{" "}
                          <strong className="text-black">{d.matchedUserName ?? d.matchedUserEmail}</strong>{" "}
                          <span className="text-black/40">({d.matchedUserEmail})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[0.7rem] text-black/50 mt-2">
                    Review and resolve these in the &quot;Pending duplicates&quot; section above.
                  </p>
                </div>
              )}

              {uploadResult.skipped > 0 && (
                <p className="text-xs text-black/60">
                  {uploadResult.skipped} row(s) skipped (no email address).
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Stat card ---------------- */

function StatCard({
  label,
  value,
  accent,
  icon,
  highlight,
  total,
}: {
  label: string;
  value: number;
  accent: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  total?: number;
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={`border rounded-lg p-4 bg-white transition-all ${
        highlight ? "border-[#FF005A] ring-2 ring-[#FF005A]/20 ais-lift" : "border-black/10"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-black/40 inline-flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold text-black">{value}</span>
        {total !== undefined && (
          <span className="text-sm font-bold text-black/45">{pct}%</span>
        )}
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  color,
  total,
}: {
  label: string;
  value: number;
  color?: string;
  total?: number;
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-md border border-black/10 p-2.5 text-center">
      <div className="text-2xl font-extrabold" style={{ color: color ?? "black" }}>
        {value}
        {total !== undefined && (
          <span className="text-xs font-bold text-black/45 ml-1">{pct}%</span>
        )}
      </div>
      <div className="text-[0.6rem] uppercase tracking-wider text-black/50 mt-0.5">{label}</div>
    </div>
  );
}

/* ---------------- Members table ---------------- */

function RegistrationsTable({
  members,
  eventId,
  onChanged,
}: {
  members: MemberReg[];
  eventId: string;
  onChanged: () => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function unregister(userId: string) {
    if (!confirm("Remove this member's registration for this event?")) return;
    setRemoving(userId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/registrations?userId=${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Registration removed");
      onChanged();
    } catch (err) {
      toast.error("Failed: " + (err as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card className="border border-black/10 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] border-b border-black/10">
            <tr className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-black/50">
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Registered</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((r) => {
              const u = r.user;
              const img = u.photoUrl ?? u.image;
              return (
                <tr key={r.registrationId} className="border-b border-black/5 hover:bg-black/[0.01]">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={u.name ?? u.email}
                          className="h-7 w-7 rounded-full object-cover bg-black/10"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-black/10 flex items-center justify-center text-[0.6rem] font-bold text-black/50">
                          {(u.name ?? u.email)[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-black text-xs">
                          {u.name ?? <span className="italic text-black/40">No name</span>}
                        </div>
                        {u.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {u.tags.slice(0, 3).map((t) => (
                              <span
                                key={t.label}
                                className="text-[0.5rem] uppercase tracking-wider rounded px-1 py-0.5 font-bold text-white"
                                style={{ backgroundColor: t.color ?? "#666" }}
                              >
                                {t.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-black/70 font-mono">{u.email}</td>
                  <td className="px-3 py-2 text-xs text-black/70">{u.company ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-black/60">
                    {new Date(r.registeredAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs text-black/60">
                    <Badge variant="outline" className="text-[0.55rem] uppercase">
                      {r.source}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/events?u=${u.id}`}
                        className="text-xs text-black/60 hover:text-[#FF005A] inline-flex items-center gap-0.5"
                        title="View member"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unregister(u.id)}
                        disabled={removing === u.id}
                        className="h-6 text-[0.65rem] text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {removing === u.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- Non-members table ---------------- */

function NonMembersTable({
  rows,
  eventId,
  onChanged,
}: {
  rows: NonMemberReg[];
  eventId: string;
  onChanged: () => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<NonMemberReg | null>(null);

  async function unregister(nonMemberId: string) {
    if (!confirm("Remove this non-member's registration for this event?")) return;
    setRemoving(nonMemberId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/registrations?nonMemberId=${nonMemberId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Registration removed");
      onChanged();
    } catch (err) {
      toast.error("Failed: " + (err as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <Card className="border border-black/10 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] border-b border-black/10">
              <tr className="text-left text-[0.65rem] font-bold uppercase tracking-wider text-black/50">
                <th className="px-3 py-2">Name / Email</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">LinkedIn</th>
                <th className="px-3 py-2">Registered</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const nm = r.nonMember;
                return (
                  <tr key={r.registrationId} className="border-b border-black/5 hover:bg-black/[0.01]">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-black text-xs">
                        {nm.name ?? <span className="italic text-black/40">No name</span>}
                      </div>
                      <div className="text-[0.7rem] text-black/60 font-mono">{nm.email}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-black/70">{nm.company ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-black/70">{nm.mobile ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {nm.linkedinUrl ? (
                        <a
                          href={nm.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Linkedin className="h-3 w-3" />
                          Profile
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/60">
                      {new Date(r.registeredAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={nm.duplicateStatus} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        {nm.duplicateStatus === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMergeTarget(r)}
                            className="h-6 text-[0.65rem] border-[#FF005A]/40 text-[#FF005A] hover:bg-[#FF005A]/5"
                          >
                            <GitMerge className="h-3 w-3 mr-1" />
                            Review
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => unregister(nm.id)}
                          disabled={removing === nm.id}
                          className="h-6 text-[0.65rem] text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {removing === nm.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Merge dialog (also reachable from the duplicates queue) */}
      {mergeTarget && (
        <MergeDialog
          row={mergeTarget}
          onClose={() => setMergeTarget(null)}
          onResolved={() => {
            setMergeTarget(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return (
        <Badge className="text-[0.55rem] uppercase bg-[#FF005A] text-white hover:bg-[#FF005A]">
          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
          Pending review
        </Badge>
      );
    case "merged":
      return (
        <Badge className="text-[0.55rem] uppercase bg-[#820A7D] text-white hover:bg-[#820A7D]">
          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
          Merged
        </Badge>
      );
    case "ignored":
      return (
        <Badge variant="outline" className="text-[0.55rem] uppercase text-black/50">
          Ignored
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[0.55rem] uppercase text-black/60">
          New lead
        </Badge>
      );
  }
}

/* ---------------- Duplicates queue (above the tables) ---------------- */

function DuplicatesQueue({
  items,
  onResolved,
}: {
  items: NonMemberReg[];
  onResolved: () => void;
}) {
  // Show one-at-a-time as the user requested ("have them one after the other")
  const [index, setIndex] = useState(0);
  const [mergeTarget, setMergeTarget] = useState<NonMemberReg | null>(null);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  if (items.length === 0) return null;
  const current = items[Math.min(index, items.length - 1)];

  return (
    <Card className="border-2 border-[#FF005A] bg-[#FF005A]/[0.03] p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-bold text-black text-sm inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-[#FF005A]" />
            Potential duplicates queue
          </h3>
          <p className="text-xs text-black/60 mt-1">
            Reviewing {index + 1} of {items.length}. Compare side-by-side, then merge or dismiss.
          </p>
        </div>
        {items.length > 1 && (
          <div className="inline-flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="h-7 text-xs"
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
              disabled={index >= items.length - 1}
              className="h-7 text-xs"
            >
              Next
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-md bg-white border border-black/10 p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Non-member side */}
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-[#FF005A] font-bold mb-2">
              New registrant (non-member)
            </div>
            <SideBySideRow
              email={current.nonMember.email}
              name={current.nonMember.name}
              company={current.nonMember.company}
              mobile={current.nonMember.mobile}
              linkedinUrl={current.nonMember.linkedinUrl}
              createdAt={current.nonMember.createdAt}
              registeredAt={current.registeredAt}
            />
          </div>
          {/* Existing member side */}
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-[#007E72] font-bold mb-2">
              Existing member (possible match)
            </div>
            {current.nonMember.duplicateOf ? (
              <SideBySideRow
                email={current.nonMember.duplicateOf.email}
                name={current.nonMember.duplicateOf.name}
                company={current.nonMember.duplicateOf.company}
                mobile={current.nonMember.duplicateOf.mobile}
                linkedinUrl={current.nonMember.duplicateOf.linkedinUrl}
                createdAt={current.nonMember.duplicateOf.createdAt}
                tags={current.nonMember.duplicateOf.tags}
              />
            ) : (
              <p className="text-xs text-black/40 italic">No candidate match.</p>
            )}
          </div>
        </div>

        {current.nonMember.duplicateReason && (
          <p className="text-[0.7rem] text-black/60 mt-2 pt-2 border-t border-black/5">
            <strong>Reason:</strong> {current.nonMember.duplicateReason}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => setMergeTarget(current)}
            disabled={!current.nonMember.duplicateOf}
            className="bg-[#FF005A] text-white hover:bg-[#FF005A]/90"
          >
            <GitMerge className="h-3.5 w-3.5 mr-1" />
            Merge into existing member
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const res = await fetch(`/api/admin/non-members/${current.nonMember.id}/ignore`, {
                  method: "POST",
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                toast.success("Dismissed — kept as separate non-member lead");
                onResolved();
              } catch (err) {
                toast.error("Failed: " + (err as Error).message);
              }
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Not the same person
          </Button>
          <span className="text-[0.7rem] text-black/40 ml-auto">
            ({items.length - index - 1} more in queue)
          </span>
        </div>
      </div>

      {mergeTarget && (
        <MergeDialog
          row={mergeTarget}
          onClose={() => setMergeTarget(null)}
          onResolved={() => {
            setMergeTarget(null);
            onResolved();
          }}
        />
      )}
    </Card>
  );
}

function SideBySideRow({
  email,
  name,
  company,
  mobile,
  linkedinUrl,
  createdAt,
  registeredAt,
  tags,
}: {
  email: string;
  name: string | null;
  company: string | null;
  mobile: string | null;
  linkedinUrl: string | null;
  createdAt: string;
  registeredAt?: string;
  tags?: { label: string; color: string | null }[];
}) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="font-semibold text-black text-sm">{name ?? <span className="italic text-black/40">No name</span>}</div>
      <div className="flex items-start gap-1.5 text-black/70">
        <Mail className="h-3 w-3 mt-0.5 text-black/40" />
        <span className="font-mono break-all">{email}</span>
      </div>
      {company && (
        <div className="flex items-start gap-1.5 text-black/70">
          <Building2 className="h-3 w-3 mt-0.5 text-black/40" />
          {company}
        </div>
      )}
      {mobile && (
        <div className="flex items-start gap-1.5 text-black/70">
          <Phone className="h-3 w-3 mt-0.5 text-black/40" />
          {mobile}
        </div>
      )}
      {linkedinUrl && (
        <div className="flex items-start gap-1.5 text-black/70">
          <Linkedin className="h-3 w-3 mt-0.5 text-black/40" />
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline truncate"
          >
            {linkedinUrl}
          </a>
        </div>
      )}
      <div className="flex items-start gap-1.5 text-black/50">
        <Clock className="h-3 w-3 mt-0.5" />
        Joined: {new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        {registeredAt && (
          <span className="ml-2">
            · Registered: {new Date(registeredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {tags.map((t) => (
            <span
              key={t.label}
              className="text-[0.5rem] uppercase tracking-wider rounded px-1 py-0.5 font-bold text-white"
              style={{ backgroundColor: t.color ?? "#666" }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Merge dialog (confirmation) ---------------- */

function MergeDialog({
  row,
  onClose,
  onResolved,
}: {
  row: NonMemberReg;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const nm = row.nonMember;
  const existing = nm.duplicateOf;

  async function doMerge() {
    if (!existing) {
      toast.error("No existing member to merge into");
      return;
    }
    setBusy(true);
    const t = toast.loading("Merging…");
    try {
      const res = await fetch(`/api/admin/non-members/${nm.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: existing.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      toast.success(
        `Merged ${nm.email} into ${existing.email}. ${json.convertedRegistrations ?? 0} registration(s) converted.`,
        { id: t, duration: 6000 }
      );
      onResolved();
    } catch (err) {
      toast.error("Merge failed: " + (err as Error).message, { id: t, duration: 10000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-1.5">
            <GitMerge className="h-4 w-4 text-[#FF005A]" />
            Merge non-member into existing member?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-black/70">
          This will:
        </p>
        <ul className="text-xs text-black/70 list-disc ml-5 space-y-0.5">
          <li>
            Add <strong className="font-mono">{nm.email}</strong> as a secondary email on{" "}
            <strong className="font-mono">{existing?.email}</strong> (so they can sign in with either).
          </li>
          <li>Convert all of this non-member&apos;s event registrations into the member&apos;s registrations.</li>
          <li>Backfill any blank fields on the member from the non-member&apos;s data (won&apos;t overwrite existing data).</li>
          <li>Mark the non-member as &quot;merged&quot; (kept for audit; can be hard-deleted later).</li>
        </ul>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="rounded-md border border-[#FF005A]/30 p-3 bg-[#FF005A]/[0.03]">
            <div className="text-[0.6rem] uppercase tracking-widest text-[#FF005A] font-bold mb-2">
              Non-member
            </div>
            <SideBySideRow
              email={nm.email}
              name={nm.name}
              company={nm.company}
              mobile={nm.mobile}
              linkedinUrl={nm.linkedinUrl}
              createdAt={nm.createdAt}
              registeredAt={row.registeredAt}
            />
          </div>
          <div className="rounded-md border border-[#007E72]/30 p-3 bg-[#007E72]/[0.03]">
            <div className="text-[0.6rem] uppercase tracking-widest text-[#007E72] font-bold mb-2">
              Existing member
            </div>
            {existing ? (
              <SideBySideRow
                email={existing.email}
                name={existing.name}
                company={existing.company}
                mobile={existing.mobile}
                linkedinUrl={existing.linkedinUrl}
                createdAt={existing.createdAt}
                tags={existing.tags}
              />
            ) : (
              <p className="text-xs text-black/40 italic">No candidate match.</p>
            )}
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={doMerge} disabled={busy || !existing} className="bg-[#FF005A] text-white hover:bg-[#FF005A]/90">
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <GitMerge className="h-3.5 w-3.5 mr-1" />}
            Confirm merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
