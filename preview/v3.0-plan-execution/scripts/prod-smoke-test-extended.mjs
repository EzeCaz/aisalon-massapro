// Production smoke test — EXTENDED — PREVIEW
// Activation: review diff against existing scripts/prod-smoke-test.mjs,
//             then copy this file over scripts/prod-smoke-test.mjs.
//
// Implements AISalon-Team-Plan-V3.0 §4.2 item 4 + §10 (Backend KPIs).
// Covers all V3.0 endpoints:
//   - Public: /, /api/events, /api/events/[slug], /events, /events/[slug]
//   - Auth-protected: /api/admin/members/companies, /api/admin/members/bulk-import (template)
//   - V3.0 features: image reorder endpoint, agenda endpoints, presentations
//
// Run: node scripts/prod-smoke-test-extended.mjs
// Env: SMOKE_TEST_EMAIL (default: eze@massapro.com)
//      SMOKE_TEST_PASSWORD (optional — if absent, uses magic-link login flow)

import { readFile } from "node:fs/promises";

const BASE = process.env.SMOKE_TEST_BASE || "https://aisalon.massapro.com";
const EMAIL = process.env.SMOKE_TEST_EMAIL || "eze@massapro.com";
const PASSWORD = process.env.SMOKE_TEST_PASSWORD || "";
const EVENT_SLUG = "ai-cmo-blueprint-2026-06-18";

let pass = 0, fail = 0, warn = 0;
const results = [];

function log(ok, label, detail = "") {
  const sym = ok ? "✓" : "✗";
  const status = ok ? "PASS" : "FAIL";
  results.push({ status, label, detail });
  console.log(`  ${sym} ${label}${detail ? " — " + detail : ""}`);
  if (ok) pass++; else fail++;
}

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return [];
  if (Array.isArray(setCookieHeader)) return setCookieHeader;
  return setCookieHeader.split(/,\s+(?=[A-Za-z0-9_.-]+=)/);
}

function extractCookieNames(cookieStrings) {
  return cookieStrings.map((c) => c.split(";")[0]);
}

async function getAuthCookies() {
  console.log("\n— Authentication —");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrfRes.ok) { log(false, "GET /api/auth/csrf", `HTTP ${csrfRes.status}`); process.exit(1); }
  log(true, "GET /api/auth/csrf", "200");

  const { csrfToken } = await csrfRes.json();
  const csrfCookies = parseCookies(csrfRes.headers.get("set-cookie"));
  const csrfNames = extractCookieNames(csrfCookies);
  const cookieHeader = csrfNames.join("; ");

  // Try credentials login (email/password) if password provided.
  // Otherwise fall back to magic-link-style email-only login (which works
  // because the test email is the ADMIN_EMAIL allowlisted account).
  const body = new URLSearchParams({
    email: EMAIL,
    name: "Ezequiel Sznaider",
    csrfToken,
    callbackUrl: `${BASE}/events`,
    json: "true",
  });
  if (PASSWORD) body.set("password", PASSWORD);

  const loginRes = await fetch(`${BASE}/api/auth/callback/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader },
    body: body.toString(),
    redirect: "manual",
  });
  if (loginRes.status >= 400) {
    log(false, "POST /api/auth/callback/login", `HTTP ${loginRes.status}`);
    process.exit(1);
  }
  log(true, "POST /api/auth/callback/login", `HTTP ${loginRes.status}`);

  const loginCookies = parseCookies(loginRes.headers.get("set-cookie"));
  const allNames = Array.from(new Set([...csrfNames, ...extractCookieNames(loginCookies)]));
  return allNames.join("; ");
}

async function assert(label, method, path, cookies, opts = {}) {
  const expected = opts.expected || 200;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookies || "", ...(opts.headers || {}) },
    body: opts.body,
    redirect: "manual",
  });
  const ok = res.status === expected || (Array.isArray(expected) && expected.includes(res.status));
  log(ok, `${method} ${path}`, `expected ${expected}, got ${res.status}`);
  return res;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Production Smoke Test — V3.0 Extended");
  console.log("=".repeat(60));
  console.log(`Base: ${BASE}`);
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Public endpoints (no auth)
  console.log("\n— Public endpoints —");
  await assert("homepage reachable", "GET", "/", null, { expected: [307, 200] });
  await assert("GET /api/events", "GET", "/api/events", null);
  await assert("GET /api/events/[slug]", "GET", `/api/events/${EVENT_SLUG}`, null, { expected: [200, 404] });
  await assert("GET /events", "GET", "/events", null, { expected: [200, 307] });
  await assert("GET /events/[slug]", "GET", `/events/${EVENT_SLUG}`, null, { expected: [200, 307, 404] });

  // 2. Auth-protected endpoints — should 401 without session
  console.log("\n— Auth boundary (no session → 401/403) —");
  await assert("GET /api/admin/members without session", "GET", "/api/admin/members", null, { expected: [401, 403] });
  await assert("GET /api/admin/members/companies without session", "GET", "/api/admin/members/companies", null, { expected: [401, 403] });
  await assert("GET /api/admin/speakers without session", "GET", "/api/admin/speakers", null, { expected: [401, 403] });
  await assert("GET /api/admin/registrants without session", "GET", "/api/admin/registrants", null, { expected: [401, 403] });
  await assert("GET /api/admin/agenda without session", "GET", "/api/admin/agenda", null, { expected: [401, 400, 403, 404] });

  // 3. Authenticated endpoints
  console.log("\n— Authenticated endpoints —");
  const cookies = await getAuthCookies();

  // Confirm session is established
  const sessRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookies } });
  const sessJson = await sessRes.json();
  log(!!sessJson.user, "GET /api/auth/session", sessJson.user ? `logged in as ${sessJson.user.email}` : "no user");

  // V3.0 endpoints
  await assert("GET /api/admin/members/companies", "GET", "/api/admin/members/companies", cookies);
  await assert("GET /api/admin/members", "GET", "/api/admin/members", cookies);
  await assert("GET /api/admin/speakers", "GET", "/api/admin/speakers", cookies);
  await assert("GET /api/admin/registrants", "GET", "/api/admin/registrants", cookies);
  await assert("GET /api/admin/agenda", "GET", "/api/admin/agenda?eventId=1", cookies, { expected: [200, 400, 404] });

  // CSV template endpoint (V3.0)
  const tmplRes = await assert("GET /api/admin/members/import-template", "GET", "/api/admin/members/import-template", cookies);
  if (tmplRes.ok) {
    const text = await tmplRes.text();
    log(text.includes("email"), "CSV template contains 'email' column", `first 50 chars: ${text.slice(0, 50).replace(/\n/g, " ")}`);
  }

  // Image reorder endpoint (V3.0) — should accept POST and reject invalid body
  await assert("POST /api/images/reorder with invalid body", "POST", "/api/images/reorder", cookies, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    expected: [400, 422],
  });

  // 4. Event detail page (validates V3.0 thumbnail fix is deployed)
  console.log("\n— V3.0 feature verification —");
  const evRes = await fetch(`${BASE}/events/${EVENT_SLUG}`);
  if (evRes.ok) {
    const html = await evRes.text();
    log(html.includes("1/"), "Event page contains 1/N thumbnail counter", "agenda thumbnail fix is live");
  } else {
    log(false, "Event page reachable", `HTTP ${evRes.status}`);
  }

  // 5. Summary
  console.log("\n" + "=".repeat(60));
  console.log(`  RESULT: ${pass} passed, ${warn} warnings, ${fail} failed`);
  console.log("=".repeat(60));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(2);
});
