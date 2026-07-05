"use client";

import * as React from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Calendar,
  CalendarPlus,
  Search,
  ArrowLeft,
  ArrowRight,
  Users,
  MapPin,
  Mic2,
  ImageIcon,
  CalendarDays,
} from "lucide-react";
import { NewEventForm } from "../events/new/new-event-form";
import { EventManagerPanel, type AdminEventRow, type AdminMemberRow } from "./event-manager-panel";

type Props = {
  events: AdminEventRow[];
  members: AdminMemberRow[];
};

/**
 * AdminEventManager — the top-level client component for the new
 * /admin/event tab. Renders two inner sub-tabs:
 *
 *   1. "Manage event" — searchable list of all events. Clicking one
 *      opens the inline <EventManagerPanel> with Details, Sessions/Agenda,
 *      Speakers, Presentations, and Co-hosts sections.
 *
 *   2. "Add new event" — renders the existing <NewEventForm> verbatim,
 *      so the admin flow for creating a new event is unchanged.
 *
 * The selected-event state is local to this component so the user can
 * switch back and forth between the list and the management panel
 * without losing context across tab switches.
 */
export function AdminEventManager({ events, members }: Props) {
  // The "Manage event" sub-tab has its own internal state: either the
  // user is browsing the list, or they've picked an event and are
  // viewing its management panel. We keep that state here so it
  // survives tab switches (e.g. they go to "Add new event", come back,
  // and the previously-selected event is still open).
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = React.useMemo(
    () => events.find((e) => e.id === selectedId) || null,
    [events, selectedId]
  );

  return (
    <Tabs defaultValue="manage" className="w-full">
      <TabsList className="bg-black/5 p-1 h-auto">
        <TabsTrigger
          value="manage"
          className="data-[state=active]:bg-white data-[state=active]:text-[#FF005A] data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-semibold"
        >
          <Calendar className="h-4 w-4 mr-1.5" />
          Manage event
        </TabsTrigger>
        <TabsTrigger
          value="new"
          className="data-[state=active]:bg-white data-[state=active]:text-[#FF005A] data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-semibold"
        >
          <CalendarPlus className="h-4 w-4 mr-1.5" />
          Add new event
        </TabsTrigger>
      </TabsList>

      {/* ----------------------- Manage event ----------------------- */}
      <TabsContent value="manage" className="mt-6">
        {selected ? (
          <EventManagerPanel
            event={selected}
            members={members}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <EventPicker
            events={events}
            onPick={(id) => setSelectedId(id)}
          />
        )}
      </TabsContent>

      {/* ----------------------- Add new event ----------------------- */}
      <TabsContent value="new" className="mt-6">
        <div className="rounded-lg border border-black/10 bg-white p-6">
          <div className="mb-5">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
              Create a new event
            </p>
            <h2 className="text-xl font-extrabold text-black">
              Fill in the basics — you can finish the rest on the event page
            </h2>
            <p className="text-xs text-black/80 mt-1">
              After creating the event you&apos;ll be taken to its page, where
              you can switch back to this tab and find it in the Manage event
              list to add speakers, agenda, co-hosts, etc.
            </p>
          </div>
          <NewEventForm />
        </div>
      </TabsContent>
    </Tabs>
  );
}

// ------------------------------------------------------------------
// EventPicker — the searchable list of all events (Manage event tab).
// ------------------------------------------------------------------

function EventPicker({
  events,
  onPick,
}: {
  events: AdminEventRow[];
  onPick: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "upcoming" | "past">("all");

  const now = Date.now();
  const filtered = React.useMemo(() => {
    return events.filter((e) => {
      const matchesQ =
        !q.trim() ||
        e.title.toLowerCase().includes(q.toLowerCase()) ||
        (e.venue || "").toLowerCase().includes(q.toLowerCase()) ||
        (e.chapter || "").toLowerCase().includes(q.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "upcoming" && new Date(e.startsAt).getTime() >= now) ||
        (filter === "past" && new Date(e.startsAt).getTime() < now);
      return matchesQ && matchesFilter;
    });
  }, [events, q, filter, now]);

  return (
    <div>
      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black/80" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title, venue, or chapter…"
            className="w-full rounded-md border border-black/15 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF005A]/40"
          />
        </div>
        <div className="inline-flex rounded-md border border-black/15 bg-white overflow-hidden">
          {(["all", "upcoming", "past"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? "bg-[#FF005A] text-white"
                  : "text-black/80 hover:bg-black/5"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-black/50 mb-3">
        Showing {filtered.length} of {events.length} events
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-black/15 bg-white p-10 text-center">
          <Calendar className="h-10 w-10 mx-auto text-black/30 mb-3" />
          <h3 className="font-bold text-black mb-1">
            {q || filter !== "all" ? "No matching events" : "No events yet"}
          </h3>
          <p className="text-sm text-black/80">
            {q || filter !== "all"
              ? "Try clearing the search or switching the filter."
              : "Switch to the “Add new event” tab to create your first event."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e.id)}
              className="w-full text-left"
            >
              <div className="border border-black/10 bg-white rounded-lg p-4 flex items-center gap-4 hover:border-[#FF005A]/40 hover:shadow-sm transition-all ais-lift">
                {/* Date block */}
                <div className="flex-shrink-0 w-14 text-center">
                  <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#FF005A]">
                    {fmt(e.startsAt, { month: "short" }).toUpperCase()}
                  </div>
                  <div className="text-2xl font-extrabold text-black leading-none">
                    {fmt(e.startsAt, { day: "2-digit" })}
                  </div>
                </div>

                {/* Title + meta */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-black text-sm line-clamp-1">
                    {e.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-black/50">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {fmt(e.startsAt, { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {fmtTime(e.startsAt)}
                    </span>
                    {e.venue && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {e.venue}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Mic2 className="h-3 w-3" />
                      {e._count.speakers} speakers
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {e._count.agenda} agenda items
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" />
                      {e._count.images} photos
                    </span>
                    {e._count.coHosts > 0 && (
                      <span className="inline-flex items-center gap-1 text-[#007E72]">
                        <Users className="h-3 w-3" />
                        {e._count.coHosts} co-host{e._count.coHosts === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight className="h-4 w-4 text-black/30 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------

function fmt(
  iso: string,
  opts: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", ...opts }).format(
    new Date(iso)
  );
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
