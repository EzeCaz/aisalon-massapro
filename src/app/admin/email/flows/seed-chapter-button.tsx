"use client";

/**
 * SeedChapterButton — a self-contained button + dialog that runs the
 * /api/admin/email/seed-chapter endpoint to clone email flows +
 * audiences + DRAFT campaigns from Tel Aviv into the admin's chapter.
 *
 * Why this exists:
 *   When a new chapter (e.g. Montreal) is created, it has no flows or
 *   audiences. The admin would have to recreate everything from scratch.
 *   This button clones the source chapter's email infrastructure in
 *   one click, so the new chapter can immediately run the same email
 *   sequences as Tel Aviv.
 *
 * Templates are NOT cloned — they remain global (chapterId=null) and
 * are visible to all chapters. Per the user spec:
 *   "email templates... stay as default template for all new chapters"
 *
 * Idempotent: re-running won't create duplicates (the endpoint checks
 * for a `[cloned-from:<id>]` marker in the description/name).
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
import { Sparkles, Loader2, Copy } from "lucide-react";

type SeedResponse = {
  ok: true;
  sourceChapterId: string;
  targetChapterId: string;
  targetChapterName: string;
  summary: {
    audiences: { cloned: number; skipped: number };
    flows: { cloned: number; skipped: number };
    campaigns: { cloned: number; skipped: number };
    chapterCore?: {
      brandImages: { applied: string[]; skipped: string[] };
      chapterFields: { applied: string[]; skipped: string[] };
    };
  };
  note: string;
};

type ErrorResponse = { error: string };

export function SeedChapterButton({
  variant = "outline",
  size = "sm",
  className = "",
  label = "Seed from Tel Aviv",
}: {
  variant?: "outline" | "ghost" | "link" | "default" | "destructive" | "secondary";
  size?: "sm" | "lg" | "icon" | "default";
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<SeedResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    if (
      !confirm(
        "This will clone all Tel Aviv email flows, audiences, and DRAFT campaigns " +
          "into your chapter. Email templates stay global (shared with all chapters). " +
          "Existing clones are skipped. Continue?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email/seed-chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data as ErrorResponse;
        toast.error(`Seed failed: ${err.error ?? res.status}`);
        setError(err.error ?? `HTTP ${res.status}`);
        setOpen(true);
        return;
      }
      setResult(data as SeedResponse);
      setOpen(true);
      const r = data as SeedResponse;
      const total =
        r.summary.flows.cloned +
        r.summary.audiences.cloned +
        r.summary.campaigns.cloned;
      toast.success(
        `Cloned ${total} item(s) from Tel Aviv → ${r.targetChapterName}`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Seed error");
      setError(String(e));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        onClick={run}
        disabled={busy}
        variant={variant}
        size={size}
        className={
          "text-emerald-700 hover:text-emerald-800 border-emerald-300 hover:border-emerald-400 bg-emerald-50 " +
          className
        }
        title="Clone Tel Aviv email flows + audiences + DRAFT campaigns into your chapter"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-1.5" />
        )}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {error
                ? "Seed failed"
                : `Seeded ${result?.targetChapterName ?? ""} from Tel Aviv`}
            </DialogTitle>
            <DialogDescription>
              {error
                ? "Something went wrong. See the error below."
                : "Email flows, audiences, and DRAFT campaigns were cloned into your chapter. Email templates remain global (shared with all chapters)."}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* Summary grid */}
              <div className="grid grid-cols-3 gap-2">
                <SummaryCard
                  label="Flows"
                  cloned={result.summary.flows.cloned}
                  skipped={result.summary.flows.skipped}
                />
                <SummaryCard
                  label="Audiences"
                  cloned={result.summary.audiences.cloned}
                  skipped={result.summary.audiences.skipped}
                />
                <SummaryCard
                  label="Campaigns"
                  cloned={result.summary.campaigns.cloned}
                  skipped={result.summary.campaigns.skipped}
                />
              </div>

              {/* Chapter core blueprint applied */}
              {result.summary.chapterCore ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <div className="font-semibold mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Chapter core blueprint applied
                  </div>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="font-semibold">Brand images:</span>{" "}
                      {result.summary.chapterCore.brandImages.applied.length > 0
                        ? `${result.summary.chapterCore.brandImages.applied.join(", ")} applied`
                        : "none applied"}
                      {result.summary.chapterCore.brandImages.skipped.length > 0 &&
                        ` · ${result.summary.chapterCore.brandImages.skipped.join(", ")} already set`}
                    </div>
                    <div>
                      <span className="font-semibold">Chapter fields:</span>{" "}
                      {result.summary.chapterCore.chapterFields.applied.length > 0
                        ? `${result.summary.chapterCore.chapterFields.applied.join(", ")} applied`
                        : "none applied"}
                      {result.summary.chapterCore.chapterFields.skipped.length > 0 &&
                        ` · ${result.summary.chapterCore.chapterFields.skipped.join(", ")} already set`}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Note about templates */}
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Email templates
                </div>
                {result.note}
              </div>

              {/* Next steps */}
              <div className="text-sm text-black/70 space-y-1">
                <div className="font-semibold">Next steps:</div>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>Open the Flows tab → review the cloned flows + their steps.</li>
                  <li>Edit each flow's trigger to bind it to a Montreal event (the source-chapter triggers were stripped during clone).</li>
                  <li>Activate the flows you want to run (they're cloned as DRAFT).</li>
                  <li>Edit audiences to add Montreal member emails (or use DYNAMIC filters that resolve to Montreal members automatically).</li>
                </ol>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryCard({
  label,
  cloned,
  skipped,
}: {
  label: string;
  cloned: number;
  skipped: number;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-black/50">
        {label}
      </div>
      <div className="text-2xl font-extrabold text-emerald-700">{cloned}</div>
      <div className="text-xs text-black/50">
        {skipped > 0 ? `${skipped} already existed` : "newly cloned"}
      </div>
    </div>
  );
}
