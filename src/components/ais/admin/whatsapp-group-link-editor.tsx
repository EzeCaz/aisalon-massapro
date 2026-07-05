"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, Save } from "lucide-react";

type Props = {
  initialUrl: string;
  initialText: string;
  /** Whether the current user is allowed to edit (ADMIN or SUPER_ADMIN). */
  canEdit: boolean;
};

/**
 * WhatsAppGroupLinkEditor
 *
 * Small form shown on /admin/images (and any other admin surface that
 * wants to expose the WhatsApp "Join our group" link editing). Saves to
 * SiteSetting table via POST /api/admin/site-settings/whatsapp.
 *
 * Visible to ADMIN + SUPER_ADMIN. Reads-only for CO_HOST/MEMBER (but
 * they typically can't access /admin/* at all).
 */
export function WhatsAppGroupLinkEditor({ initialUrl, initialText, canEdit }: Props) {
  const [url, setUrl] = React.useState(initialUrl);
  const [text, setText] = React.useState(initialText);
  const [saving, setSaving] = React.useState(false);
  const dirty = url !== initialUrl || text !== initialText;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-settings/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      toast.success("WhatsApp link updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="rounded-lg border border-black/10 bg-white p-5 sm:p-6"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#25D366]/10">
          <MessageCircle className="h-5 w-5 text-[#25D366]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-black">WhatsApp group link</h2>
          <p className="text-xs text-black/80 mt-0.5 leading-relaxed">
            The invite URL + label shown in the site&rsquo;s top navigation
            (left of <em>Events</em>). Members see this as a clickable button
            that opens your WhatsApp community group in a new tab.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr,200px,auto] gap-3 items-end">
        <label className="block">
          <span className="block text-xs font-semibold text-black/70 mb-1.5">
            Invite URL
          </span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!canEdit || saving}
            placeholder="https://chat.whatsapp.com/…"
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366]/30 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-black/70 mb-1.5">
            Button label
          </span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!canEdit || saving}
            maxLength={60}
            placeholder="Join our group"
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366]/30 disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={!canEdit || !dirty || saving}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#25D366] text-white font-semibold px-4 py-2 text-sm hover:bg-[#1ebe5d] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Save
            </>
          )}
        </button>
      </div>

      {!canEdit && (
        <p className="mt-3 text-xs text-amber-700">
          You need Admin or Super Admin permissions to edit this link.
        </p>
      )}
      <p className="mt-3 text-[11px] text-black/80">
        Preview:{" "}
        <a
          href={url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[#25D366] font-semibold underline-offset-2 hover:underline"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {text || "Join our group"}
        </a>
      </p>
    </form>
  );
}
