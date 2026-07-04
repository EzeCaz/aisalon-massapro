import { Suspense } from "react";

export const metadata = {
  title: "Privacy Policy — AI Salon Tel Aviv",
  description: "How AI Salon Tel Aviv handles your personal data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold text-black mb-6">Privacy Policy</h1>
        <div className="prose prose-sm max-w-none text-black/70 space-y-4">
          <p>
            AI Salon Tel Aviv (operated by MassaPro) collects the minimum personal data needed to
            run the community: your name, email address, and any profile information you choose to
            add (photo, bio, company, links). We use this data to organise events, manage
            membership, and send you essential community updates.
          </p>
          <p>
            We do not sell your data to third parties. We share event-related information with
            other registered members only to the extent necessary for community interaction (e.g.
            showing your name and photo on attendee lists).
          </p>
          <p>
            Authentication is handled via NextAuth. When you sign in with Google, we receive your
            Google profile name and email; we never see or store your Google password. When you
            sign in with email + password, only a bcrypt hash of your password is stored.
          </p>
          <p>
            You can request deletion of your account and associated data at any time by contacting
            the admin at <a href="mailto:eze@massapro.com" className="text-black underline">eze@massapro.com</a>.
          </p>
          <p className="text-xs text-black/40">Last updated: June 2026</p>
        </div>
        <a href="/login" className="inline-block mt-8 text-sm font-semibold text-black underline">
          ← Back to login
        </a>
      </div>
    </main>
  );
}
