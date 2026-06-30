"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  Calendar,
  Pencil,
  ExternalLink,
  Ticket,
  Users,
  Image as ImageIcon,
  ListChecks,
  QrCode,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { EventEditor, type CoHost, type EventForEditor } from "@/components/admin/event-editor";

type EventStats = {
  rsvps: number;
  rsvpsGoing: number;
  checkedIn: number;
  images: number;
  speakers: number;
  agenda: number;
};

type ManageEventTabProps = {
  /** Full event data (with serialized dates) */
  event: {
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
  };
  coHosts: CoHost[];
  stats: EventStats;
  canManageCoHosts: boolean;
  isSuperAdmin: boolean;
  /** When true, show the "Back to events" link (admin context). When false, we're on the event page itself. */
  showBackButton?: boolean;
};

export function ManageEventTab({
  event,
  coHosts,
  stats,
  canManageCoHosts,
  isSuperAdmin,
  showBackButton = false,
}: ManageEventTabProps) {
  const eventForEditor: EventForEditor = {
    ...event,
    coHosts,
    _count: {
      images: stats.images,
      speakers: stats.speakers,
      agenda: stats.agenda,
      rsvps: stats.rsvps,
      rsvpsGoing: stats.rsvpsGoing,
      checkedIn: stats.checkedIn,
    },
  };

  return (
    <div className="space-y-6">
      {/* Quick action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickActionCard
          href={`/admin/check-in`}
          icon={<QrCode className="h-4 w-4" />}
          title="Door Check-in"
          desc="Verify attendee codes at the venue"
          accent="pink"
        />
        <QuickActionCard
          href={`/admin/registrants?eventId=${event.id}`}
          icon={<Ticket className="h-4 w-4" />}
          title="View RSVPs"
          desc={`${stats.rsvps} RSVPs · ${stats.rsvpsGoing} going · ${stats.checkedIn} checked in`}
          accent="green"
        />
        <QuickActionCard
          href={`/events/${event.slug}?tab=photos`}
          icon={<ImageIcon className="h-4 w-4" />}
          title="Manage photos"
          desc={`${stats.images} images in the gallery`}
        />
        <QuickActionCard
          href={`/events/${event.slug}?tab=admin-agenda`}
          icon={<ListChecks className="h-4 w-4" />}
          title="Manage agenda"
          desc={`${stats.agenda} agenda items · ${stats.speakers} speakers`}
        />
      </div>

      {/* Permission badge */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-black/60">
        <ShieldCheck className="h-3.5 w-3.5 text-[#007E72]" />
        <span>
          You can manage this event
          {canManageCoHosts ? " (Admin)" : " (Co-host)"}
          {isSuperAdmin && " · Super Admin"}
        </span>
        <Link
          href={`/admin/events/${event.id}`}
          className="ml-auto inline-flex items-center gap-1 text-[#FF005A] font-semibold hover:underline"
        >
          Open in Admin Events <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Shared editor (reuses the same component as /admin/events/[id]) */}
      <EventEditor
        event={eventForEditor}
        canDelete={isSuperAdmin}
        canManageCoHosts={canManageCoHosts}
        showBackButton={showBackButton}
        backHref="/admin/events"
      />
    </div>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  desc,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent?: "pink" | "green";
}) {
  const accentCls =
    accent === "pink"
      ? "text-[#FF005A]"
      : accent === "green"
      ? "text-[#007E72]"
      : "text-black/70";
  return (
    <Link href={href} className="block group">
      <Card className="p-4 border border-black/10 bg-white ais-lift h-full">
        <div className={`flex items-center gap-2 mb-1 ${accentCls}`}>
          {icon}
          <span className="text-sm font-bold">{title}</span>
        </div>
        <p className="text-xs text-black/50">{desc}</p>
        <div className="mt-2 text-[0.7rem] font-semibold text-black/40 group-hover:text-[#FF005A] transition-colors inline-flex items-center gap-1">
          Open <ArrowRight className="h-3 w-3" />
        </div>
      </Card>
    </Link>
  );
}
