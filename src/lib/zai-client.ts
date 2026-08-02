/**
 * LLM HTTP client (OpenAI-compatible).
 *
 * Background:
 *   The original implementation used the `z-ai-web-dev-sdk` which reads a
 *   `.z-ai-config` file from `process.cwd()`, `os.homedir()`, or `/etc/`.
 *   That works in the Super Z dev runtime (which installs `/etc/.z-ai-config`)
 *   but FAILS on Vercel production (read-only filesystem, no config file).
 *
 *   We then switched to env-var-based config pointing at
 *   `https://internal-api.z.ai/v1`. That works in dev (inside the z.ai
 *   infrastructure) BUT `internal-api.z.ai` resolves to RFC 1918 private
 *   IPs (172.25.x.x) which are NOT routable from Vercel's public network.
 *   Result: `fetch failed` on every call.
 *
 * Solution:
 *   This module is now provider-agnostic. It accepts any OpenAI-compatible
 *   chat-completions endpoint. Set the env vars for whichever provider
 *   you have access to:
 *
 *   Option A — OpenAI (works everywhere, public API):
 *     OPENAI_API_KEY  = sk-...
 *     OPENAI_BASE_URL = https://api.openai.com/v1   (optional, this is the default)
 *     OPENAI_MODEL    = gpt-4o-mini                 (optional, default)
 *
 *   Option B — Any OpenAI-compatible provider (Together, Groq, OpenRouter,
 *   Fireworks, Anyscale, local Ollama, etc.):
 *     OPENAI_API_KEY  = <provider key>
 *     OPENAI_BASE_URL = https://api.together.xyz/v1   (or similar)
 *     OPENAI_MODEL    = meta-llama/Llama-3.1-70B-Instruct-Turbo
 *
 *   Option C — ZAI internal API (DEV ONLY — not reachable from Vercel):
 *     ZAI_BASE_URL = https://internal-api.z.ai/v1
 *     ZAI_API_KEY  = Z.ai
 *     ZAI_CHAT_ID  = chat-...   (optional)
 *     ZAI_USER_ID  = ...        (optional)
 *     ZAI_TOKEN    = ...        (optional)
 *
 *   Selection order:
 *     1. If OPENAI_API_KEY is set → use OpenAI-compatible path (Option A/B).
 *     2. Else if ZAI_BASE_URL + ZAI_API_KEY are set → use ZAI internal path (Option C, dev only).
 *     3. Else hasLlm() returns false → caller falls back to the SDK.
 */

export function hasLlm(): boolean {
  return !!(
    process.env.OPENAI_API_KEY ||
    (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY)
  );
}

/** @deprecated use hasLlm() — kept for backward compat with existing callers. */
export function hasZaiEnv(): boolean {
  return hasLlm();
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
 * Send a chat completion request. Mirrors the OpenAI (and z-ai-web-dev-sdk)
 * `chat.completions.create()` shape — same request body, same response shape.
 *
 * Provider is auto-selected from env vars (see module docstring).
 *
 * @throws Error if no provider is configured or the request fails.
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
  // ---- Option A/B: OpenAI-compatible (preferred — works on Vercel) ----
  if (process.env.OPENAI_API_KEY) {
    const baseUrl = (
      process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    const url = `${baseUrl}/chat/completions`;
    const model = body.model || process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Strip the ZAI-specific `thinking` field — OpenAI doesn't know it.
    // (OpenAI uses `reasoning_effort` for o-series models, but for the
    // extract use case we don't need extended reasoning.)
    const { thinking: _thinking, ...openAiBody } = body;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ ...openAiBody, model }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `OpenAI chat completions failed (${res.status} ${res.statusText}): ${errText.slice(0, 500)}`
      );
    }
    return (await res.json()) as ChatCompletionResponse;
  }

  // ---- Option C: ZAI internal API (dev only — not reachable from Vercel) ----
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "No LLM provider configured. Set either OPENAI_API_KEY " +
        "(recommended — works on Vercel) or ZAI_BASE_URL + ZAI_API_KEY " +
        "(dev only). See src/lib/zai-client.ts for details."
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
