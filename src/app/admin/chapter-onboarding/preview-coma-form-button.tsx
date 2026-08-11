"use client";

/**
 * PreviewComaFormButton — small client component that calls the
 * /api/admin/chapter-onboarding/preview-invite endpoint to create
 * (or reuse) a PENDING invite for eze@cazhype.com (the Coma-branded
 * member), then opens the form URL in a new tab.
 *
 * Used on /admin/chapter-onboarding to let the Super Admin preview
 * the Coma-branded onboarding form without having to run a script.
 *
 * SUPER_ADMIN only (the API also enforces this server-side).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

const COMA_USER_EMAIL = "eze@cazhype.com";

export function PreviewComaFormButton() {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/chapter-onboarding/preview-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: COMA_USER_EMAIL }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const formUrl = data?.invite?.formUrl;
      if (!formUrl) {
        throw new Error("No formUrl in response");
      }
      // Open the form in a new tab so the admin can see the Coma branding.
      window.open(formUrl, "_blank", "noopener,noreferrer");
      toast.success("Opened Coma onboarding form in a new tab.");
    } catch (err) {
      toast.error(`Couldn't create Coma invite: ${(err as Error).message}`, {
        duration: 8000,
      });
    } finally {
      setLoading(false);
    }
  };

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
      Preview Coma onboarding form
    </Button>
  );
}
