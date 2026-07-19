import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * TEMPORARY debug endpoint — runs the same DB queries as /events
 * and returns either the result or the full error message.
 *
 * This lets us diagnose production DB issues without needing Vercel
 * log access. Delete this file once the issue is resolved.
 *
 * NOTE: This is a read-only endpoint — no auth required because it
 * only returns aggregate counts (no user data).
 */
export async function GET() {
  const result: {
    step: string;
    status: "ok" | "error";
    message?: string;
    data?: unknown;
    durationMs?: number;
  }[] = [];

  // Step 1: simple count
  try {
    const t0 = Date.now();
    const eventCount = await db.event.count();
    result.push({
      step: "db.event.count()",
      status: "ok",
      data: { count: eventCount },
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    result.push({
      step: "db.event.count()",
      status: "error",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  // Step 2: findMany with simple include
  try {
    const t0 = Date.now();
    const events = await db.event.findMany({
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        chapter: true,
        chapterId: true,
        isCrossChapter: true,
        startsAt: true,
      },
      take: 3,
    });
    result.push({
      step: "db.event.findMany (minimal select)",
      status: "ok",
      data: events,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    result.push({
      step: "db.event.findMany (minimal select)",
      status: "error",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  // Step 3: findMany with _count + mainImage (matches /events page)
  try {
    const t0 = Date.now();
    const events = await db.event.findMany({
      orderBy: { startsAt: "desc" },
      include: {
        _count: { select: { images: true, speakers: true } },
        mainImage: { select: { id: true, fileUrl: true, caption: true } },
      },
      take: 3,
    });
    result.push({
      step: "db.event.findMany (with _count + mainImage, matches /events)",
      status: "ok",
      data: { count: events.length, firstEvent: events[0]?.id ?? null },
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    result.push({
      step: "db.event.findMany (with _count + mainImage, matches /events)",
      status: "error",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  // Step 4: eventRsvp.groupBy (matches /events page)
  try {
    const t0 = Date.now();
    const goingCounts = await db.eventRsvp.groupBy({
      by: ["eventId"],
      where: { status: "GOING" },
      _count: { _all: true },
    });
    result.push({
      step: "db.eventRsvp.groupBy (matches /events page)",
      status: "ok",
      data: { count: goingCounts.length },
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    result.push({
      step: "db.eventRsvp.groupBy (matches /events page)",
      status: "error",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  // Step 5: siteSetting.findMany (matches AppHeader via getPublicSettings)
  try {
    const t0 = Date.now();
    const settings = await db.siteSetting.findMany({
      select: { key: true, value: true },
    });
    result.push({
      step: "db.siteSetting.findMany (matches AppHeader)",
      status: "ok",
      data: { count: settings.length, keys: settings.map((s) => s.key) },
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    result.push({
      step: "db.siteSetting.findMany (matches AppHeader)",
      status: "error",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  // Step 6: check V7 columns exist on EventRsvp
  try {
    const t0 = Date.now();
    const rsvpSample = await db.eventRsvp.findFirst({
      select: {
        id: true,
        eventId: true,
        email: true,
        status: true,
        chapterId: true,
      },
    });
    result.push({
      step: "db.eventRsvp.findFirst (check chapterId column exists)",
      status: "ok",
      data: rsvpSample
        ? { id: rsvpSample.id, chapterId: rsvpSample.chapterId }
        : null,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    result.push({
      step: "db.eventRsvp.findFirst (check chapterId column exists)",
      status: "error",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results: result,
  });
}
