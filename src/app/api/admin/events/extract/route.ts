import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import ZAI from "z-ai-web-dev-sdk";
import {
  createKimiChatCompletion,
  hasKimiEnv,
} from "@/lib/kimi-client";
import {
  createChatCompletion as createZaiChatCompletion,
  hasZaiEnv,
} from "@/lib/zai-client";

/**
 * POST /api/admin/events/extract
 *
 * Takes raw pasted event content (e.g. from a LinkedIn post, email,
 * or marketing copy) and uses an LLM to extract structured event fields.
 *
 * Body: { text: string }
 * Response: {
 *   event: { title, subtitle, description, venue, address, city, mapUrl,
 *            startsAt, endsAt, takeaways, intendedFor, rsvpUrl },
 *   speakers: Array<{ name, company, position, bio, topic, abstract, startTime, endTime }>,
 *   warnings: string[]
 * }
 *
 * Admin-only (any role with members.view).
 *
 * The LLM is instructed to return STRICT JSON. We parse it defensively
 * and fall back to null for any missing/invalid field. The frontend
 * uses the response to pre-fill the New Event form, but the user can
 * still review and edit everything before saving.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json(
      { error: "Missing `text` field in request body." },
      { status: 400 }
    );
  }
  if (text.length > 20000) {
    return NextResponse.json(
      { error: `Text too long (${text.length} chars). Max 20000 chars.` },
      { status: 400 }
    );
  }

  const systemPrompt = `You are an event extraction assistant for AI Salon Tel Aviv, a community of AI founders, builders, and investors in Tel Aviv.

Given raw event content (LinkedIn posts, marketing copy, emails, speaker bios), extract a structured event object. Output STRICT JSON only — no markdown fences, no commentary.

The JSON shape:
{
  "event": {
    "title": "string — main event title, e.g. 'The AI CMO Blueprint: Scaling Growth & Agentic Innovation'",
    "subtitle": "string | null — one-line hook/tagline, e.g. 'Expert Insights, Live Architecture Breakdowns, and Networking'",
    "description": "string — long-form overview (1-3 paragraphs). Include the 'why attend' + what's covered. Strip emojis and markdown bullets. Plain text only.",
    "venue": "string | null — e.g. 'Google For Startups Campus TLV' or 'The Stage'",
    "address": "string | null — street address if mentioned",
    "city": "string | null — default 'Tel Aviv' if event is in Israel and no other city given",
    "country": "string | null — ISO 3-letter code, e.g. 'ISR', 'USA'",
    "mapUrl": "string | null — Google Maps URL if mentioned",
    "startsAt": "ISO 8601 string | null — e.g. '2026-06-18T18:00:00'. If the text says 'June 18, 2026 | 18:00 – 21:15', startsAt = '2026-06-18T18:00:00'. Assume local Tel Aviv time (Asia/Jerusalem, UTC+3) unless a timezone is specified. If year is missing, assume the next occurrence of that date.",
    "endsAt": "ISO 8601 string | null — e.g. '2026-06-18T21:15:00'",
    "takeaways": "string | null — what attendees will take home, comma-separated or bullet-style. e.g. 'Fast Forward OS Blueprint & Architecture, Agent Role Cheatsheet, 4-Step Implementation Roadmap'",
    "intendedFor": "string | null — who the event is built for, e.g. 'Founders, CMOs, Product Leaders, Growth Marketers, and AI builders'",
    "rsvpUrl": "string | null — external RSVP link (lu.ma, forms.gle, etc.) if mentioned"
  },
  "speakers": [
    {
      "name": "string — full name",
      "company": "string | null",
      "position": "string | null — job title",
      "bio": "string | null — 1-3 sentence bio, plain text",
      "topic": "string | null — talk title",
      "abstract": "string | null — 1-2 paragraph session abstract, plain text",
      "startTime": "ISO 8601 string | null — when this speaker's slot starts (if agenda mentions it)",
      "endTime": "ISO 8601 string | null — when this speaker's slot ends"
    }
  ],
  "warnings": ["string — any field you couldn't extract confidently, e.g. 'Year not specified in text — assumed 2026'"]
}

Rules:
1. Output ONLY the JSON object. No prose, no \`\`\`json fences.
2. Use null for any field that can't be confidently extracted.
3. Plain text everywhere — strip emojis, markdown asterisks, bullets, and HTML.
4. For dates without a year, assume the next upcoming occurrence (today is 2026-06-23).
5. Speakers: include ANY person mentioned with a speaking role. If you can't tell if someone is speaking vs. just mentioned, include them with a warning.
6. Don't invent data — if a field isn't in the text, use null.`;

  // Provider priority: Kimi (Moonshot) → ZAI env → ZAI SDK (dev only).
  // Kimi is the recommended provider for this prefill flow — free tier
  // at platform.moonshot.cn, OpenAI-compatible, no extra SDK deps.
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: text },
  ];

  let raw = "";
  let providerUsed = "";

  try {
    if (hasKimiEnv()) {
      providerUsed = "kimi";
      const kimiRes = await createKimiChatCompletion({
        messages,
        temperature: 0.2,
        // moonshot-v1-32k comfortably fits the 20k-char input cap + JSON output
        model: process.env.KIMI_MODEL || "moonshot-v1-32k",
      });
      raw = kimiRes.choices[0]?.message?.content || "";
    } else if (hasZaiEnv()) {
      providerUsed = "zai-env";
      const zaiRes = await createZaiChatCompletion({
        messages,
        thinking: { type: "disabled" },
      });
      raw = zaiRes.choices[0]?.message?.content || "";
    } else {
      providerUsed = "zai-sdk";
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: "disabled" },
      });
      raw = completion.choices[0]?.message?.content || "";
    }
  } catch (err) {
    console.error(
      `[events/extract] LLM call failed (provider=${providerUsed || "none"}):`,
      err
    );
    return NextResponse.json(
      {
        error: `AI extraction failed via ${providerUsed || "no provider"}: ${(err as Error).message}`,
        hint:
          "Set KIMI_API_KEY (free tier at platform.moonshot.cn) for the most reliable extraction.",
      },
      { status: 500 }
    );
  }

  try {
    // inner try: parse the LLM JSON output
    // Strip any markdown fences the LLM might have added despite instructions.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[events/extract] JSON parse failed:", parseErr, "raw:", cleaned.slice(0, 500));
      return NextResponse.json(
        {
          error: "The AI returned malformed JSON. Please try again or paste a clearer version of the content.",
          rawPreview: cleaned.slice(0, 500),
        },
        { status: 502 }
      );
    }

    // Basic shape validation + sanitization
    const result = parsed as {
      event?: Record<string, unknown>;
      speakers?: unknown[];
      warnings?: unknown[];
    };
    if (!result || typeof result !== "object" || !result.event) {
      return NextResponse.json(
        { error: "The AI response didn't include an event object. Please try again." },
        { status: 502 }
      );
    }

    // Sanitize the event fields (length caps, type coercion)
    const e = result.event;
    const str = (v: unknown, max: number): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim();
      if (!s) return null;
      return s.length > max ? s.slice(0, max) : s;
    };
    const sanitizedEvent = {
      title: str(e.title, 200),
      subtitle: str(e.subtitle, 300),
      description: str(e.description, 8000),
      venue: str(e.venue, 200),
      address: str(e.address, 300),
      city: str(e.city, 100),
      country: str(e.country, 10),
      mapUrl: str(e.mapUrl, 1000),
      startsAt: str(e.startsAt, 50),
      endsAt: str(e.endsAt, 50),
      takeaways: str(e.takeaways, 2000),
      intendedFor: str(e.intendedFor, 1000),
      rsvpUrl: str(e.rsvpUrl, 1000),
    };

    // Sanitize speakers
    const speakersRaw = Array.isArray(result.speakers) ? result.speakers : [];
    const sanitizedSpeakers = speakersRaw
      .filter((s): s is Record<string, unknown> => s !== null && typeof s === "object")
      .map((s) => ({
        name: str(s.name, 200) || "Unknown",
        company: str(s.company, 200),
        position: str(s.position, 200),
        bio: str(s.bio, 4000),
        topic: str(s.topic, 500),
        abstract: str(s.abstract, 6000),
        startTime: str(s.startTime, 50),
        endTime: str(s.endTime, 50),
      }))
      .filter((s) => s.name && s.name !== "Unknown" || s.topic || s.bio);

    const warnings = Array.isArray(result.warnings)
      ? result.warnings.filter((w): w is string => typeof w === "string")
      : [];

    return NextResponse.json({
      event: sanitizedEvent,
      speakers: sanitizedSpeakers,
      warnings,
      provider: providerUsed,
    });
  } catch (err) {
    console.error("[events/extract] parse/sanitize failed:", err);
    return NextResponse.json(
      {
        error: `Extraction failed during response parsing: ${(err as Error).message}`,
      },
      { status: 500 }
    );
  }
}
