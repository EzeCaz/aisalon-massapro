/**
 * Kimi (Moonshot AI) HTTP client.
 *
 * Moonshot provides an OpenAI-compatible Chat Completions API at
 * https://api.moonshot.cn/v1/chat/completions. The free tier at
 * platform.moonshot.cn issues an API key starting with `sk-...`.
 *
 * Env vars:
 *   KIMI_API_KEY  (required) — sk-... from platform.moonshot.cn
 *   KIMI_BASE_URL (optional) — defaults to https://api.moonshot.cn/v1
 *   KIMI_MODEL    (optional) — defaults to "moonshot-v1-32k"
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
    process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1"
  ).replace(/\/$/, "");
  const model = body.model || process.env.KIMI_MODEL || "moonshot-v1-32k";
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
    throw new Error(
      `Kimi chat completions failed (${res.status} ${res.statusText}): ${errText.slice(0, 500)}`
    );
  }

  return (await res.json()) as KimiChatCompletionResponse;
}
