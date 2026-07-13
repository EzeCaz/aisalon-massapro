"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Mail,
  MailOpen,
  MousePointerClick,
  Calendar,
  CheckCircle2,
  DoorOpen,
  UserPlus,
  UserCheck,
  MessageSquare,
  MessageCircle,
  Megaphone,
  Save,
  Sparkles,
  Ban,
  AlertCircle,
  Search,
  Download,
  Loader2,
  ExternalLink,
  Ticket,
} from "lucide-react";

type FeedItem = {
  timestamp: string;
  type: string;
  summary: string;
  details?: Record<string, unknown>;
};

type ActivityReport = {
  query: { email: string; requestedAt: string };
  resolvedVia: string;
  profile: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    company: string | null;
    title: string | null;
    bio: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
    photoUrl: string | null;
    utmUid: string | null;
    createdAt: string;
    onboardedAt: string | null;
    importSource: string | null;
    importedAt: string | null;
    interestedIn: string | null;
    profileCategories: string | null;
    appliedFor: string | null;
    invitedToSpeak: string | null;
    mobile: string | null;
    tags: { id: string; label: string; color: string | null }[];
    secondaryEmails: { email: string; label: string | null }[];
  };
  summary: {
    accountCreated: string;
    onboardedAt: string | null;
    totalEmailsQueued: number;
    emailsSent: number;
    emailsOpened: number;
    emailsClicked: number;
    emailsSkipped: number;
    emailsFailed: number;
    totalRSVPs: number;
    doorCheckIns: number;
    attended: number;
    coHostedEvents: number;
    speakerSlots: number;
    referralVisits: number;
    referralConversions: number;
    dmsSent: number;
    dmsReceived: number;
    quizSessionsHosted: number;
  };
  feed: FeedItem[];
  raw: {
    emails: any[];
    rsvps: any[];
    coHosted: any[];
    speakerSlots: any[];
    referralVisits: any[];
    referralConversions: any[];
    mySignupAttribution: any;
    messagesSent: any[];
    messagesReceived: any[];
    quizHosted: any[];
  };
};

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  ACCOUNT_CREATED: { icon: UserPlus, color: "text-emerald-600", label: "Account created" },
  PROFILE_ONBOARDED: { icon: UserCheck, color: "text-emerald-600", label: "Onboarding" },
  SIGNUP_ATTRIBUTED: { icon: Sparkles, color: "text-fuchsia-600", label: "Attribution" },
  RSVP_CREATED: { icon: Calendar, color: "text-blue-600", label: "RSVP" },
  CHECKIN_CODE_GENERATED: { icon: Ticket, color: "text-blue-600", label: "Check-in code" },
  DOOR_CHECKED_IN: { icon: DoorOpen, color: "text-emerald-600", label: "Door check-in" },
  RSVP_APPROVED: { icon: CheckCircle2, color: "text-amber-600", label: "Approval" },
  ATTENDANCE_MARKED: { icon: CheckCircle2, color: "text-emerald-600", label: "Attendance" },
  EMAIL_QUEUED: { icon: Mail, color: "text-zinc-500", label: "Email queued" },
  EMAIL_SENT: { icon: Mail, color: "text-blue-600", label: "Email sent" },
  EMAIL_OPENED: { icon: MailOpen, color: "text-emerald-600", label: "Email opened" },
  EMAIL_LINK_CLICKED: { icon: MousePointerClick, color: "text-fuchsia-600", label: "Email click" },
  COHOST_ADDED: { icon: UserCheck, color: "text-amber-600", label: "Co-host" },
  SPEAKER_SLOT: { icon: Megaphone, color: "text-amber-600", label: "Speaker" },
  REFERRAL_VISIT: { icon: ExternalLink, color: "text-fuchsia-600", label: "Referral visit" },
  REFERRAL_CONVERTED: { icon: Sparkles, color: "text-emerald-600", label: "Referral conversion" },
  DM_SENT: { icon: MessageSquare, color: "text-blue-600", label: "DM sent" },
  DM_RECEIVED: { icon: MessageCircle, color: "text-zinc-600", label: "DM received" },
  QUIZ_HOSTED: { icon: Activity, color: "text-purple-600", label: "Quiz hosted" },
  MOCKUP_DEFAULT_SAVED: { icon: Save, color: "text-zinc-600", label: "Mockup saved" },
};

