"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Send, Eye, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

type Invite = {
  id: string;
  token: string;
  inviteeEmail: string;
  prefillBrandName: string | null;
  prefillBrandSlug: string | null;
  status: string;
  /** "INVITE" (Super Admin invited) or "SELF_SERVE" (lead applied via /apply/form). */
  source: string;
  /** Signed-in user.id when the lead applied via /apply/form (SELF_SERVE only). */
  applicantUserId: string | null;
  sentAt: string;
  submittedAt: string | null;
  expiresAt: string;
  openedAt: string | null;
  appliedBrandId: string | null;
  appliedAt: string | null;
  submissionJson: string | null;
  invitedBy: { name: string | null; email: string } | null;
};

type Brand = {
  id: string;
  slug: string;
  displayName: string;
  wordmark: string;
  tagline: string;
  status: string;
  parentBrandId: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  createdAt: string;
  onboardedAt: string | null;
  _count: { chapters: number; users: number };
};

export function BrandsAdminClient({
  invites,
  brands,
}: {
  invites: Invite[];
  brands: Brand[];
}) {
  const [email, setEmail] = React.useState("");
  const [prefillName, setPrefillName] = React.useState("");
  const [prefillSlug, setPrefillSlug] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [invitesList, setInvitesList] = React.useState<Invite[]>(invites);
  const [provisioningId, setProvisioningId] = React.useState<string | null>(null);
  const [viewingSubmission, setViewingSubmission] = React.useState<Invite | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("A valid email is required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/brands/send-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteeEmail: trimmedEmail,
          prefillBrandName: prefillName.trim() || undefined,
          prefillBrandSlug: prefillSlug.trim().toLowerCase() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Failed (HTTP ${res.status}).`);
        return;
      }
      toast.success(`Invite sent to ${trimmedEmail}. Form URL: /brand-onboarding/${data.token}`);
      setEmail("");
      setPrefillName("");
      setPrefillSlug("");
      // Refresh the list. We could optimistically prepend, but a server
      // refresh is simpler and avoids drift.
      window.location.reload();
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleProvision(invite: Invite) {
    if (!confirm(`Provision brand "${brandNameFor(invite) || invite.inviteeEmail}"? This creates a new Brand row.`)) return;
    setProvisioningId(invite.id);
    try {
      const res = await fetch(`/api/admin/brands/${invite.id}/provision`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Failed (HTTP ${res.status}).`);
        return;
      }
      toast.success(`Brand provisioned: slug="${data.brandSlug}". The brand is now live.`);
      window.location.reload();
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setProvisioningId(null);
    }
  }

  function viewSubmission(invite: Invite) {
    setViewingSubmission(invite);
  }

  /** Extract the brand name for display:
   *  - INVITE flow: prefer the Super Admin's prefill (prefillBrandName).
   *  - SELF_SERVE flow: the lead had no prefill — pull brandName from
   *    the submission JSON they submitted via /apply/form.
   *  Falls back to the invitee email if neither is available. */
  function brandNameFor(invite: Invite): string | null {
    if (invite.prefillBrandName) return invite.prefillBrandName;
    if (invite.submissionJson) {
      try {
        const data = JSON.parse(invite.submissionJson) as { brandName?: string };
        if (data.brandName && typeof data.brandName === "string") return data.brandName;
      } catch {
        // Corrupt JSON — fall through to null.
      }
    }
    return null;
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      PENDING: "bg-amber-100 text-amber-800 border-amber-200",
      SUBMITTED: "bg-blue-100 text-blue-800 border-blue-200",
      EXPIRED: "bg-gray-100 text-gray-700 border-gray-200",
      REVOKED: "bg-red-100 text-red-700 border-red-200",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-wider border ${colors[status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
        {status}
      </span>
    );
  }

  function sourceBadge(source: string) {
    // SELF_SERVE = lead applied directly via /apply/form (no invite)
    // INVITE     = Super Admin emailed the lead via /admin/brands
    const isSelfServe = source === "SELF_SERVE";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase tracking-wider border ${
          isSelfServe
            ? "bg-purple-100 text-purple-800 border-purple-200"
            : "bg-gray-50 text-black/60 border-black/10"
        }`}
        title={isSelfServe ? "Lead applied directly via /apply/form" : "Super Admin emailed the lead"}
      >
        {isSelfServe ? "Apply" : "Invite"}
      </span>
    );
  }

  const submittedInvites = invitesList.filter((i) => i.status === "SUBMITTED" && !i.appliedBrandId);
  const otherInvites = invitesList.filter((i) => !(i.status === "SUBMITTED" && !i.appliedBrandId));

  return (
    <div className="space-y-10">
      {/* ── Section 1: Create invite ───────────────────────────────── */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="text-lg font-bold text-black mb-1">Invite a brand lead</h2>
        <p className="text-xs text-black/70 mb-4">
          Sends an email with a unique 30-day URL. The lead fills the form, then you review + provision.
        </p>
        <form onSubmit={handleSend} className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-black/70 mb-1.5">
              Lead email <span className="text-[#FF005A]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lead@example.com"
              required
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-black/70 mb-1.5">
              Brand name (optional)
            </label>
            <input
              type="text"
              value={prefillName}
              onChange={(e) => setPrefillName(e.target.value)}
              placeholder="Danone"
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-black/70 mb-1.5">
              Brand slug (optional)
            </label>
            <input
              type="text"
              value={prefillSlug}
              onChange={(e) => setPrefillSlug(e.target.value)}
              placeholder="danone"
              pattern="[a-z0-9-]{2,40}"
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
            />
          </div>
          <div className="sm:col-span-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2 text-sm hover:bg-[#FF005A]/90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send invite
            </button>
          </div>
        </form>
      </section>

      {/* ── Section 2: Existing brands ────────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold text-black mb-3">Existing brands</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {brands.map((b) => (
            <div key={b.id} className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-white text-xs font-bold"
                  style={{ backgroundColor: b.primaryColor }}
                >
                  {b.wordmark.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="font-bold text-black text-sm">{b.displayName}</div>
                  <div className="text-[0.7rem] text-black/60 font-mono">/{b.slug}</div>
                </div>
              </div>
              <p className="text-[0.7rem] text-black/70 leading-snug">{b.tagline}</p>
              <div className="mt-2 flex items-center gap-2 text-[0.65rem] text-black/60">
                <span>{b._count.chapters} chapters</span>
                <span>·</span>
                <span>{b._count.users} users</span>
                <span>·</span>
                <span
                  className={`font-bold uppercase ${b.status === "ACTIVE" ? "text-[#007E72]" : "text-amber-700"}`}
                >
                  {b.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 3: Submitted invites (action queue) ──────────── */}
      {submittedInvites.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-black mb-1">Ready to provision ({submittedInvites.length})</h2>
          <p className="text-xs text-black/70 mb-3">Submissions awaiting your review.</p>
          <div className="space-y-3">
            {submittedInvites.map((i) => (
              <div key={i.id} className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-black text-sm">
                      {brandNameFor(i) || <span className="italic text-black/60">(no brand name)</span>}
                      {(() => {
                        // Show the brand slug from the submission for SELF_SERVE rows
                        // (where prefillBrandSlug is null) — gives the admin at-a-glance
                        // visibility into the requested URL slug too.
                        if (i.prefillBrandSlug) return <span className="ml-2 text-xs font-mono text-black/50">/{i.prefillBrandSlug}</span>;
                        if (i.submissionJson) {
                          try {
                            const d = JSON.parse(i.submissionJson) as { brandSlug?: string };
                            if (d.brandSlug) return <span className="ml-2 text-xs font-mono text-black/50">/{d.brandSlug}</span>;
                          } catch { /* ignore */ }
                        }
                        return null;
                      })()}
                    </div>
                    <div className="text-xs text-black/70 mt-0.5">
                      Submitted by {i.inviteeEmail} · {new Date(i.submittedAt || i.sentAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(i.status)}
                    {sourceBadge(i.source)}
                    <button
                      onClick={() => viewSubmission(i)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-black/15 bg-white text-black font-semibold px-3 py-1.5 text-xs hover:bg-black/5"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button
                      onClick={() => handleProvision(i)}
                      disabled={provisioningId === i.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#007E72] text-white font-semibold px-3 py-1.5 text-xs hover:bg-[#007E72]/90 disabled:opacity-50"
                    >
                      {provisioningId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Provision brand
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 4: All other invites ─────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold text-black mb-3">All invites ({otherInvites.length})</h2>
        {otherInvites.length === 0 ? (
          <p className="text-sm text-black/60">No invites yet — invite a brand lead above.</p>
        ) : (
          <div className="rounded-lg border border-black/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.03] text-[0.7rem] font-semibold uppercase tracking-wider text-black/60">
                <tr>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Brand</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Sent</th>
                  <th className="px-3 py-2 text-left">Expires</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {otherInvites.map((i) => (
                  <tr key={i.id} className="hover:bg-black/[0.02]">
                    <td className="px-3 py-2 text-black/80">{i.inviteeEmail}</td>
                    <td className="px-3 py-2 text-black/80">
                      {brandNameFor(i) || <span className="italic text-black/40">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {statusBadge(i.status)}
                        {sourceBadge(i.source)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-black/60 text-xs">{new Date(i.sentAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-black/60 text-xs">{new Date(i.expiresAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      {i.submissionJson ? (
                        <button
                          onClick={() => viewSubmission(i)}
                          className="text-xs text-[#FF005A] font-semibold hover:underline"
                        >
                          View submission
                        </button>
                      ) : i.status === "PENDING" ? (
                        <a
                          href={`/brand-onboarding/${i.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-black/60 hover:text-black"
                        >
                          <ExternalLink className="h-3 w-3" /> Form URL
                        </a>
                      ) : (
                        <span className="text-xs text-black/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Submission viewer modal ────────────────────────────── */}
      {viewingSubmission && (
        <SubmissionModal
          invite={viewingSubmission}
          onClose={() => setViewingSubmission(null)}
        />
      )}
    </div>
  );
}

function SubmissionModal({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  let data: Record<string, unknown> | null = null;
  try {
    data = invite.submissionJson ? JSON.parse(invite.submissionJson) : null;
  } catch {
    // ignore
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-black">
              {data ? String(data.brandName || invite.prefillBrandName || "Submission") : "Submission"}
            </h3>
            <p className="text-xs text-black/60">{invite.inviteeEmail}</p>
          </div>
          <button
            onClick={onClose}
            className="text-black/60 hover:text-black text-sm font-semibold"
          >
            Close ✕
          </button>
        </div>
        {data ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {Object.entries(data).map(([k, v]) => (
              <div key={k} className="border-b border-black/[0.06] pb-2">
                <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-black/50">{k}</dt>
                <dd className="text-black/80 mt-0.5 break-words">
                  {v === null || v === undefined || v === ""
                    ? <span className="italic text-black/40">—</span>
                    : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-black/60">No submission data.</p>
        )}
      </div>
    </div>
  );
}
