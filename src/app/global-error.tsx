"use client";

/**
 * global-error.tsx
 *
 * Next.js App Router's outermost error boundary. Catches errors that
 * escape the root layout itself (e.g. errors thrown by the layout's
 * server component, or by a deeply nested route segment that has no
 * nearer error.tsx).
 *
 * Unlike error.tsx, this file REPLACES the root layout while it is
 * shown — so it must render its own <html> and <body> tags.
 */

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in the dev console so it doesn't fail silently.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-black antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-white p-8 shadow-sm">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em] text-[#FF005A] mb-3">
              Something went wrong
            </p>
            <h1 className="text-2xl font-extrabold mb-3">
              The page hit an unexpected error
            </h1>
            <p className="text-sm text-black/70 mb-6">
              We've logged the error. You can try the action again — if the
              problem persists, head back to events or sign in again.
            </p>

            {error?.message ? (
              <pre className="mb-6 max-h-40 overflow-auto rounded-md bg-black/5 p-3 text-xs font-mono text-black/70 whitespace-pre-wrap break-words">
                {error.message}
                {error.digest ? `\n[digest: ${error.digest}]` : ""}
              </pre>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center gap-2 rounded-md bg-[#FF005A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#FF005A]/90"
              >
                Try again
              </button>
              <Link
                href="/events"
                className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2.5 text-sm font-semibold text-black hover:bg-black/5"
              >
                Back to events
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-black/60 hover:text-black"
              >
                Sign in
              </Link>
            </div>
          </div>

          <p className="mt-6 text-xs text-black/40">
            © {new Date().getFullYear()} AI Salon Tel Aviv
          </p>
        </main>
      </body>
    </html>
  );
}