export function ActivityReportClient({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [emailInput, setEmailInput] = useState(initialEmail || "jasper@aisalon.ai");
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const fetchReport = useCallback(
    async (email: string) => {
      setLoading(true);
      setError(null);
      setReport(null);
      try {
        const res = await fetch(
          `/api/admin/members/activity-report?email=${encodeURIComponent(email)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load report");
          return;
        }
        setReport(data);
      } catch (e: any) {
        setError(e.message || "Network error");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-fetch on first load if email is in URL.
  useEffect(() => {
    const e = searchParams.get("email");
    if (e) {
      setEmailInput(e);
      fetchReport(e);
    }
  }, [searchParams, fetchReport]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    // Update URL so the link is shareable.
    const url = new URL(window.location.href);
    url.searchParams.set("email", trimmed);
    window.history.replaceState({}, "", url.toString());
    fetchReport(trimmed);
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeEmail = report.profile.email.replace(/[^a-z0-9._@-]/gi, "_");
    a.download = `activity-report-${safeEmail}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredFeed = report
    ? filter === "ALL"
      ? report.feed
      : report.feed.filter((f) => f.type === filter)
    : [];

  return (
    <div className="space-y-6">
      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="member@email.com"
          className="flex-1 min-w-[260px] h-10 px-3 text-sm rounded-md border border-black/15 bg-white focus:outline-none focus:ring-2 focus:ring-[#FF005A]/30 focus:border-[#FF005A]/40"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-10 px-4 rounded-md bg-black text-white text-sm font-semibold hover:bg-black/85 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Load report
        </button>
        {report && (
          <button
            type="button"
            onClick={handleDownload}
            className="h-10 px-3 rounded-md border border-black/15 text-sm font-semibold hover:bg-black/5 flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" />
            JSON
          </button>
        )}
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong className="font-semibold">Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !report && (
        <div className="rounded-lg border border-black/10 bg-white p-12 flex items-center justify-center text-black/50 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading activity report…
        </div>
      )}

      {/* Report */}
      {report && (
        <>
          {/* Profile header */}
          <div className="rounded-lg border border-black/10 bg-white p-5">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="h-14 w-14 rounded-full bg-[#FF005A]/10 flex items-center justify-center text-[#FF005A] font-bold text-lg overflow-hidden flex-shrink-0">
                {report.profile.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={report.profile.photoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (report.profile.name || report.profile.email)[0]?.toUpperCase() || "?"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-black">
                  {report.profile.name || "(no name)"}
                </h2>
                <p className="text-sm text-black/70">{report.profile.email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-black/5 font-mono">{report.profile.role}</span>
                  {report.profile.company && (
                    <span className="px-2 py-0.5 rounded bg-black/5">{report.profile.company}</span>
                  )}
                  {report.profile.title && (
                    <span className="px-2 py-0.5 rounded bg-black/5">{report.profile.title}</span>
                  )}
                  {report.profile.tags.map((t) => (
                    <span
                      key={t.id}
                      className="px-2 py-0.5 rounded text-white text-[0.65rem]"
                      style={{ backgroundColor: t.color || "#666" }}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.7rem] text-black/50">
                  Account created {new Date(report.profile.createdAt).toLocaleString()}
                  {report.profile.onboardedAt
                    ? ` · onboarded ${new Date(report.profile.onboardedAt).toLocaleString()}`
                    : " · NOT YET ONBOARDED"}
                  {report.profile.importSource && ` · imported from ${report.profile.importSource}`}
                  {` · resolved via ${report.resolvedVia}`}
                </p>
                {report.profile.secondaryEmails.length > 0 && (
                  <p className="mt-1 text-[0.7rem] text-black/50">
                    Secondary emails:{" "}
                    {report.profile.secondaryEmails
                      .map((e) => `${e.email}${e.label ? ` (${e.label})` : ""}`)
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <StatCard label="Emails sent" value={report.summary.emailsSent} icon={Mail} color="text-blue-600" />
            <StatCard label="Emails opened" value={report.summary.emailsOpened} icon={MailOpen} color="text-emerald-600" />
            <StatCard label="Emails clicked" value={report.summary.emailsClicked} icon={MousePointerClick} color="text-fuchsia-600" />
            <StatCard label="Emails skipped" value={report.summary.emailsSkipped} icon={Ban} color="text-zinc-500" />
            <StatCard label="RSVPs" value={report.summary.totalRSVPs} icon={Calendar} color="text-blue-600" />
            <StatCard label="Door check-ins" value={report.summary.doorCheckIns} icon={DoorOpen} color="text-emerald-600" />
            <StatCard label="Attended" value={report.summary.attended} icon={CheckCircle2} color="text-emerald-600" />
            <StatCard label="Co-hosted events" value={report.summary.coHostedEvents} icon={UserCheck} color="text-amber-600" />
            <StatCard label="Speaker slots" value={report.summary.speakerSlots} icon={Megaphone} color="text-amber-600" />
            <StatCard label="Referral visits" value={report.summary.referralVisits} icon={ExternalLink} color="text-fuchsia-600" />
            <StatCard label="Referral signups" value={report.summary.referralConversions} icon={Sparkles} color="text-emerald-600" />
            <StatCard label="DMs sent / recv" value={`${report.summary.dmsSent} / ${report.summary.dmsReceived}`} icon={MessageSquare} color="text-blue-600" />
          </div>

          {/* Feed */}
          <div className="rounded-lg border border-black/10 bg-white">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <h3 className="text-sm font-bold text-black">
                Chronological activity feed
                <span className="ml-2 text-xs font-normal text-black/50">
                  {filteredFeed.length} {filteredFeed.length === 1 ? "entry" : "entries"}
                </span>
              </h3>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 px-2 text-xs rounded border border-black/15 bg-white"
              >
                <option value="ALL">All types</option>
                <option value="ACCOUNT_CREATED">Account</option>
                <option value="EMAIL_QUEUED">Emails queued</option>
                <option value="EMAIL_SENT">Emails sent</option>
                <option value="EMAIL_OPENED">Emails opened</option>
                <option value="EMAIL_LINK_CLICKED">Email clicks</option>
                <option value="RSVP_CREATED">RSVPs</option>
                <option value="DOOR_CHECKED_IN">Door check-ins</option>
                <option value="ATTENDANCE_MARKED">Attendance</option>
                <option value="COHOST_ADDED">Co-host</option>
                <option value="SPEAKER_SLOT">Speaker</option>
                <option value="REFERRAL_VISIT">Referral visits</option>
                <option value="REFERRAL_CONVERTED">Referral signups</option>
                <option value="DM_SENT">DMs sent</option>
                <option value="DM_RECEIVED">DMs received</option>
                <option value="QUIZ_HOSTED">Quiz hosted</option>
                <option value="MOCKUP_DEFAULT_SAVED">Mockup saved</option>
              </select>
            </div>
            <div className="divide-y divide-black/5 max-h-[800px] overflow-y-auto">
              {filteredFeed.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-black/50">
                  No activity entries for this filter.
                </div>
              ) : (
                filteredFeed.map((item, i) => {
                  const meta = TYPE_META[item.type] || { icon: Activity, color: "text-zinc-500", label: item.type };
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="px-4 py-3 flex gap-3 hover:bg-black/[0.02]">
                      <div className="flex-shrink-0 mt-0.5">
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <p className="text-sm text-black">
                            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-black/40 mr-2">
                              {meta.label}
                            </span>
                            {item.summary}
                          </p>
                          <p className="text-[0.7rem] text-black/50 whitespace-nowrap font-mono">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {item.details && Object.keys(item.details).length > 0 && (
                          <details className="mt-1.5">
                            <summary className="text-[0.7rem] text-black/40 cursor-pointer hover:text-black/70">
                              Details
                            </summary>
                            <pre className="mt-1 text-[0.7rem] bg-black/[0.03] rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                              {JSON.stringify(item.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Raw data tables */}
          <details className="rounded-lg border border-black/10 bg-white">
            <summary className="px-4 py-3 text-sm font-bold cursor-pointer hover:bg-black/[0.02]">
              Raw data tables (emails, RSVPs, referrals, DMs, …)
            </summary>
            <div className="px-4 pb-4 space-y-4">
              <RawSection title={`Emails (${report.raw.emails.length})`} rows={report.raw.emails} />
              <RawSection title={`RSVPs (${report.raw.rsvps.length})`} rows={report.raw.rsvps} />
              <RawSection title={`Co-hosted events (${report.raw.coHosted.length})`} rows={report.raw.coHosted} />
              <RawSection title={`Speaker slots (${report.raw.speakerSlots.length})`} rows={report.raw.speakerSlots} />
              <RawSection title={`Referral visits driven (${report.raw.referralVisits.length})`} rows={report.raw.referralVisits} />
              <RawSection title={`Referral signups driven (${report.raw.referralConversions.length})`} rows={report.raw.referralConversions} />
              <RawSection
                title={report.raw.mySignupAttribution ? "My signup attribution" : "My signup attribution (none)"}
                rows={report.raw.mySignupAttribution ? [report.raw.mySignupAttribution] : []}
              />
              <RawSection title={`DMs sent (${report.raw.messagesSent.length})`} rows={report.raw.messagesSent} />
              <RawSection title={`DMs received (${report.raw.messagesReceived.length})`} rows={report.raw.messagesReceived} />
              <RawSection title={`Quiz sessions hosted (${report.raw.quizHosted.length})`} rows={report.raw.quizHosted} />
            </div>
          </details>
        </>
      )}

      {/* Initial empty state */}
      {!report && !loading && !error && (
        <div className="rounded-lg border border-dashed border-black/15 bg-white p-12 text-center">
          <Activity className="h-8 w-8 text-black/30 mx-auto mb-3" />
          <p className="text-sm text-black/60">
            Enter a member&apos;s email above and click <strong>Load report</strong> to see their full activity.
          </p>
          <p className="mt-1 text-xs text-black/40">
            Default: jasper@aisalon.ai — just click Load report.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-black/50">
          {label}
        </span>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <div className="text-2xl font-extrabold text-black">{value}</div>
    </div>
  );
}

function RawSection({ title, rows }: { title: string; rows: any[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1">{title}</h4>
        <p className="text-xs text-black/40 italic">No rows.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1">{title}</h4>
      <pre className="text-[0.7rem] bg-black/[0.03] rounded p-2 overflow-x-auto max-h-72 whitespace-pre-wrap break-words">
        {JSON.stringify(rows, null, 2)}
      </pre>
    </div>
  );
}
