"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, Search, Users, CalendarDays, ArrowRight, CheckCircle2, Home } from "lucide-react";
import {
  JoinCommunityDialog,
  type JoinChapterInfo,
} from "@/components/community/join-community-dialog";

/**
 * CommunitiesClient — the /communities discover grid.
 *
 * Two sections for signed-in users with a known country:
 *   - "Nearby — communities in your country" (their own city ones sort first)
 *   - "Everywhere else"
 * Anonymous visitors / users without a country get a single list.
 *
 * Card actions (user spec 2026-09-19):
 *   - Your primary community → "Your community" badge (no button).
 *   - Already joined (ACTIVE membership) → "Joined" badge.
 *   - Otherwise → "Request to join" → opens the community join form
 *     dialog; on success the card flips to Joined and the user can now
 *     see that community's events + members.
 */

type CommunityCard = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  heroImageUrl: string | null;
  countryName: string;
  countryCode: string;
  countryFlag: string | null;
  brandSlug: string | null;
  brandName: string | null;
  memberCount: number;
  upcomingEvents: number;
  isPrimary: boolean;
  isMember: boolean;
};

export function CommunitiesClient({
  communities,
  myCountryCode,
  me,
  brandName,
}: {
  communities: CommunityCard[];
  myCountryCode: string | null;
  me: { name: string | null; email: string } | null;
  brandName: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [countryFilter, setCountryFilter] = React.useState<string>("all");
  const [joined, setJoined] = React.useState<Set<string>>(new Set());
  const [dialogChapter, setDialogChapter] = React.useState<CommunityCard | null>(null);

  const countries = React.useMemo(() => {
    const map = new Map<string, { name: string; flag: string | null }>();
    for (const c of communities) {
      if (!map.has(c.countryCode)) map.set(c.countryCode, { name: c.countryName, flag: c.countryFlag });
    }
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [communities]);

  const toJoinInfo = (c: CommunityCard): JoinChapterInfo => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    city: c.city,
    brand: c.brandSlug ? { slug: c.brandSlug, displayName: c.brandName ?? c.brandSlug } : null,
    country: { name: c.countryName, code: c.countryCode, flagEmoji: c.countryFlag },
  });

  const matches = (c: CommunityCard) => {
    if (countryFilter !== "all" && c.countryCode !== countryFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q) ||
      c.countryName.toLowerCase().includes(q) ||
      (c.brandName ?? "").toLowerCase().includes(q)
    );
  };

  const isMemberOf = (c: CommunityCard) => c.isMember || joined.has(c.id);

  const nearby = myCountryCode
    ? communities.filter((c) => c.countryCode === myCountryCode && matches(c))
    : [];
  const rest = myCountryCode
    ? communities.filter((c) => c.countryCode !== myCountryCode && matches(c))
    : communities.filter(matches);

  function handleJoined(chapter: JoinChapterInfo) {
    setJoined((prev) => new Set(prev).add(chapter.id));
    // Refresh server data (member counts, events visibility on /events).
    router.refresh();
  }

  const card = (c: CommunityCard) => {
    const member = isMemberOf(c);
    return (
      <div
        key={c.id}
        className="group flex flex-col rounded-xl border border-black/10 bg-white overflow-hidden transition-shadow hover:shadow-md"
      >
        {/* Brand strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#FF005A] via-[#7C3AED] to-[#00E6FF] opacity-70 group-hover:opacity-100" />
        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-lg font-extrabold text-black leading-snug">{c.name}</h3>
            {c.isPrimary ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0A1F44] text-white px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider">
                <Home className="h-3 w-3" /> Yours
              </span>
            ) : member ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#007E72]/10 text-[#007E72] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider">
                <CheckCircle2 className="h-3 w-3" /> Joined
              </span>
            ) : null}
          </div>
          <p className="text-xs font-semibold text-black/60 mb-3">
            {c.brandName ?? brandName}
          </p>

          <div className="space-y-1.5 text-sm text-black/80 mb-4">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-black/50" />
              <span>
                {c.city ? `${c.city} · ` : ""}
                {c.countryFlag ?? ""} {c.countryName}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-black/50" />
              <span>
                {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-black/50" />
              <span>
                {c.upcomingEvents > 0
                  ? `${c.upcomingEvents} upcoming event${c.upcomingEvents === 1 ? "" : "s"}`
                  : "No upcoming events"}
              </span>
            </div>
          </div>

          <div className="mt-auto space-y-2">
            {c.isPrimary ? (
              <Link
                href="/community"
                className="block w-full text-center rounded-md border border-black/15 bg-white text-black font-semibold px-4 py-2.5 text-sm hover:bg-black/[0.03]"
              >
                View members <ArrowRight className="inline h-3.5 w-3.5" />
              </Link>
            ) : member ? (
              <div className="space-y-2">
                <p className="text-[0.65rem] text-[#007E72] text-center font-semibold">
                  You can now see this community&apos;s events and members.
                </p>
                <Link
                  href={`/c/${c.slug}`}
                  className="block w-full text-center rounded-md border border-black/15 bg-white text-black font-semibold px-4 py-2.5 text-sm hover:bg-black/[0.03]"
                >
                  Visit community page
                </Link>
              </div>
            ) : (
              <>
                {me ? (
                  <button
                    type="button"
                    onClick={() => setDialogChapter(c)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#FF005A]/90 ais-lift"
                  >
                    Request to join <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <Link
                    href={`/login?callbackUrl=${encodeURIComponent("/communities")}`}
                    className="block w-full text-center rounded-md bg-[#FF005A] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#FF005A]/90 ais-lift"
                  >
                    Sign in to join
                  </Link>
                )}
                <Link
                  href={`/c/${c.slug}`}
                  className="block w-full text-center rounded-md border border-black/15 bg-white text-black font-semibold px-4 py-2 text-xs hover:bg-black/[0.03]"
                >
                  Preview community
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
          Discover
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black leading-tight">
          Communities <span className="ais-gradient-text">near you</span>
        </h1>
        <p className="mt-3 text-base text-black/80 max-w-2xl">
          Browse communities in your city and country — and around the world.
          Request to join one to see its members and register for its events.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city, or country…"
            className="w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2.5 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black/20"
          />
        </div>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
          aria-label="Filter by country"
        >
          <option value="all">All countries</option>
          {countries.map(([code, info]) => (
            <option key={code} value={code}>
              {info.flag ? `${info.flag} ` : ""}
              {info.name}
            </option>
          ))}
        </select>
      </div>

      {nearby.length === 0 && rest.length === 0 ? (
        <div className="rounded-xl border border-black/10 bg-black/[0.02] p-12 text-center">
          <p className="text-sm text-black/60">
            No communities match your search yet. Try a different name or
            country.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {nearby.length > 0 && (
            <section aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-xl font-extrabold text-black mb-1">
                Nearby — your country
              </h2>
              <p className="text-sm text-black/60 mb-5">
                Communities in {countries.find(([code]) => code === myCountryCode)?.[1].name ?? "your country"}.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {nearby.map(card)}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="worldwide-heading">
              <h2 id="worldwide-heading" className="text-xl font-extrabold text-black mb-1">
                {nearby.length > 0 ? "Everywhere else" : "All communities"}
              </h2>
              <p className="text-sm text-black/60 mb-5">
                {nearby.length > 0
                  ? "Communities outside your country."
                  : "Browse every active community on the platform."}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rest.map(card)}
              </div>
            </section>
          )}
        </div>
      )}

      <JoinCommunityDialog
        open={!!dialogChapter}
        onOpenChange={(o) => {
          if (!o) setDialogChapter(null);
        }}
        chapter={dialogChapter ? toJoinInfo(dialogChapter) : null}
        me={me}
        onJoined={(chapter) => {
          handleJoined(chapter);
          setDialogChapter(null);
        }}
      />
    </>
  );
}
