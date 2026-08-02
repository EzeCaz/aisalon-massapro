/**
 * Google Gemini API client.
 *
 * Gemini's v1beta REST API is at
 * https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *
 * Auth: `X-goog-api-key` header (NOT Bearer). The new key format starts
 * with `AQ.Ab8...`, the legacy format starts with `AIza...`.
 *
 * Env vars:
 *   GEMINI_API_KEY  (required) — from Google AI Studio (aistudio.google.com)
 *   GEMINI_MODEL    (optional) — defaults to "gemini-flash-latest"
 *   GEMINI_BASE_URL (optional) — defaults to
 *                 https://generativelanguage.googleapis.com/v1beta
 *
 * Geographic restriction:
 *   Gemini blocks requests from some regions (e.g. Hong Kong, China).
 *   The dev environment may receive a 400 "User location is not supported
 *   for the API use" — this is NOT an auth failure. Production on Vercel
 *   (us-east-1, etc.) works fine.
 *
 * The shape of createGeminiChatCompletion() matches kimi-client.ts and
 * zai-client.ts so callers can use any provider interchangeably.
 */

export function hasGeminiEnv(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export type GeminiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type GeminiChatCompletionResponse = {
  choices: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
    index?: number;
  }>;
  id?: string;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type GeminiRawResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }>; role?: string };
    finishReason?: string;
    index?: number;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
  modelVersion?: string;
};

/**
 * Send a chat completion request to Gemini's v1beta generateContent API.
 * Accepts the same { messages, temperature, max_tokens, model } shape as
 * the Kimi/ZAI clients and adapts it to Gemini's contents/systemInstruction
 * format. Returns an OpenAI-compatible response shape so callers don't
 * need to know which provider answered.
 *
 * @throws Error if GEMINI_API_KEY is not set or the request fails.
 */
export async function createGeminiChatCompletion(
  body: {
    messages: GeminiChatMessage[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
  }
): Promise<GeminiChatCompletionResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY env var not set. Get a key at aistudio.google.com " +
        "(or console.cloud.google.com → APIs → Gemini API) and set it in " +
        "your environment (Vercel project settings → Environment " +
        "Variables, or local .env file)."
    );
  }

  const baseUrl = (
    process.env.GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, "");
  const model = body.model || process.env.GEMINI_MODEL || "gemini-flash-latest";
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;

  // Split messages: system → systemInstruction, user/assistant → contents
  const systemParts: Array<{ text: string }> = [];
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of body.messages) {
    if (m.role === "system") {
      systemParts.push({ text: m.content });
    } else {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }
  }

  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: body.temperature ?? 0.2,
      maxOutputTokens: body.max_tokens,
      // Ask Gemini to emit JSON directly — much more reliable than
      // prompt-engineering the model to output JSON.
      responseMimeType: "application/json",
    },
  };
  if (systemParts.length > 0) {
    requestBody.systemInstruction = { parts: systemParts };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  const raw = (await res.json().catch(() => ({}))) as GeminiRawResponse;

  if (!res.ok || raw.error) {
    const errCode = raw.error?.code || res.status;
    const errMsg = raw.error?.message || `${res.status} ${res.statusText}`;
    let hint = "";
    if (errCode === 400 && /location is not supported/i.test(errMsg)) {
      hint =
        " — Gemini API is blocked in this region. Run from a supported " +
        "region (e.g. US/EU) or deploy on Vercel (us-east-1). Auth is " +
        "fine; this is a geographic block.";
    } else if (errCode === 400 && /API key not valid/i.test(errMsg)) {
      hint =
        " — GEMINI_API_KEY is invalid or has been revoked. Re-issue at " +
        "aistudio.google.com.";
    } else if (errCode === 429) {
      hint =
        " — Gemini quota exceeded. Check your quota at aistudio.google.com " +
        "→ Settings → API keys, or upgrade to a paid tier in Google Cloud.";
    }
    throw new Error(
      `Gemini generateContent failed (${errCode})${hint}: ${errMsg.slice(0, 500)}`
    );
  }

  // Adapt to OpenAI-compatible shape
  const candidate = raw.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text || "")
    .join("") || "";

  return {
    id: undefined,
    model: raw.modelVersion || model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: candidate?.finishReason || "stop",
      },
    ],
    usage: raw.usageMetadata
      ? {
          prompt_tokens: raw.usageMetadata.promptTokenCount,
          completion_tokens: raw.usageMetadata.candidatesTokenCount,
          total_tokens: raw.usageMetadata.totalTokenCount,
        }
      : undefined,
  };
}
