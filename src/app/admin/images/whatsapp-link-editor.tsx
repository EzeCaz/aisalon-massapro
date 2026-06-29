"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink, Save } from "lucide-react";

/**
 * WhatsAppLinkEditor — admin form to set the WhatsApp "Join our group"
 * link shown in the site header.
 *
 * Lives at /admin/images (below the brand-images gallery). Writes go to
 * POST /api/admin/whatsapp (SUPER_ADMIN-only). Changes take effect on
 * the next page load — no redeploy needed.
 *
 * The URL must be an https:// link. We accept any https URL so the
 * admin can also point this at Telegram / Slack / Luma if needed.
 */
export function WhatsAppLinkEditor({
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
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Failed to save (HTTP ${res.status})`);
        return;
      }
      toast.success("WhatsApp link updated — visible on next page load");
    } catch (err) {
      console.error(err);
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#25D366]/30 bg-gradient-to-br from-[#25D366]/5 to-white p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[#25D366] text-white">
          <WhatsAppGlyph className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-[#1ebe5d]">
          WhatsApp group link
        </h2>
      </div>
      <p className="text-xs text-black/60 mb-4 leading-relaxed">
        This link is shown as a green &quot;Join our group&quot; pill in the
        site header — visible to everyone (logged-in or not). Default is the
        AI Salon TLV community group. You can change it to any https:// URL
        (WhatsApp, Telegram, Slack, Luma, etc.).
      </p>

      <form onSubmit={handleSave} className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
          disabled={!canEdit || saving}
          className="flex-1 rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 disabled:bg-black/5 disabled:cursor-not-allowed"
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
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#25D366] text-white font-semibold px-4 py-2 text-sm hover:bg-[#1ebe5d] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
