export const metadata = {
  title: "Terms of Service — AI Salon Tel Aviv",
  description: "Terms for participating in the AI Salon Tel Aviv community.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold text-black mb-6">Terms of Service</h1>
        <div className="prose prose-sm max-w-none text-black/70 space-y-4">
          <p>
            By creating an account on AI Salon Tel Aviv (operated by MassaPro) you agree to
            participate respectfully and constructively in the community. The platform is intended
            for AI builders, founders, CMOs, investors and friends of the Tel Aviv AI ecosystem.
          </p>
          <p>
            You agree not to: (1) harass, discriminate against, or impersonate other members;
            (2) spam the platform, scrape member data, or use automated tools without permission;
            (3) upload offensive, illegal, or copyrighted material you do not have rights to;
            (4) attempt to compromise the security of the platform.
          </p>
          <p>
            Event registrations are personal. Only registered members may attend in-person events,
            and attendance may be subject to additional venue-specific rules communicated per
            event.
          </p>
          <p>
            MassaPro reserves the right to suspend or terminate accounts that violate these terms.
            We may update these terms from time to time; continued use of the platform constitutes
            acceptance of the latest version.
          </p>
          <p className="text-xs text-black/80">Last updated: June 2026</p>
        </div>
        <a href="/login" className="inline-block mt-8 text-sm font-semibold text-black underline">
          ← Back to login
        </a>
      </div>
    </main>
  );
}
