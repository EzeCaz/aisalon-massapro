/**
 * ZAI-compatible HTTP client.
 *
 * The official z-ai-web-dev-sdk reads config from a `.z-ai-config` JSON
 * file in process.cwd(), os.homedir(), or /etc/. This works in local
 * dev (where /etc/.z-ai-config is installed by the Super Z runtime),
 * but FAILS on Vercel production (read-only filesystem, no config file).
 *
 * This module reads the same config fields from env vars, and exposes
 * the same `chat.completions.create` interface as the SDK. The extract
 * route uses this directly instead of `ZAI.create()` so it works in
 * both environments.
 *
 * Env vars (set these in Vercel project settings → Environment Variables):
 *   ZAI_BASE_URL  e.g. https://internal-api.z.ai/v1
 *   ZAI_API_KEY   e.g. Z.ai
 *   ZAI_CHAT_ID   optional — X-Chat-Id header
 *   ZAI_USER_ID   optional — X-User-Id header
 *   ZAI_TOKEN     optional — X-Token header
 *
 * If ZAI_BASE_URL + ZAI_API_KEY are not set, hasZaiEnv() returns false
 * and callers can fall back to the SDK (which only works in dev).
 */

export function hasZaiEnv(): boolean {
  return !!(process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY);
}

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ChatCompletionResponse = {
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
 * Send a chat completion request to the ZAI internal API. Mirrors the
 * SDK's `zai.chat.completions.create()` shape — same request body,
 * same response shape. Only depends on env vars (no .z-ai-config file).
 *
 * @throws Error if env vars are missing or the request fails.
 */
export async function createChatCompletion(
  body: {
    messages: ChatCompletionMessage[];
    thinking?: { type: "enabled" | "disabled" };
    temperature?: number;
    max_tokens?: number;
    model?: string;
  }
): Promise<ChatCompletionResponse> {
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "ZAI env vars not set. Set ZAI_BASE_URL and ZAI_API_KEY " +
      "(and optionally ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN) " +
      "in your Vercel project environment variables."
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "X-Z-AI-From": "Z",
  };
  if (process.env.ZAI_CHAT_ID) headers["X-Chat-Id"] = process.env.ZAI_CHAT_ID;
  if (process.env.ZAI_USER_ID) headers["X-User-Id"] = process.env.ZAI_USER_ID;
  if (process.env.ZAI_TOKEN) headers["X-Token"] = process.env.ZAI_TOKEN;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      // Match the SDK default — disable thinking unless caller overrides.
      thinking: body.thinking ?? { type: "disabled" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `ZAI chat completions failed (${res.status} ${res.statusText}): ${errText.slice(0, 500)}`
    );
  }

  return (await res.json()) as ChatCompletionResponse;
}
