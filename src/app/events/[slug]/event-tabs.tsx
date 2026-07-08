"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/hooks/use-hash-tab";
import { OverviewTab } from "./tabs/overview-tab";
import { AgendaTab } from "./tabs/agenda-tab";
import { PhotosTab } from "./tabs/photos-tab";
import { SlideshowTab } from "./tabs/slideshow-tab";
import { PresentationsTab } from "./tabs/presentations-tab";
import { AdminAgendaTab } from "./tabs/admin-agenda-tab";
import { ManageEventTab } from "./tabs/manage-event-tab";
import { EventPrepTab } from "./tabs/event-prep-tab";
import { QuizTab } from "./tabs/quiz-tab";
import { ChatTab } from "./tabs/chat-tab";
import type { CoHost, EventSpeaker } from "@/components/admin/event-editor";
import type { Rsvp } from "@/components/events/rsvp-check-in-card";

type EventStats = {
  rsvps: number;
  rsvpsGoing: number;
  checkedIn: number;
  images: number;
  speakers: number;
  agenda: number;
};

type SlimImage = {
  id: string;
  fileUrl: string;
  fileName: string;
  caption: string | null;
};

type SlimPresentation = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  title: string | null;
};

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl: string | null;
  order: number;
  images?: SlimImage[];
  presentations?: SlimPresentation[];
};

type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  description: string | null;
  type: string;
  speaker: Speaker | null;
  presentations?: SlimPresentation[];
};

type QuizSessionSummary = {
  id: string;
  title: string;
  status: string;
  questionTimeLimitSec: number;
  totalQuestions: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  host: { id: string; name: string | null; email: string } | null;
  _count: { participants: number };
};

type EventData = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  chapter: string;
  venue: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  mapUrl: string | null;
  wazeUrl: string | null;
  startsAt: string;
  endsAt: string;
  description: string | null;
  takeaways: string | null;
  intendedFor: string | null;
  rsvpUrl: string | null;
  speakers: Speaker[];
  agenda: AgendaItem[];
  _count: { images: number };
  // Set by the admin via the photo gallery; null when no main image
  // has been picked. PhotosTab reads this to highlight the active one.
  mainImageId?: string | null;
};

