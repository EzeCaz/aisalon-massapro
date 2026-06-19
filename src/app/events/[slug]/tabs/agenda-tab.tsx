"use client";

import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Coffee, Mic, Network, Rocket, Hand } from "lucide-react";

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
  description: string | null;
  type: string;
  speaker: Speaker | null;
};

type EventData = {
  id: string;
  speakers: Speaker[];
  agenda: AgendaItem[];
};

const typeIcon: Record<string, React.ReactNode> = {
  WELCOME: <Hand className="h-4 w-4" />,
  TALK: <Mic className="h-4 w-4" />,
  BREAK: <Coffee className="h-4 w-4" />,
  NETWORKING: <Network className="h-4 w-4" />,
  FAST_PITCH: <Rocket className="h-4 w-4" />,
};

const typeColor: Record<string, string> = {
  WELCOME: "bg-[#00E6FF]/10 text-[#007E72] border-[#00E6FF]/30",
  TALK: "bg-[#FF005A]/10 text-[#FF005A] border-[#FF005A]/30",
  BREAK: "bg-black/5 text-black/60 border-black/10",
  NETWORKING: "bg-[#820A7D]/10 text-[#820A7D] border-[#820A7D]/30",
  FAST_PITCH: "bg-[#FFAC30]/10 text-[#FFAC30] border-[#FFAC30]/30",
};

export function AgendaTab({ event }: { event: EventData }) {
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      {/* Agenda timeline */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF005A] mb-4">
          Event agenda
        </h2>
        <div className="space-y-2">
          {event.agenda.map((item) => {
            const start = new Date(item.startsAt);
            const end = item.endsAt ? new Date(item.endsAt) : null;
            return (
              <Card
                key={item.id}
                className={`p-4 border ${typeColor[item.type] || "bg-white border-black/10"} flex items-center gap-4`}
              >
                <div className="flex-shrink-0 text-center min-w-[80px]">
                  <div className="font-mono text-sm font-bold text-black">
                    {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(start)}
                  </div>
                  {end && (
                    <div className="font-mono text-[0.65rem] text-black/40">
                      – {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(end)}
                    </div>
                  )}
                </div>
                <div className="h-8 w-px bg-black/15" />
                <div className={`flex-shrink-0 ${typeColor[item.type] ? "" : "text-black/40"}`}>
                  {typeIcon[item.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-black leading-snug">{item.title}</div>
                  {item.description && (
                    <p className="text-xs text-black/60 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                  {item.speaker && (
                    <div className="text-xs text-black/60 mt-0.5">
                      {item.speaker.name}
                      {item.speaker.role && <span> · {item.speaker.role}</span>}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Speakers list */}
      <aside>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF005A] mb-4">
          The lineup
        </h2>
        <div className="space-y-3">
          {event.speakers
            .filter((s) => s.name !== "Ezequiel Sznaider")
            .map((s) => (
              <Card key={s.id} className="p-4 bg-white border border-black/10">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 border border-black/10">
                    <AvatarImage src={s.photoUrl || undefined} alt={s.name} />
                    <AvatarFallback className="bg-black text-white text-xs font-bold">
                      {s.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-black">{s.name}</div>
                    {s.role && <div className="text-xs text-black/60">{s.role}</div>}
                    {s.topic && (
                      <div className="mt-2 text-xs font-medium text-[#007E72] italic leading-snug">
                        “{s.topic}”
                      </div>
                    )}
                    {s.bio && (
                      <p className="mt-2 text-xs text-black/70 leading-relaxed line-clamp-4">
                        {s.bio}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
        </div>
      </aside>
    </div>
  );
}
