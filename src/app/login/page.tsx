import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { AiSalonLogoServer } from "@/components/brand/aisalon-logo-server";
import Image from "next/image";

export const metadata = {
  title: "Sign in — AI Salon Tel Aviv",
  description:
    "Sign in to AI Salon Tel Aviv — the community for AI builders, founders, CMOs and investors in Tel Aviv.",
  openGraph: {
    title: "Sign in — AI Salon Tel Aviv",
    description:
      "Sign in to AI Salon Tel Aviv — the community for AI builders in Tel Aviv.",
    images: [{ url: "/images/falafel-tlv-ai-salon.png", width: 1200, height: 630, alt: "AI Salon Tel Aviv" }],
  },
};

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/events");

  const callbackUrl = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("callbackUrl");

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      {/* Left — brand panel (black with AIS GRADIENT polyhedron motif) */}
      <section className="relative hidden md:flex flex-col justify-between p-12 ais-poly-bg overflow-hidden">
        {/* Top-left: stacked aisalon logo with Falafel Meerkat mark (white) */}
        <div className="relative z-10 text-white">
          <AiSalonLogoServer variant="horizontal-tagline" color="white" className="text-[2.4rem]" />
        </div>

        {/* Center: Falafel TLV brand image + chapter tagline */}
        <div className="relative z-10 text-white max-w-md">
          <div className="mb-6 relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white">
            <Image
              src="/images/falafel-tlv-ai-salon.png"
              alt="AI Salon Tel Aviv — Falafel mascot"
              fill
              sizes="(max-width: 768px) 240px, 320px"
              className="object-contain"
              priority
            />
          </div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#00E6FF] mb-4">
            Tel Aviv Chapter
          </p>
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-[1.05] mb-5">
            The community for <span className="ais-gradient-text">AI builders</span> in Tel Aviv.
          </h1>
          <p className="text-white/70 text-base leading-relaxed">
            Sign in to access events, upload photos from our gatherings, browse the shared
            slideshow, and connect with fellow founders, CMOs, investors and AI builders.
          </p>
        </div>

        {/* Bottom-left: MassaPro credit */}
        <div className="relative z-10 text-white/50 text-xs">
          Platform by{" "}
          <a
            href="https://massapro.com"
            className="text-white/80 underline-offset-4 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            MassaPro
          </a>{" "}
          · Powered by AI Salon
        </div>

        {/* Decorative AIS GRADIENT orb */}
        <div
          aria-hidden
          className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "conic-gradient(from 180deg at 50% 50%, #FF005A, #820A7D, #004F98, #00E6FF, #FF005A)",
          }}
        />
      </section>

      {/* Right — login form (white) */}
      <section className="flex flex-col justify-center p-8 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-sm mx-auto">
          {/* Mobile-only logo with Falafel Meerkat mark */}
          <div className="md:hidden mb-8 flex flex-col items-center text-center">
            <AiSalonLogoServer variant="horizontal-tagline" color="black" className="text-[1.6rem]" />
            <div className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-black/60">
              Tel Aviv · Empowering AI Connections
            </div>
          </div>

          <h2 className="text-2xl font-extrabold text-black mb-1">Welcome</h2>
          <p className="text-sm text-black/60 mb-8">
            Enter your name and email to join the AI Salon Tel Aviv community.
          </p>

          <LoginForm callbackUrl={callbackUrl ?? undefined} />

          <p className="mt-8 text-xs text-black/40 leading-relaxed">
            By signing in you agree to the AI Salon community guidelines. Only registered
            members can attend events.
          </p>
        </div>
      </section>
    </main>
  );
}
