import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  hasLlm,
  createChatCompletion,
  getActiveProvider,
} from "@/lib/zai-client";
import ZAI from "z-ai-web-dev-sdk";
import {
  createGeminiChatCompletion,
  hasGeminiEnv,
} from "@/lib/gemini-client";

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
 *   suggestions: { subtitle?: string[], takeaways?: string[],
 *                  intendedFor?: string[], description?: string[] },
 *   bilingual: { detected: boolean, primaryLanguage: string,
 *                secondaryLanguage: string | null, languages: string[] },
 *   warnings: string[],
 *   provider: string
 * }
 *
 * Admin-only (any role with members.view).
 *
 * The LLM is instructed to return STRICT JSON. We parse it defensively
 * and fall back to null for any missing/invalid field. The frontend
 * uses the response to pre-fill the New Event form, but the user can
 * still review and edit everything before saving.
 *
 * LLM provider selection (in priority order):
 *   1. GEMINI_API_KEY   — Google Gemini (RECOMMENDED; free at aistudio.google.com,
 *      native JSON output mode, fast Flash model). NOTE: Gemini blocks some
 *      regions (HK/CN) — dev server may get 400 "User location is not supported",
 *      which is NOT an auth failure. Vercel us-east-1 works fine.
 *   2. KIMI_API_KEY     — Moonshot Kimi (OpenAI-compatible). Keys from
 *      platform.moonshot.ai must use api.moonshot.ai; keys from
 *      platform.moonshot.cn must use api.moonshot.cn. Set KIMI_BASE_URL
 *      accordingly.
 *   3. OPENAI_API_KEY   — OpenAI or any OpenAI-compatible provider via
 *      OPENAI_BASE_URL (Together, Groq, OpenRouter…).
 *   4. ZAI_BASE_URL + ZAI_API_KEY — ZAI internal API (DEV ONLY).
 *      `internal-api.z.ai` resolves to private IPs (172.25.x.x) that are
 *      NOT reachable from Vercel's public network — only works in the
 *      Super Z dev runtime.
 *   5. Otherwise (local dev, where /etc/.z-ai-config is installed by the
 *      Super Z runtime), fall back to the official SDK's ZAI.create().
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

  const systemPrompt = `You are an event extraction assistant for AI Salon, a global community of AI founders, builders, and investors.

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
    "country": "string | null — ISO 3-letter code, e.g. 'ISR', 'USA', 'CAN'",
    "mapUrl": "string | null — Google Maps URL if mentioned",
    "startsAt": "ISO 8601 string | null — e.g. '2026-06-18T18:00:00'. If the text says 'June 18, 2026 | 18:00 – 21:15', startsAt = '2026-06-18T18:00:00'. Use the timezone specified in the text (e.g. 'EDT' → America/New_York, 'IST' → Asia/Jerusalem). If no timezone is specified, assume Asia/Jerusalem (UTC+3). If year is missing, assume the next occurrence of that date.",
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
  "suggestions": {
    "subtitle": ["string — suggested option 1", "string — suggested option 2"],
    "takeaways": ["string — suggested option 1", "string — suggested option 2"],
    "intendedFor": ["string — suggested option 1", "string — suggested option 2"],
    "description": ["string — suggested option 1", "string — suggested option 2"]
  },
  "bilingual": {
    "detected": false,
    "primaryLanguage": "en",
    "secondaryLanguage": null,
    "languages": ["en"]
  },
  "warnings": ["string — any field you couldn't extract confidently, e.g. 'Year not specified in text — assumed 2026'"]
}

Rules:
1. Output ONLY the JSON object. No prose, no \`\`\`json fences.
2. Use null for any field that can't be confidently extracted FROM THE TEXT DIRECTLY.
3. Plain text everywhere — strip emojis, markdown asterisks, bullets, and HTML.
4. For dates without a year, assume the next upcoming occurrence (today is 2026-08-03).
5. Speakers: include ANY person mentioned with a speaking role. If you can't tell if someone is speaking vs. just mentioned, include them with a warning.
6. Don't invent data for the \`event\` fields — if a field isn't in the text, use null.

SUGGESTIONS — generate for any field that came back null:
- For each null field in \`event\` (subtitle, takeaways, intendedFor, description), generate EXACTLY TWO suggested options based on the rest of the extracted info (title, venue, speakers, agenda, host, chapter).
- The suggestions key MUST exist in the output. For fields that were successfully extracted (not null), set the value to an empty array [].
- For null fields, provide 2 distinct, concrete, ready-to-use options. Don't be vague.
- Example: if subtitle is null but title='AI Salon Montreal — September' and description mentions founders/investors/networking, suggest: ["Founders, investors, and builders sharing hard-earned AI scaling lessons", "An evening of AI startup insights, pitches, and Montreal ecosystem networking"].
- Example: if takeaways is null, suggest 2 concrete lists based on the agenda (e.g. ["Keynote insights on scaling AI startups, Live startup demos and pitches, Networking with Montreal AI ecosystem leaders", "Practical AI scaling playbook, Pitch feedback from active investors, Connections with Montreal's AI research community"]).
- Omit a field from \`suggestions\` entirely ONLY if it doesn't make sense to suggest (e.g. startsAt, endsAt, mapUrl, rsvpUrl, venue, address, city, country — these are factual, not generative).

BILINGUAL DETECTION — detect if the input contains the same content in 2+ languages:
- Common case: French + English, Spanish + English, Hebrew + English, etc.
- Set \`bilingual.detected\` to true if the text contains the SAME event info repeated in 2+ languages.
- Set \`bilingual.primaryLanguage\` to the ISO 639-1 code of the PRIMARY language (usually English — "en").
- Set \`bilingual.secondaryLanguage\` to the ISO 639-1 code of the SECONDARY language (e.g. "fr", "es", "he").
- Set \`bilingual.languages\` to the array of all detected languages, primary first.
- When bilingual is detected, for each text field (title, subtitle, description, takeaways, intendedFor), CONCATENATE both versions with a blank line, a horizontal rule of dashes, and another blank line between them. PRIMARY language FIRST, then secondary. Format:
    "English version of the text.\n\n---\n\nVersion française du texte."
- For title: keep it as a single line if both languages use the same title; only split if there are distinct titles per language.
- If only one language is present, set \`bilingual.detected\` to false, \`secondaryLanguage\` to null, and \`languages\` to ["en"] (or whichever single language was detected).
- If you're unsure whether something is bilingual (e.g. a few foreign words in an otherwise English post), treat it as monolingual.`;

  // Provider priority: Gemini → Kimi → OpenAI → ZAI env → ZAI SDK (dev only).
  // Gemini is the recommended provider for this prefill flow — free tier
  // at aistudio.google.com, native JSON output mode, fast Flash model.
  // Note: Gemini blocks some regions (HK/CN) — if running from a blocked
  // region, set GEMINI_API_KEY in Vercel env vars and deploy instead of
  // testing locally, or fall back to Kimi.
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: text },
  ];

  let raw = "";
  let providerUsed = "";

  try {
    if (hasGeminiEnv()) {
      providerUsed = "gemini";
      const geminiRes = await createGeminiChatCompletion({
        messages,
        temperature: 0.2,
        // gemini-flash-latest is fast + cheap; the system prompt asks for
        // JSON, and the client sets responseMimeType=application/json
        // so Gemini emits strict JSON directly.
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      });
      raw = geminiRes.choices[0]?.message?.content || "";
    } else if (hasLlm()) {
      // Unified zai-client.ts path: Kimi (Option A) → OpenAI-compatible
      // (Option B/C) → ZAI internal (Option D, dev only). Works on Vercel.
      providerUsed = getActiveProvider() || "llm";
      const completion = await createChatCompletion({
        messages,
        thinking: { type: "disabled" },
      });
      raw = completion.choices[0]?.message?.content || "";
    } else {
      // Dev fallback: use the SDK, which reads /etc/.z-ai-config installed
      // by the Super Z runtime. This path will NOT work on Vercel.
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
    const msg = (err as Error).message || String(err);

    // Surface actionable errors for the common failure modes:
    //
    // 1. "fetch failed" — Node.js fetch threw at the network level. On
    //    Vercel this happens because `internal-api.z.ai` resolves to
    //    private IPs (172.25.x.x) that aren't routable from Vercel's
    //    public network. Fix: switch to a public provider by setting
    //    GEMINI_API_KEY (recommended) or KIMI_API_KEY / OPENAI_API_KEY.
    //
    // 2. "Configuration file not found" / ".z-ai-config" — SDK fallback
    //    failed because no /etc/.z-ai-config exists (Vercel's read-only
    //    filesystem). Same fix: set GEMINI_API_KEY.
    //
    // 3. "User location is not supported" — Gemini region block. Fix:
    //    deploy on Vercel (us-east-1) or fall back to KIMI_API_KEY.
    if (
      msg.includes("fetch failed") ||
      msg.includes("Configuration file not found") ||
      msg.includes(".z-ai-config") ||
      msg.includes("ZAI env vars not set") ||
      msg.includes("No LLM provider configured")
    ) {
      return NextResponse.json(
        {
          error:
            "AI service is not reachable from this server. " +
            "Set GEMINI_API_KEY (recommended — free at aistudio.google.com) " +
            "or KIMI_API_KEY / OPENAI_API_KEY in Vercel Project Settings → " +
            "Environment Variables, then redeploy. " +
            "See src/lib/zai-client.ts and src/lib/gemini-client.ts for details.",
          provider: providerUsed,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        error: `AI extraction failed via ${providerUsed}: ${msg}`,
        hint:
          "Set GEMINI_API_KEY (free at aistudio.google.com) — the recommended " +
          "provider. If Gemini is region-blocked, fall back to KIMI_API_KEY " +
          "(platform.moonshot.ai) or OPENAI_API_KEY.",
        provider: providerUsed,
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
      suggestions?: Record<string, unknown>;
      bilingual?: Record<string, unknown>;
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

    // ---- Sanitize suggestions (per-field array of 2 options for null fields) ----
    // The LLM is instructed to generate suggestions for: subtitle, takeaways,
    // intendedFor, description. We accept any subset and clamp each list to 4
    // options max for safety.
    const SUGGESTIBLE_FIELDS = [
      "subtitle",
      "takeaways",
      "intendedFor",
      "description",
    ] as const;
    type Suggestions = Partial<Record<(typeof SUGGESTIBLE_FIELDS)[number], string[]>>;
    const suggestionsRaw = (result.suggestions && typeof result.suggestions === "object"
      ? result.suggestions
      : {}) as Record<string, unknown>;
    const sanitizedSuggestions: Suggestions = {};
    for (const field of SUGGESTIBLE_FIELDS) {
      const list = suggestionsRaw[field];
      if (Array.isArray(list)) {
        const opts = list
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim().slice(0, 2000))
          .slice(0, 4);
        if (opts.length > 0) sanitizedSuggestions[field] = opts;
      }
    }

    // ---- Sanitize bilingual metadata ----
    // The LLM tells us whether the input was bilingual + which languages.
    // The actual bilingual CONTENT is already inside `event.description` etc.
    // (concatenated EN + secondary with a "---" separator), so we just pass
    // the metadata through for the frontend to show a banner.
    const bilingualRaw = (result.bilingual && typeof result.bilingual === "object"
      ? result.bilingual
      : {}) as Record<string, unknown>;
    const langStr = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim().toLowerCase().slice(0, 5);
      return s || null;
    };
    const sanitizedBilingual = {
      detected: bilingualRaw.detected === true,
      primaryLanguage: langStr(bilingualRaw.primaryLanguage) || "en",
      secondaryLanguage: langStr(bilingualRaw.secondaryLanguage),
      languages: Array.isArray(bilingualRaw.languages)
        ? (bilingualRaw.languages as unknown[])
            .map((v) => langStr(v))
            .filter((v): v is string => !!v)
            .slice(0, 4)
        : ["en"],
    };

    return NextResponse.json({
      event: sanitizedEvent,
      speakers: sanitizedSpeakers,
      warnings,
      suggestions: sanitizedSuggestions,
      bilingual: sanitizedBilingual,
      provider: providerUsed,
    });
  } catch (err) {
    console.error("[events/extract] parse/sanitize failed:", err);
    return NextResponse.json(
      {
        error: `Extraction failed during response parsing: ${(err as Error).message}`,
        provider: providerUsed,
      },
      { status: 500 }
    );
  }
}
