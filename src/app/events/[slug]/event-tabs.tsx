"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/overview-tab";
import { AgendaTab } from "./tabs/agenda-tab";
import { PhotosTab } from "./tabs/photos-tab";
import { SlideshowTab } from "./tabs/slideshow-tab";

type Speaker = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  bio: string | null;
  topic: string | null;
  photoUrl: string | null;
  order: number;
};

type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  type: string;
  speaker: Speaker | null;
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
}: {
  event: EventData;
  me: Me;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="bg-black/5 h-auto p-1 flex-wrap">
        <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Overview
        </TabsTrigger>
        <TabsTrigger value="agenda" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Speakers & Agenda
        </TabsTrigger>
        <TabsTrigger value="photos" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Photos ({event._count.images})
        </TabsTrigger>
        <TabsTrigger value="slideshow" className="data-[state=active]:bg-white data-[state=active]:text-black">
          Slideshow
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <OverviewTab event={event} />
      </TabsContent>
      <TabsContent value="agenda" className="mt-6">
        <AgendaTab event={event} />
      </TabsContent>
      <TabsContent value="photos" className="mt-6">
        <PhotosTab event={event} me={me} isAdmin={isAdmin} />
      </TabsContent>
      <TabsContent value="slideshow" className="mt-6">
        <SlideshowTab event={event} />
      </TabsContent>
    </Tabs>
  );
}
