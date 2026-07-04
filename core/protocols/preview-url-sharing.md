# Protocol — Preview URL Sharing Before Deployment

| Field | Value |
|---|---|
| Protocol ID | `preview-url-sharing` |
| Created | 2026-06-28 |
| Owner | Every agent that prepares a version summary or deploy |
| Trigger | Any time a new version is built, fixed, or prepared for deployment |
| Status | ACTIVE — applies to all future summaries and deploys |

---

## Rule (MUST follow)

**Every new version summary that is produced before a deployment MUST end with a clearly labeled `Preview URL` section.** The section must contain at least one reachable URL the user can click to see the running build.

### Required section format

Place this section as the LAST block of the summary, after all task/fix descriptions:

```
---

## Preview URL

- Production (live): https://aisalon.massapro.com
- Vercel deployment: https://aisalon-massapro.vercel.app
- Local dev server:  http://localhost:3000  (running now)
- Local network:     http://21.0.6.200:3000 (same network as the bot workspace)
- Space-Z preview:   https://preview-<bot-id>.space-z.ai/  (only if bot-id is known)
```

If a URL is not reachable at the moment the summary is written, mark it explicitly as `(not running)` or `(unknown)` — never silently omit it. The user must always be able to see at a glance which URLs are usable right now.

---

## Why this protocol exists

The user explicitly asked (2026-06-28):

> "Add to the core that every time that there is a new version before deployment it will automatically share at the end of the summary the preview url"

Before this protocol, summaries described what changed but did not tell the user where to verify the change. The user had no URL to click to see the new version, which forced an extra round-trip just to ask "how do I see it?". This protocol eliminates that round-trip.

---

## URL inventory (what each URL means)

| URL | When it is the right choice |
|---|---|
| `https://aisalon.massapro.com` | The production domain. Use this when the deploy has already shipped to Vercel production. Returns HTTP 307 → `/login` when healthy. |
| `https://aisalon-massapro.vercel.app` | The Vercel deployment alias. Same content as the production domain; useful when DNS is flaky. |
| `https://<branch>-aisalon-massapro.vercel.app` | Per-branch Vercel preview deployment. Available only if the change was pushed to a branch and Vercel auto-deploy is on. |
| `http://localhost:3000` | Local Next.js dev server. Only reachable from the bot workspace itself — useful when the user is screen-sharing with the agent, not for the user's own browser. |
| `http://21.0.6.200:3000` | Local dev server on the container's network interface. Reachable if the user's browser is on the same network as the bot workspace. |
| `https://preview-<bot-id>.space-z.ai/` | Space-Z platform preview URL. Only works if the bot-id is known AND the local dev server is running (the platform proxies this host to the bot's port 3000). |

---

## Bot-id resolution (KNOWN GAP)

The Space-Z preview URL pattern is `https://preview-<bot-id>.space-z.ai/`. To construct it, the agent needs the bot-id at runtime.

**Current state (2026-06-28):** The bot-id is NOT available in any environment variable on the workspace. The following candidates were all tested and returned HTTP 404:

- `FC_FUNCTION_NAME` UUID: `28fa7467-2732-4124-b464-646264dc1fda`
- `SIGMA_APP_NAME` UUID (without `fn-ws-` prefix): same as above
- IM session_id UUID: `7b63371d-94b1-4171-8a8e-e1151b61763f`
- IM chat_id UUID: `604b7c23-05dc-4d4c-8ebf-db5e8a49077c`
- Container hostname: `c-6a40b20f-148bea08-2aab760c94d0`

**Resolution path:** The user must share the bot-id once (it is shown in the Space-Z dashboard URL when they open the bot). Once known, hard-code it into this file in the section below and the rule above. Until then, the Space-Z preview line in the summary should read:

```
- Space-Z preview:   https://preview-<bot-id>.space-z.ai/  (bot-id not yet provided — see core/protocols/preview-url-sharing.md)
```

### Bot-id (fill in once known)

```
BOT_ID = <to be provided by user>
```

When set, the active Space-Z preview URL becomes:

```
https://preview-<BOT_ID>.space-z.ai/
```

---

## Agent execution checklist

Before writing the closing summary of any task that produces or modifies a deployable version:

1. **Verify the local dev server is actually running** on port 3000. If not, start it: `cd /home/z/my-project && nohup bun run dev > dev.log 2>&1 < /dev/null & disown`. Wait 8 seconds, then `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/` — expect 307.
2. **Note the production URL state**: `curl -s -o /dev/null -w "%{http_code}" https://aisalon.massapro.com/` — expect 307.
3. **If the change has already been deployed to Vercel**, also include the Vercel deployment URL.
4. **If the bot-id is known**, include the Space-Z preview URL.
5. **Append the Preview URL section** to the summary using the exact format above.
6. **Never omit the section.** If you have no URLs to share, say so explicitly and explain why (e.g. "dev server crashed and could not be restarted because of X").

---

## Failure modes and how to report them

| Failure | What to write in the summary |
|---|---|
| Local dev server won't start (Prisma error, port conflict, OOM, etc.) | `- Local dev server: NOT RUNNING — <reason>. Fix: <next step>.` |
| Production deploy failed | `- Production: deploy failed at <step>. Rollback status: <state>. No live URL until redeployed.` |
| Bot-id still unknown | `- Space-Z preview: pending bot-id (see core/protocols/preview-url-sharing.md)` |
| User is testing a feature branch | Include the per-branch Vercel preview URL: `https://<branch>-aisalon-massapro.vercel.app` |

---

## Change log

| Date | Change |
|---|---|
| 2026-06-28 | Initial protocol created in response to user request to always share preview URL at end of summary. |