type Me = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export function EventTabs({
  event,
  me,
  isAdmin,
  initialRsvp = null,
  canManageEvent = false,
  canManageCoHosts = false,
  isSuperAdmin = false,
  canViewEventPrep = false,
  isSpeaker = false,
  coHosts = [],
  eventStats = null,
  speakersForEditor = [],
  quizzes = [],
  canHostQuiz = false,
}: {
  event: EventData;
  me: Me;
  isAdmin: boolean;
  initialRsvp?: Rsvp;
  /** Whether the current viewer can manage this event (Admin / Super Admin / Co-host of this event). */
  canManageEvent?: boolean;
  /** Whether the current viewer can add/remove co-hosts (Admin+ only, NOT Co-host). */
  canManageCoHosts?: boolean;
  isSuperAdmin?: boolean;
  /** Whether the current viewer can see the 🎯 Event prep tab (managers + SPEAKERs of this event). */
  canViewEventPrep?: boolean;
  /** Whether the current viewer is a SPEAKER on this event (read-only Event Prep access). */
  isSpeaker?: boolean;
  coHosts?: CoHost[];
  eventStats?: EventStats | null;
  /** Full speaker roster for the EventEditor (managers only). Empty for non-managers. */
  speakersForEditor?: EventSpeaker[];
  /** Quiz sessions linked to this event (all logged-in members can see them). */
  quizzes?: QuizSessionSummary[];
  /** Whether the viewer can create/host a quiz for this event (admin / super-admin / co-host). */
  canHostQuiz?: boolean;
}) {
  // Tab state is synced to the URL hash (#quiz, #event-prep, #photos, ...)
  // so any tab on this event page can be deep-linked and shared.
  // Only the tabs that are actually visible to this viewer are allowed
  // — if someone hits #admin-agenda but isn't an admin, the hook falls
  // back to "agenda" (the default) instead of opening a hidden tab.
  const visibleTabs: string[] = ["agenda", "overview", "photos", "slideshow", "presentations"];
  if (quizzes.length > 0 || canHostQuiz) visibleTabs.push("quiz");
  visibleTabs.push("chat");
  if (canViewEventPrep) visibleTabs.push("event-prep");
  if (isAdmin) visibleTabs.push("admin-agenda");
  if (canManageEvent) visibleTabs.push("manage-event");
  const [tab, setTab] = useHashTab("agenda", visibleTabs);
  // Force re-mount of agenda tabs when the admin edits agenda so the
  // public agenda view stays in sync.
  const [agendaVersion, setAgendaVersion] = useState(0);

  // Default stats when not provided (e.g. for non-managers — though the
  // tab is hidden then anyway). Use event._count.images as the only
  // always-available number.
  const stats: EventStats = eventStats ?? {
    rsvps: 0,
    rsvpsGoing: 0,
    checkedIn: 0,
    images: event._count.images,
    speakers: event.speakers.length,
    agenda: event.agenda.length,
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="bg-black/5 h-auto p-1 flex-wrap">
        <TabsTrigger value="agenda" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Speakers &amp; Agenda
        </TabsTrigger>
        <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Overview
        </TabsTrigger>
        <TabsTrigger value="photos" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Photos ({event._count.images})
        </TabsTrigger>
        <TabsTrigger value="slideshow" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Slideshow
        </TabsTrigger>
        <TabsTrigger value="presentations" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Presentations
        </TabsTrigger>
        {quizzes.length > 0 && (
          <TabsTrigger
            value="quiz"
            className="data-[state=active]:bg-[#FF005A] data-[state=active]:text-white"
          >
            🧠 Quiz ({quizzes.length})
          </TabsTrigger>
        )}
        {canHostQuiz && quizzes.length === 0 && (
          <TabsTrigger
            value="quiz"
            className="data-[state=active]:bg-[#FF005A] data-[state=active]:text-white"
          >
            🧠 Quiz
          </TabsTrigger>
        )}
        {/* Event chat — available to any signed-in user. The ChatTab
            component calls /api/chat/events/[id]/room which returns 403
            if the user isn't RSVP'd / co-host / speaker — in that case
            it shows a friendly "no access" message instead of the chat. */}
        <TabsTrigger
          value="chat"
          className="data-[state=active]:bg-[#FF005A] data-[state=active]:text-white"
        >
          💬 Chat
        </TabsTrigger>
        {canViewEventPrep && (
          <TabsTrigger
            value="event-prep"
            className="data-[state=active]:bg-[#00E6FF]/20 data-[state=active]:text-[#007E72]"
          >
            🎯 Event prep
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger
            value="admin-agenda"
            className="data-[state=active]:bg-[#FFAC30] data-[state=active]:text-black"
          >
            🛠 Manage Agenda
          </TabsTrigger>
        )}
        {canManageEvent && (
          <TabsTrigger
            value="manage-event"
            className="data-[state=active]:bg-[#FF005A] data-[state=active]:text-white"
          >
            🛠 Manage Event
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="agenda" className="mt-6">
        <AgendaTab key={`agenda-${agendaVersion}`} event={event} me={me} />
      </TabsContent>
      <TabsContent value="overview" className="mt-6">
        <OverviewTab event={event} initialRsvp={initialRsvp} />
      </TabsContent>
      <TabsContent value="photos" className="mt-6">
        <PhotosTab event={event} me={me} isAdmin={isAdmin} />
      </TabsContent>
      <TabsContent value="slideshow" className="mt-6">
        <SlideshowTab event={event} />
      </TabsContent>
      <TabsContent value="presentations" className="mt-6">
        <PresentationsTab event={event} me={me} isAdmin={isAdmin} />
      </TabsContent>
      {(quizzes.length > 0 || canHostQuiz) && (
        <TabsContent value="quiz" className="mt-6">
          <QuizTab
            eventId={event.id}
            eventSlug={event.slug}
            initialQuizzes={quizzes}
            canHost={canHostQuiz}
            hostUserId={me.id}
          />
        </TabsContent>
      )}
      <TabsContent value="chat" className="mt-6">
        <ChatTab eventId={event.id} eventTitle={event.title} me={me} />
      </TabsContent>
      {canViewEventPrep && (
        <TabsContent value="event-prep" className="mt-6">
          <EventPrepTab
            event={{
              id: event.id,
              slug: event.slug,
              title: event.title,
              speakers: event.speakers.map((s) => ({
                id: s.id,
                name: s.name,
                role: s.role,
                company: s.company,
                photoUrl: s.photoUrl,
              })),
            }}
            me={{
              id: me.id,
              name: me.name,
              email: me.email,
              role: me.role,
              isSuperAdmin,
            }}
            isSpeaker={isSpeaker}
          />
        </TabsContent>
      )}
      {isAdmin && (
        <TabsContent value="admin-agenda" className="mt-6">
          <AdminAgendaTab
            key={`admin-${agendaVersion}`}
            event={event}
            onAgendaChanged={() => setAgendaVersion((v) => v + 1)}
          />
        </TabsContent>
      )}
      {canManageEvent && (
        <TabsContent value="manage-event" className="mt-6">
          <ManageEventTab
            event={{
              id: event.id,
              slug: event.slug,
              title: event.title,
              subtitle: event.subtitle,
              chapter: event.chapter,
              venue: event.venue,
              address: event.address,
              city: event.city,
              country: event.country,
              mapUrl: event.mapUrl,
              wazeUrl: event.wazeUrl,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              description: event.description,
              takeaways: event.takeaways,
              intendedFor: event.intendedFor,
              rsvpUrl: event.rsvpUrl,
            }}
            coHosts={coHosts}
            speakers={speakersForEditor}
            stats={stats}
            canManageCoHosts={canManageCoHosts}
            canManageSpeakers={canManageEvent}
            isSuperAdmin={isSuperAdmin}
            showBackButton={false}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
