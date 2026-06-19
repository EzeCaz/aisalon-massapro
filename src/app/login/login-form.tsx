"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, Lock, User, ArrowRight, Send } from "lucide-react";

type Props = { callbackUrl?: string };

type Tab = "google" | "signin" | "signup";

// Map next-auth error codes to human-readable messages.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthCallbackError:
    "Google rejected our sign-in request. The site admin needs to add this redirect URI to the Google Cloud Console: https://aisalon.massapro.com/api/auth/callback/google — meanwhile, please use the Sign up tab to sign in by email.",
  OAuthAccountNotLinked:
    "That email is already linked to a Google account. Please sign in with Google instead.",
  Callback:
    "Google sign-in failed. Please try again, or use email sign-in instead.",
  Configuration:
    "The server isn't configured for Google sign-in yet. Please use email sign-in instead.",
  AccessDenied: "Sign-in was denied. Please try again.",
  Verification:
    "We couldn't verify your sign-in token. Please try again.",
  Default: "Something went wrong during sign-in. Please try again.",
};

export function LoginForm({ callbackUrl }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const finalCallback = callbackUrl || params.get("callbackUrl") || "/events";

  const [tab, setTab] = useState<Tab>("google");
  const [loading, setLoading] = useState<"google" | "email" | "signup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Show a friendly error if next-auth redirected back with ?error=...
  useEffect(() => {
    const errCode = params.get("error");
    if (errCode) {
      setError(OAUTH_ERROR_MESSAGES[errCode] || OAUTH_ERROR_MESSAGES.Default);
    }
  }, [params]);

  // Sign-in (existing user) form
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  // Sign-up (new user) form
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");

  const isDev = process.env.NODE_ENV !== "production";

  async function googleSignIn() {
    setError(null);
    setInfo(null);
    setLoading("google");
    try {
      // Use redirect:true (default) so the browser navigates to Google OAuth.
      // We wrap in try/catch to surface any unexpected network errors.
      await signIn("google", { callbackUrl: finalCallback });
    } catch (err) {
      console.error(err);
      setError("Could not start Google sign-in. Please try again.");
      setLoading(null);
    }
  }

  async function emailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signinEmail || !signinPassword) return;
    setError(null);
    setInfo(null);
    setLoading("email");
    const res = await signIn("email", {
      email: signinEmail,
      password: signinPassword,
      redirect: false,
      callbackUrl: finalCallback,
    });
    setLoading(null);
    if (res?.error) {
      setError("Incorrect email or password. If you forgot your password, use the Sign-up tab to receive a new one by email.");
    } else if (res?.ok) {
      router.push(finalCallback);
      router.refresh();
    } else {
      setError("Sign-in failed. Please try again.");
    }
  }

  async function emailSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!signupEmail || !signupName) return;
    setError(null);
    setInfo(null);
    setLoading("signup");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupEmail, name: signupName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign-up failed.");
      } else {
        setInfo(data.message || "Check your email for your password.");
        setSignupName("");
        setSignupEmail("");
        // Switch to the sign-in tab so the user can paste their password
        setTab("signin");
      }
    } catch (err) {
      console.error(err);
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-black/5 rounded-lg">
        <TabButton active={tab === "google"} onClick={() => { setTab("google"); setError(null); setInfo(null); }}>
          Google
        </TabButton>
        <TabButton active={tab === "signin"} onClick={() => { setTab("signin"); setError(null); setInfo(null); }}>
          Sign in
        </TabButton>
        <TabButton active={tab === "signup"} onClick={() => { setTab("signup"); setError(null); setInfo(null); }}>
          Sign up
        </TabButton>
      </div>

      {/* Google tab */}
      {tab === "google" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={googleSignIn}
            disabled={loading !== null}
            className="w-full inline-flex items-center justify-center gap-3 rounded-md bg-black text-white font-semibold px-5 py-3.5 text-sm hover:bg-black/90 disabled:opacity-50 ais-lift"
          >
            <GoogleIcon />
            {loading === "google" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
              </>
            ) : (
              "Continue with Google"
            )}
          </button>
          <p className="text-center text-xs text-black/50">
            Use the Sign up tab to receive a password by email instead.
          </p>
        </div>
      )}

      {/* Sign in (existing user) tab */}
      {tab === "signin" && (
        <form onSubmit={emailSignIn} className="space-y-3">
          <Field
            label="Email"
            icon={<Mail className="h-4 w-4" />}
            type="email"
            placeholder="you@example.com"
            value={signinEmail}
            onChange={setSigninEmail}
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            icon={<Lock className="h-4 w-4" />}
            type="password"
            placeholder="Your password"
            value={signinPassword}
            onChange={setSigninPassword}
            autoComplete="current-password"
            required
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-5 py-3 text-sm hover:bg-black/90 disabled:opacity-50 ais-lift"
          >
            {loading === "email" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : (
              <>
                Sign in <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          <p className="text-center text-xs text-black/50">
            Forgot your password? Use the{" "}
            <button
              type="button"
              className="underline text-[#004F98] hover:text-[#004F98]/80"
              onClick={() => { setTab("signup"); setError(null); }}
            >
              Sign up
            </button>{" "}
            tab — we'll email you a new one.
          </p>
        </form>
      )}

      {/* Sign up (new user — password emailed) tab */}
      {tab === "signup" && (
        <form onSubmit={emailSignUp} className="space-y-3">
          <Field
            label="Name"
            icon={<User className="h-4 w-4" />}
            type="text"
            placeholder="Your full name"
            value={signupName}
            onChange={setSignupName}
            autoComplete="name"
            required
          />
          <Field
            label="Email"
            icon={<Mail className="h-4 w-4" />}
            type="email"
            placeholder="you@example.com"
            value={signupEmail}
            onChange={setSignupEmail}
            autoComplete="email"
            required
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#004F98] text-white font-semibold px-5 py-3 text-sm hover:bg-[#004F98]/90 disabled:opacity-50 ais-lift"
          >
            {loading === "signup" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending password…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Send me a password
              </>
            )}
          </button>
          <p className="text-center text-xs text-black/50 leading-relaxed">
            We'll create your account and email you a one-time password.
            Use it to sign in, then change it from your profile.
          </p>
        </form>
      )}

      {error && (
        <div className="rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-2 text-sm text-[#FF005A]">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-[#00E6FF]/40 bg-[#00E6FF]/10 px-3 py-2 text-sm text-[#004F98]">
          {info}
        </div>
      )}

      {isDev && (
        <details className="mt-2 group">
          <summary className="text-xs text-black/40 cursor-pointer hover:text-black/60 select-none">
            Dev sign-in (any email, no password)
          </summary>
          <DevSignIn
            callbackUrl={finalCallback}
            onDone={() => { router.push(finalCallback); router.refresh(); }}
          />
        </details>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
        active ? "bg-white text-black shadow-sm" : "text-black/60 hover:text-black"
      }`}
    >
      {children}
    </button>
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

function DevSignIn({
  callbackUrl,
  onDone,
}: {
  callbackUrl: string;
  onDone: () => void;
}) {
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");
  const [busy, setBusy] = useState(false);

  async function devSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!devEmail) return;
    setBusy(true);
    const res = await signIn("dev", {
      email: devEmail,
      name: devName || devEmail.split("@")[0],
      redirect: false,
      callbackUrl,
    });
    setBusy(false);
    if (res?.ok) onDone();
  }

  return (
    <form onSubmit={devSignIn} className="mt-3 space-y-3">
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
        disabled={busy}
        className="w-full rounded-md border border-black/20 bg-white text-black font-semibold px-5 py-2.5 text-sm hover:bg-black/5 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in (dev)"}
      </button>
      <p className="text-[10px] text-black/40">
        Tip: sign in as <span className="font-mono">eze@massapro.com</span> to become admin.
      </p>
    </form>
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
