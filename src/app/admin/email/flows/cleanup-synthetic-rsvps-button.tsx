"use client";

/**
 * CleanupSyntheticRsvpsButton — a self-contained button + dialog that runs
 * the synthetic-RSVP cleanup endpoint and reports results.
 *
 * Why this exists:
 *   The old "Send to Audience" code created synthetic EventRsvp rows
 *   (source=IMPORT, name=null, status=GOING) for every audience email
 *   without an RSVP, just to satisfy the EmailQueue.rsvpId NOT NULL FK.
 *   This polluted the event's registrant count. This button:
 *     1. Applies the EmailQueue.rsvpId-nullable migration (idempotent).
 *     2. Lists synthetic RSVPs (dry-run).
 *     3. On user confirmation, nullifies EmailQueue.rsvpId + deletes
 *        the synthetic RSVPs. Email history is preserved.
 */

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, Trash2 } from "lucide-react";

type Report = {
  migration: {
    checked: boolean;
    alreadyApplied: boolean | null;
    applied: boolean;
    error?: string;
  };
  candidates: number;
  synthetic: number;
  byEvent: Array<{
    eventId: string;
    eventTitle: string;
    startsAt: string;
    count: number;
    sample: string[];
  }>;
  dryRun: boolean;
  queueRowsNullified?: number;
  rsvpsDeleted?: number;
  postCleanup?: Array<{ eventId: string; eventTitle: string; remaining: number }>;
};

export function CleanupSyntheticRsvpsButton({
  variant = "outline",
  size = "sm",
  className = "",
  label = "Cleanup synthetic RSVPs",
}: {
  variant?: "outline" | "ghost" | "link" | "default" | "destructive" | "secondary";
  size?: "sm" | "lg" | "icon" | "default";
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [report, setReport] = React.useState<Report | null>(null);

  const run = async (apply: boolean) => {
    if (apply) {
      if (
        !confirm(
          "This will DELETE all synthetic RSVPs (source=IMPORT, name=null, GOING) " +
            "that have email-queue rows. Email history is preserved (queue rows " +
            "get rsvpId=nullified). Real RSVPs are NOT affected. Continue?",
        )
      )
        return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cleanup-synthetic-rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: !apply }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "request_failed" }));
        toast.error(`Cleanup failed: ${err.error ?? res.status}`);
        return;
      }
      const data = await res.json();
      setReport(data.report);
      setOpen(true);
      if (apply) {
        const r = data.report as Report;
        toast.success(
          `Deleted ${r.rsvpsDeleted ?? 0} synthetic RSVPs · ` +
            `nullified ${r.queueRowsNullified ?? 0} queue rows`,
        );
      } else {
        toast.info(
          `Dry-run: found ${data.report.synthetic} synthetic RSVPs across ` +
            `${data.report.byEvent.length} event(s)`,
        );
      }
    } catch (e) {
      console.error(e);
      toast.error("Cleanup error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => run(false)}
        disabled={busy}
        variant={variant}
        size={size}
        className={
          "text-amber-700 hover:text-amber-800 border-amber-300 hover:border-amber-400 bg-amber-50 " +
          className
        }
        title="Find synthetic RSVPs created by the old 'Send to Audience' path (dry-run)"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-1.5" />
        )}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {report?.dryRun
                ? "Cleanup dry-run report"
                : "Cleanup applied — results"}
            </DialogTitle>
            <DialogDescription>
              {report?.dryRun
                ? "No changes were made. Click 'Apply cleanup' below to actually delete the synthetic RSVPs."
                : "Synthetic RSVPs have been deleted. Email history was preserved."}
            </DialogDescription>
          </DialogHeader>

          {report && (
            <div className="space-y-4">
              {/* Migration status */}
              <div className="rounded-lg border bg-neutral-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1">
                  Schema migration (EmailQueue.rsvpId nullable)
                </div>
                <div className="text-sm">
                  {report.migration.alreadyApplied
                    ? "✓ Already applied — rsvpId is nullable"
                    : report.migration.applied
                      ? "✓ Applied just now — rsvpId is now nullable"
                      : "○ Will be applied when you click 'Apply cleanup'"}
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-black/50">
                    Synthetic RSVPs found
                  </div>
                  <div className="text-2xl font-extrabold">
                    {report.synthetic}
                  </div>
                  <div className="text-xs text-black/50">
                    of {report.candidates} candidates
                  </div>
                </div>
                {!report.dryRun && (
                  <>
                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-black/50">
                        RSVPs deleted
                      </div>
                      <div className="text-2xl font-extrabold text-red-600">
                        {report.rsvpsDeleted ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-black/50">
                        Queue rows nullified
                      </div>
                      <div className="text-2xl font-extrabold">
                        {report.queueRowsNullified ?? 0}
                      </div>
                      <div className="text-xs text-black/50">
                        email history preserved
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Per-event breakdown */}
              <div>
                <div className="text-sm font-semibold mb-2">By event</div>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-black/50">
                      <tr>
                        <th className="text-left px-3 py-2">Event</th>
                        <th className="text-right px-3 py-2">Synthetic</th>
                        {!report.dryRun && (
                          <th className="text-right px-3 py-2">Remaining</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {report.byEvent.map((e) => {
                        const post = report.postCleanup?.find(
                          (p) => p.eventId === e.eventId,
                        );
                        return (
                          <tr key={e.eventId} className="border-t">
                            <td className="px-3 py-2">
                              <div className="font-medium">{e.eventTitle}</div>
                              <div className="text-xs text-black/50">
                                {new Date(e.startsAt).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="text-right px-3 py-2 font-mono">
                              {e.count}
                            </td>
                            {!report.dryRun && (
                              <td className="text-right px-3 py-2 font-mono">
                                {post?.remaining ?? "—"}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sample emails */}
              {report.byEvent.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">
                    Sample synthetic RSVPs
                  </div>
                  <div className="text-xs text-black/60 space-y-0.5 font-mono">
                    {report.byEvent
                      .flatMap((e) =>
                        e.sample.map((s) => `${s}  ·  ${e.eventTitle}`),
                      )
                      .slice(0, 8)
                      .map((line, i) => (
                        <div key={i}>— {line}</div>
                      ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
                {report.dryRun && report.synthetic > 0 && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={busy}
                    onClick={() => {
                      setOpen(false);
                      run(true);
                    }}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1.5" />
                    )}
                    Apply cleanup (delete {report.synthetic} RSVPs)
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
