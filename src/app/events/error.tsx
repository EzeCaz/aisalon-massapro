"use client";

/**
 * error.tsx — route-level error boundary for /events.
 *
 * Catches any error thrown by the /events page's server component
 * (e.g. DB query failure, schema drift, missing table/column) and
 * displays the actual error message + digest so we can debug
 * production issues without needing Vercel log access.
 *
 * Note: in production builds, Next.js hides the underlying error
 * message and only surfaces a `digest` property by default. This
 * boundary reads `error.message` AND `error.digest` so we get
 * whatever info is available.
 */

import { useEffect } from "react";
import Link from "next/link";

export default function EventsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in browser console + Vercel runtime logs.
    console.error("[/events error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="rounded-2xl border border-[#FF005A]/20 bg-white p-8 shadow-sm">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em] text-[#FF005A] mb-3">
            Events page error
          </p>
          <h1 className="text-2xl font-extrabold text-black mb-3">
            Something went wrong loading events
          </h1>
          <p className="text-sm text-black/70 mb-6">
            We&apos;ve logged the error. You can try again, or head back home.
          </p>

          {error?.message ? (
            <pre className="mb-4 max-h-60 overflow-auto rounded-md bg-black/5 p-3 text-xs font-mono text-black/80 whitespace-pre-wrap break-words">
              {error.message}
              {error.digest ? `\n[digest: ${error.digest}]` : ""}
              {error.name ? `\n[name: ${error.name}]` : ""}
              {error.stack ? `\n[stack: ${error.stack.split("\n").slice(0, 5).join("\n")}]` : ""}
            </pre>
          ) : error?.digest ? (
            <pre className="mb-4 max-h-40 overflow-auto rounded-md bg-black/5 p-3 text-xs font-mono text-black/80 whitespace-pre-wrap break-words">
              [digest: {error.digest}]
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
              href="/"
              className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2.5 text-sm font-semibold text-black hover:bg-black/5"
            >
              Back to home
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-black/80 hover:text-black"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
