/**
 * Kimi (Moonshot AI) HTTP client.
 *
 * Moonshot provides an OpenAI-compatible Chat Completions API. There are
 * two regional endpoints — the same API key works on whichever endpoint
 * matches the platform that issued it:
 *
 *   - https://api.moonshot.cn/v1  — for keys issued at platform.moonshot.cn
 *   - https://api.moonshot.ai/v1  — for keys issued at platform.moonshot.ai
 *                                   (international; this is the default here)
 *
 * Env vars:
 *   KIMI_API_KEY  (required) — sk-... from platform.moonshot.{ai|cn}
 *   KIMI_BASE_URL (optional) — defaults to https://api.moonshot.ai/v1
 *   KIMI_MODEL    (optional) — defaults to "kimi-k2.6" (262k context,
 *                              supports images/video/reasoning; available
 *                              on the international platform)
 *
 * The shape of createChatCompletion() matches zai-client.ts so callers
 * can use either provider interchangeably.
 *
 * Recommended for the event-extraction ("AI prefill event") flow because
 * the free tier is generous and the API is stable + OpenAI-compatible.
 */

export function hasKimiEnv(): boolean {
  return !!process.env.KIMI_API_KEY;
}

export type KimiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type KimiChatCompletionResponse = {
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

/**
 * Send a chat completion request to Moonshot's OpenAI-compatible API.
 *
 * @throws Error if KIMI_API_KEY is not set or the request fails.
 */
export async function createKimiChatCompletion(
  body: {
    messages: KimiChatMessage[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
  }
): Promise<KimiChatCompletionResponse> {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "KIMI_API_KEY env var not set. Get a free key at platform.moonshot.cn " +
        "and set it in your environment (Vercel project settings → " +
        "Environment Variables, or local .env file)."
    );
  }

  const baseUrl = (
    process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1"
  ).replace(/\/$/, "");
  const model = body.model || process.env.KIMI_MODEL || "kimi-k2.6";
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: body.messages,
      temperature: body.temperature ?? 0.2,
      max_tokens: body.max_tokens,
      // Moonshot supports response_format JSON mode, but we keep it off by
      // default — the prompt already instructs strict-JSON output and we
      // strip stray markdown fences defensively on the caller side.
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) {
      hint =
        " — KIMI_API_KEY was rejected. If your key was issued at " +
        "platform.moonshot.ai, the default base URL (api.moonshot.ai) " +
        "is correct. If it was issued at platform.moonshot.cn, set " +
        "KIMI_BASE_URL=https://api.moonshot.cn/v1 in your env.";
    } else if (res.status === 429) {
      hint =
        " — Moonshot quota/balance issue. The error body usually says " +
        "either 'insufficient balance' (recharge at platform.moonshot.ai) " +
        "or 'rate limit' (wait and retry).";
    }
    throw new Error(
      `Kimi chat completions failed (${res.status} ${res.statusText})${hint}: ${errText.slice(0, 500)}`
    );
  }

  return (await res.json()) as KimiChatCompletionResponse;
}
