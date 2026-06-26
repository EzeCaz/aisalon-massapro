"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/overview-tab";
import { AgendaTab } from "./tabs/agenda-tab";
import { PhotosTab } from "./tabs/photos-tab";
import { SlideshowTab } from "./tabs/slideshow-tab";
import { PresentationsTab } from "./tabs/presentations-tab";
import { AdminAgendaTab } from "./tabs/admin-agenda-tab";
import { ManageEventTab } from "./tabs/manage-event-tab";
import type { CoHost } from "@/components/admin/event-editor";
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
  coHosts = [],
  eventStats = null,
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
  coHosts?: CoHost[];
  eventStats?: EventStats | null;
}) {
  const [tab, setTab] = useState("overview");
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
        <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Overview
        </TabsTrigger>
        <TabsTrigger value="agenda" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Speakers &amp; Agenda
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

      <TabsContent value="overview" className="mt-6">
        <OverviewTab event={event} initialRsvp={initialRsvp} />
      </TabsContent>
      <TabsContent value="agenda" className="mt-6">
        <AgendaTab key={`agenda-${agendaVersion}`} event={event} me={me} />
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
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              description: event.description,
              takeaways: event.takeaways,
              intendedFor: event.intendedFor,
              rsvpUrl: event.rsvpUrl,
            }}
            coHosts={coHosts}
            stats={stats}
            canManageCoHosts={canManageCoHosts}
            isSuperAdmin={isSuperAdmin}
            showBackButton={false}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
