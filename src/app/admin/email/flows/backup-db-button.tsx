"use client";

/**
 * BackupDbButton — admin button that triggers a full database backup.
 *
 * Clicking it:
 *   1. POST /api/admin/backup-db (admin-only)
 *   2. The endpoint dumps all Prisma tables as JSON
 *   3. Uploads to Vercel Blob Storage (persistent offsite backup)
 *   4. Returns the JSON as a downloadable file (browser downloads it)
 *
 * After the download starts, a toast shows the Blob URL so the user
 * knows the offsite backup also succeeded.
 */

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Database, Loader2, Download } from "lucide-react";

export function BackupDbButton({
  variant = "outline",
  size = "sm",
  className = "",
  label = "Backup database",
}: {
  variant?: "outline" | "ghost" | "link" | "default" | "destructive" | "secondary";
  size?: "sm" | "lg" | "icon" | "default";
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backup-db", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "request_failed" }));
        toast.error(`Backup failed: ${err.error ?? res.status}`);
        return;
      }

      // Extract metadata from response headers.
      const blobUrl = res.headers.get("X-Backup-Blob-Url") || "";
      const blobError = res.headers.get("X-Backup-Blob-Error") || "";
      const bytes = res.headers.get("X-Backup-Bytes") || "?";
      const rows = res.headers.get("X-Backup-Rows") || "?";
      const filename =
        res.headers.get("X-Backup-Filename") ||
        `aisalon-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

      // Trigger browser download of the JSON body.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeKb = Math.round(parseInt(bytes, 10) / 1024);
      if (blobUrl) {
        toast.success(
          `Backup downloaded (${sizeKb} KB, ${rows} rows). Also saved to Vercel Blob.`,
        );
      } else {
        toast.success(
          `Backup downloaded (${sizeKb} KB, ${rows} rows). Blob upload skipped: ${blobError}`,
        );
      }
    } catch (e) {
      console.error(e);
      toast.error("Backup error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={run}
      disabled={busy}
      variant={variant}
      size={size}
      className={
        "text-blue-700 hover:text-blue-800 border-blue-300 hover:border-blue-400 bg-blue-50 " +
        className
      }
      title="Export the entire database as JSON. Saved to your downloads AND Vercel Blob Storage (offsite backup)."
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <Database className="h-4 w-4 mr-1.5" />
      )}
      {label}
    </Button>
  );
}
