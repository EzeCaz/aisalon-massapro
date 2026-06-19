"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Props = { callbackUrl?: string };

export function LoginForm({ callbackUrl }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const finalCallback = callbackUrl || params.get("callbackUrl") || "/events";

  const [loading, setLoading] = useState<"google" | "dev" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dev-only email form
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");
  const isDev = process.env.NODE_ENV !== "production";

  async function googleSignIn() {
    setError(null);
    setLoading("google");
    // next-auth redirect flow — page will reload on success
    await signIn("google", { callbackUrl: finalCallback });
  }

  async function devSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!devEmail) return;
    setError(null);
    setLoading("dev");
    const res = await signIn("credentials", {
      email: devEmail,
      name: devName || devEmail.split("@")[0],
      redirect: false,
      callbackUrl: finalCallback,
    });
    setLoading(null);
    if (res?.error) {
      setError(res.error);
    } else if (res?.ok) {
      router.push(finalCallback);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={googleSignIn}
        disabled={loading !== null}
        className="w-full inline-flex items-center justify-center gap-3 rounded-md bg-black text-white font-semibold px-5 py-3.5 text-sm hover:bg-black/90 disabled:opacity-50 ais-lift"
      >
        <GoogleIcon />
        {loading === "google" ? "Connecting…" : "Continue with Google"}
      </button>

      {isDev && (
        <details className="mt-6 group">
          <summary className="text-xs text-black/50 cursor-pointer hover:text-black/70 select-none">
            Dev sign-in (any email)
          </summary>
          <form onSubmit={devSignIn} className="mt-4 space-y-3">
            <input
              type="email"
              placeholder="you@example.com"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              required
            />
            <input
              type="text"
              placeholder="Your name (optional)"
              value={devName}
              onChange={(e) => setDevName(e.target.value)}
              className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="w-full rounded-md border border-black/20 bg-white text-black font-semibold px-5 py-2.5 text-sm hover:bg-black/5 disabled:opacity-50"
            >
              {loading === "dev" ? "Signing in…" : "Sign in (dev)"}
            </button>
            <p className="text-[10px] text-black/40">
              Tip: sign in as <span className="font-mono">eze@massapro.com</span> to become admin.
            </p>
          </form>
        </details>
      )}

      {error && (
        <div className="rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-2 text-sm text-[#FF005A]">
          {error}
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
