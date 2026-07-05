"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Apple, Globe } from "lucide-react";
import {
  buildCalendarLinks,
  type CalendarEvent,
} from "@/lib/calendar";

/**
 * SaveToCalendar — dropdown button that lets the user add the event to
 * their preferred calendar service.
 *
 * Supported services:
 *   - iCal (.ics download) — Apple Calendar, Outlook desktop, etc.
 *   - Google Calendar
 *   - Outlook (web)
 *   - Yahoo Calendar
 *
 * Usage:
 *   <SaveToCalendar event={{ title, startsAt, endsAt, ... }} />
 *
 * The dropdown closes when:
 *   - User clicks outside the dropdown
 *   - User clicks a calendar option (the .ics one downloads + closes;
 *     the URL ones open in a new tab + close)
 *   - User presses Escape
 */
type Props = {
  event: CalendarEvent;
  /** Optional label override. Default: "Save to Calendar" */
  label?: string;
  /** Visual variant. Default: "outline". */
  variant?: "outline" | "solid" | "ghost";
  /** Size. Default: "md". */
  size?: "sm" | "md";
  /** Optional className for the trigger button. */
  className?: string;
};

export function SaveToCalendar({
  event,
  label = "Save to Calendar",
  variant = "outline",
  size = "md",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const links = buildCalendarLinks(event);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const variantCls =
    variant === "solid"
      ? "bg-black text-white hover:bg-black/90 border-black"
      : variant === "ghost"
        ? "bg-transparent text-black/70 hover:bg-black/5 border-transparent"
        : "bg-white text-black hover:bg-black/5 border-black/15";

  const sizeCls =
    size === "sm"
      ? "text-xs px-3 py-1.5"
      : "text-sm px-4 py-2.5";

  function handleIcsClick() {
    // The data: URI triggers a download. We close the dropdown after.
    // The <a download> attribute handles the rest.
    setOpen(false);
  }

  function handleUrlClick() {
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-md border font-semibold transition-colors ${variantCls} ${sizeCls} ${className}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Calendar className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 rounded-lg border border-black/10 bg-white shadow-lg z-50 overflow-hidden"
        >
          {/* iCal / Apple Calendar — downloads .ics file */}
          <a
            href={links.ics}
            download={`${event.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.ics`}
            onClick={handleIcsClick}
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-black/80 hover:bg-black/5 transition-colors"
          >
            <Apple className="h-4 w-4 text-black/80" />
            <div className="flex-1">
              <div className="font-semibold">iCal / Apple Calendar</div>
              <div className="text-[0.65rem] text-black/80">Downloads .ics file</div>
            </div>
          </a>

          {/* Google Calendar — opens in new tab */}
          <a
            href={links.google}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleUrlClick}
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-black/80 hover:bg-black/5 transition-colors"
          >
            <Globe className="h-4 w-4 text-[#4285F4]" />
            <div className="flex-1">
              <div className="font-semibold">Google Calendar</div>
              <div className="text-[0.65rem] text-black/80">Opens in new tab</div>
            </div>
          </a>

          {/* Outlook — opens in new tab */}
          <a
            href={links.outlook}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleUrlClick}
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-black/80 hover:bg-black/5 transition-colors"
          >
            <Globe className="h-4 w-4 text-[#0078D4]" />
            <div className="flex-1">
              <div className="font-semibold">Outlook</div>
              <div className="text-[0.65rem] text-black/80">Opens in new tab</div>
            </div>
          </a>

          {/* Yahoo — opens in new tab */}
          <a
            href={links.yahoo}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleUrlClick}
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-black/80 hover:bg-black/5 transition-colors"
          >
            <Globe className="h-4 w-4 text-[#6001D2]" />
            <div className="flex-1">
              <div className="font-semibold">Yahoo Calendar</div>
              <div className="text-[0.65rem] text-black/80">Opens in new tab</div>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
