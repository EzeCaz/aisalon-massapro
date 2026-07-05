"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, KeyRound, Lock, Check, Eye, EyeOff, ArrowRight } from "lucide-react";

type Props = {
  hasPassword: boolean;
  email: string;
  name: string | null;
};

/**
 * SetPasswordForm — used on /set-password.
 *
 * Same shape as the ChangePasswordCard on /profile, but with one
 * behavioral difference: on success, the user is redirected away
 * (to /onboarding if they still need to fill the intake form, or
 * /events otherwise) — they can't navigate anywhere else until the
 * flag is cleared.
 *
 * If the user has a passwordHash (they used a temp password to log in),
 * the form verifies their current password. If they don't have one
 * (Google-only user), no current password is required.
 */
export function SetPasswordForm({ hasPassword, email, name }: Props) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    (hasPassword ? currentPassword.length > 0 : true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const t = toast.loading("Setting your new password…");
    try {
      // Use /api/auth/change-password (which clears mustSetPassword)
      // if the user has a current password; otherwise use
      // /api/profile/set-password (same effect, no current required).
      const url = hasPassword ? "/api/auth/change-password" : "/api/profile/set-password";
      const body = hasPassword
        ? { currentPassword, newPassword }
        : { newPassword };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      toast.success("Password set. Redirecting…", { id: t });
      // Refresh so the server re-evaluates the mustSetPassword flag and
      // redirects to the right place (onboarding or /events).
      router.refresh();
      // Fallback hard navigation in case router.refresh doesn't redirect.
      setTimeout(() => router.push("/events"), 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save password.", {
        id: t,
        duration: 8000,
      });
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-black/10 bg-white p-6 shadow-sm"
    >
      <div className="rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-2 text-xs text-[#FF005A]">
        <strong>Required:</strong> You must set a new password before you can access the
        rest of the platform.
      </div>

      {hasPassword && (
        <label className="block">
          <span className="block text-xs font-semibold text-black/70 mb-1.5">
            Current password
          </span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/80">
              <Lock className="h-4 w-4" />
            </span>
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="The password you just used to log in"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-black/15 bg-white pl-9 pr-10 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/80 hover:text-black/70"
              tabIndex={-1}
              aria-label={showCurrent ? "Hide" : "Show"}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-black/80">
            This is the temporary password you just used to sign in as{" "}
            <span className="font-mono">{email}</span>.
          </p>
        </label>
      )}

      <label className="block">
        <span className="block text-xs font-semibold text-black/70 mb-1.5">
          New password
        </span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/80">
            <KeyRound className="h-4 w-4" />
          </span>
          <input
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
            className="w-full rounded-md border border-black/15 bg-white pl-9 pr-10 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/80 hover:text-black/70"
            tabIndex={-1}
            aria-label={showNew ? "Hide" : "Show"}
          >
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-black/80">
          {newPassword.length === 0
            ? "8–128 characters. Pick something memorable but unique."
            : newPassword.length < 8
            ? `${newPassword.length}/8 — too short.`
            : `${newPassword.length} characters — good.`}
        </p>
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-black/70 mb-1.5">
          Confirm new password
        </span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/80">
            <Check className="h-4 w-4" />
          </span>
          <input
            type={showNew ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter the new password"
            autoComplete="new-password"
            required
            className="w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors"
          />
        </div>
        <p className="mt-1 text-[11px] text-black/80">
          {confirmPassword.length === 0
            ? "Must match the new password."
            : confirmPassword === newPassword
            ? "Matches."
            : "Doesn't match yet."}
        </p>
      </label>

      <button
        type="submit"
        disabled={busy || !canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-5 py-3 text-sm hover:bg-black/90 disabled:opacity-50 ais-lift"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Setting password…
          </>
        ) : (
          <>
            Set password <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="text-center text-[11px] text-black/80">
        Logged in as <span className="font-mono">{email}</span>
        {name ? ` (${name})` : ""}.
      </p>
    </form>
  );
}
