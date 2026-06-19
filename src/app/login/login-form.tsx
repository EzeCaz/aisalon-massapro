"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, User, ArrowRight } from "lucide-react";

type Props = { callbackUrl?: string };

// Temporary single-option login: email + name → instant access.
// Google OAuth and email/password have been hidden while we resolve
// (1) Google redirect_uri_mismatch and (2) SMTP delivery for passwords.
// To restore the multi-tab login, see git history of this file.

export function LoginForm({ callbackUrl }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const finalCallback = callbackUrl || params.get("callbackUrl") || "/events";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show a friendly error if next-auth redirected back with ?error=...
  useEffect(() => {
    const errCode = params.get("error");
    if (errCode) {
      setError("Sign-in was interrupted. Please try again.");
    }
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setLoading(true);
    const res = await signIn("dev", {
      email,
      name: name || email.split("@")[0],
      redirect: false,
      callbackUrl: finalCallback,
    });
    setLoading(false);
    if (res?.ok) {
      router.push(finalCallback);
      router.refresh();
    } else {
      setError("Sign-in failed. Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="Name"
          icon={<User className="h-4 w-4" />}
          type="text"
          placeholder="Your full name"
          value={name}
          onChange={setName}
          autoComplete="name"
        />
        <Field
          label="Email"
          icon={<Mail className="h-4 w-4" />}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-5 py-3 text-sm hover:bg-black/90 disabled:opacity-50 ais-lift"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
            </>
            ) : (
              <>
                Sign in <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        <p className="text-center text-xs text-black/50 leading-relaxed">
          Enter your name and email to access the AI Salon Tel Aviv community.
        </p>
      </form>

      {error && (
        <div className="rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-2 text-sm text-[#FF005A]">
          {error}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-black/70 mb-1.5">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40">{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          className="w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-colors"
        />
      </div>
    </label>
  );
}
