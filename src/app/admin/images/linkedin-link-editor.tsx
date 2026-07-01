"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink, Save } from "lucide-react";

/**
 * LinkedInLinkEditor — admin form to set the LinkedIn "Join us" link
 * shown in the site header.
 *
 * Lives at /admin/images (below the WhatsApp editor). Writes go to
 * POST /api/admin/linkedin (SUPER_ADMIN-only). Changes take effect on
 * the next page load — no redeploy needed.
 *
 * The URL must be an https:// link. We accept any https URL so the
 * admin can also point this at a LinkedIn showcase, group, company
 * page, or event page.
 */
export function LinkedInLinkEditor({
  currentUrl,
  canEdit,
}: {
  currentUrl: string;
  canEdit: boolean;
}) {
  const [url, setUrl] = React.useState(currentUrl);
  const [saving, setSaving] = React.useState(false);

  // Keep the input in sync if the parent re-passes a new value (e.g.
  // after a server-side refresh).
  React.useEffect(() => {
    setUrl(currentUrl);
  }, [currentUrl]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("URL is required");
      return;
    }
    if (!/^https:\/\//i.test(trimmed)) {
      toast.error("URL must start with https://");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Failed to save (HTTP ${res.status})`);
        return;
      }
      toast.success("LinkedIn link updated — visible on next page load");
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#0A66C2]/30 bg-gradient-to-br from-[#0A66C2]/5 to-white p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[#0A66C2] text-white">
          <LinkedInGlyph className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-[#0a4e96]">
          LinkedIn group link
        </h2>
      </div>
      <p className="text-xs text-black/60 mb-4 leading-relaxed">
        This link is shown as a blue &quot;Join us&quot; pill in the site
        header — visible to everyone (logged-in or not). Default is the AI
        Salon Tel Aviv LinkedIn showcase. You can change it to any https://
        URL (LinkedIn showcase, group, company page, event page, etc.).
      </p>

      <form onSubmit={handleSave} className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.linkedin.com/showcase/…"
          disabled={!canEdit || saving}
          className="flex-1 rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/40 disabled:bg-black/5 disabled:cursor-not-allowed"
        />
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-black/15 bg-white text-black font-semibold px-3 py-2 text-sm hover:bg-black/5 whitespace-nowrap"
            title="Open link in new tab to verify"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Test
          </a>
        )}
        <button
          type="submit"
          disabled={!canEdit || saving || url.trim() === currentUrl}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#0A66C2] text-white font-semibold px-4 py-2 text-sm hover:bg-[#0a4e96] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </form>

      {!canEdit && (
        <p className="mt-3 text-[0.7rem] text-amber-700">
          Only Super Admins can change this link.
        </p>
      )}
    </div>
  );
}

function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
