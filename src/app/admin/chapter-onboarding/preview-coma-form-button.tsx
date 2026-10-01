"use client";

/**
 * PreviewComaFormButton — small client component that calls the
 * /api/admin/chapter-onboarding/preview-invite endpoint to create
 * (or reuse) a PENDING invite for a target user, then opens the form
 * URL in a new tab.
 *
 * Used on /admin/chapter-onboarding to let the admin preview the
 * brand-aware onboarding form without having to run a script.
 *
 * Phase 4 (2026-10-02): the button is now brand-aware. Pass the
 * caller's `previewEmail` + `brandSlug` + optional `brandDisplayName` props:
 *   - SUPER_ADMIN: previewEmail = "eze@cazhype.com" (Coma preview),
 *     brandSlug = "coma" — preview the Coma-branded form.
 *   - BRAND_ADMIN: previewEmail = the brand admin's own email,
 *     brandSlug = the brand admin's own brand — preview their own
 *     brand's form.
 *
 * Auth: SUPER_ADMIN or matching BRAND_ADMIN (the API also enforces
 * this server-side, including the brand-scope check).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function PreviewComaFormButton({
  previewEmail,
  brandSlug,
  brandDisplayName,
}: {
  previewEmail: string;
  brandSlug: string;
  brandDisplayName?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/chapter-onboarding/preview-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: previewEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const formUrl = data?.invite?.formUrl;
      if (!formUrl) {
        throw new Error("No formUrl in response");
      }
      // Open the form in a new tab so the admin can see the brand's branding.
      window.open(formUrl, "_blank", "noopener,noreferrer");
      toast.success(`Opened ${brandDisplayName ?? brandSlug} onboarding form in a new tab.`);
    } catch (err) {
      toast.error(`Couldn't create ${brandDisplayName ?? brandSlug} invite: ${(err as Error).message}`, {
        duration: 8000,
      });
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = brandSlug === "coma"
    ? "Preview Coma onboarding form"
    : `Preview ${brandDisplayName ?? brandSlug} onboarding form`;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="border-[#0A1F44]/30 text-[#0A1F44] hover:bg-[#0A1F44]/5"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Eye className="h-4 w-4 mr-2" />
      )}
      {buttonLabel}
    </Button>
  );
}
