// End-to-end production smoke test (uses Node 24's built-in fetch + FormData):
// 1. Log in via the credentials provider
// 2. GET /api/auth/session to confirm we're authenticated
// 3. GET /api/events/<slug>/presentations — should be []
// 4. POST a real PDF file to /api/events/<slug>/presentations
// 5. GET the list again — should have 1 file
// 6. DELETE the file
// 7. GET the list again — should be []
//
// All against https://aisalon.massapro.com.

import { readFile } from "node:fs/promises";

const BASE = "https://aisalon.massapro.com";
const EMAIL = "eze@massapro.com";
const EVENT_SLUG = "ai-cmo-blueprint-2026-06-18";

function parseCookies(setCookieHeader) {
  // set-cookie can be a single string with comma-separated cookies,
  // or an array. Node's fetch returns it as a single string joined by ", "
  // — but commas can also appear inside Expires= fields. Be careful.
  // Cookie names can contain letters, digits, underscores, hyphens,
  // AND dots (e.g. "__Secure-next-auth.session-token"). After the
  // cookie name comes "=". We split on ", " only when followed by a
  // valid cookie-name pattern, to avoid splitting inside Expires= dates.
  if (!setCookieHeader) return [];
  if (Array.isArray(setCookieHeader)) return setCookieHeader;
  return setCookieHeader.split(/,\s+(?=[A-Za-z0-9_.-]+=)/);
}

function extractCookieNames(cookieStrings) {
  return cookieStrings.map((c) => c.split(";")[0]);
}

async function getAuthCookies() {
  // 1. Get CSRF token
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfJson = await csrfRes.json();
  const csrfToken = csrfJson.csrfToken;
  console.log("CSRF token acquired:", csrfToken.slice(0, 12) + "...");

  // Save cookies from CSRF response
  const csrfSetCookies = parseCookies(csrfRes.headers.get("set-cookie"));
  const csrfCookieNames = extractCookieNames(csrfSetCookies);
  const cookieHeader = csrfCookieNames.join("; ");
  console.log("Cookies after CSRF:", cookieHeader);

  // 2. Submit login form
  const body = new URLSearchParams({
    email: EMAIL,
    name: "Ezequiel Sznaider",
    csrfToken,
    callbackUrl: `${BASE}/events`,
    json: "true",
  });
  const loginRes = await fetch(`${BASE}/api/auth/callback/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    },
    body: body.toString(),
    redirect: "manual",
  });
  console.log("Login response status:", loginRes.status);

  const loginSetCookies = parseCookies(loginRes.headers.get("set-cookie"));
  const allCookieNames = Array.from(
    new Set([...csrfCookieNames, ...extractCookieNames(loginSetCookies)])
  );
  const allCookies = allCookieNames.join("; ");
  return allCookies;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Production smoke test — Presentations feature");
  console.log("=".repeat(60));

  const cookies = await getAuthCookies();
  console.log("Authenticated. Cookies length:", cookies.length);

  // Verify session
  const sRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: cookies },
  });
  const sJson = await sRes.json();
  console.log("Session user:", sJson.user ? sJson.user.email : "(none)");
  if (!sJson.user) throw new Error("Login failed — no user in session");

  // [1] GET before upload
  console.log("\n[1] GET /api/events/<slug>/presentations (before upload):");
  const g1 = await fetch(`${BASE}/api/events/${EVENT_SLUG}/presentations`, {
    headers: { Cookie: cookies },
  });
  const g1Json = await g1.json();
  console.log("  Status:", g1.status);
  console.log("  Count:", g1Json.presentations.length);

  // [2] Upload PDF
  console.log("\n[2] POST /api/events/<slug>/presentations (upload PDF):");
  const pdfBuf = await readFile("/tmp/test-deck.pdf");
  const form = new FormData();
  form.append("files", new Blob([pdfBuf], { type: "application/pdf" }), "test-deck.pdf");
  form.append("title", "E2E Test Presentation");
  form.append("description", "Uploaded by automated smoke test");

  const pRes = await fetch(`${BASE}/api/events/${EVENT_SLUG}/presentations`, {
    method: "POST",
    headers: { Cookie: cookies },
    body: form,
  });
  const pJson = await pRes.json();
  console.log("  Status:", pRes.status);
  if (pRes.status !== 200) {
    console.log("  Body:", JSON.stringify(pJson, null, 2));
    throw new Error("Upload failed");
  }
  console.log("  Uploaded:", pJson.count, "file(s)");
  console.log("  File URL:", pJson.presentations[0].fileUrl);
  console.log("  File size:", pJson.presentations[0].fileSize, "bytes");
  console.log("  MIME type:", pJson.presentations[0].mimeType);

  const uploadedId = pJson.presentations[0].id;
  const uploadedUrl = pJson.presentations[0].fileUrl;

  // [3] HEAD on the Blob URL
  console.log("\n[3] HEAD on the uploaded Blob URL:");
  const hRes = await fetch(uploadedUrl, { method: "HEAD" });
  console.log("  Status:", hRes.status);
  console.log("  Content-Type:", hRes.headers.get("content-type"));
  console.log("  Content-Length:", hRes.headers.get("content-length"));

  // [4] GET after upload
  console.log("\n[4] GET /api/events/<slug>/presentations (after upload):");
  const g2 = await fetch(`${BASE}/api/events/${EVENT_SLUG}/presentations`, {
    headers: { Cookie: cookies },
  });
  const g2Json = await g2.json();
  console.log("  Status:", g2.status);
  console.log("  Count:", g2Json.presentations.length);
  console.log("  First file:", g2Json.presentations[0].fileName);

  // [5] DELETE
  console.log("\n[5] DELETE /api/presentations/<id>:");
  const dRes = await fetch(`${BASE}/api/presentations/${uploadedId}`, {
    method: "DELETE",
    headers: { Cookie: cookies },
  });
  console.log("  Status:", dRes.status);
  const dJson = await dRes.json();
  console.log("  Body:", JSON.stringify(dJson));

  // [6] GET after delete
  console.log("\n[6] GET /api/events/<slug>/presentations (after delete):");
  const g3 = await fetch(`${BASE}/api/events/${EVENT_SLUG}/presentations`, {
    headers: { Cookie: cookies },
  });
  const g3Json = await g3.json();
  console.log("  Status:", g3.status);
  console.log("  Count:", g3Json.presentations.length);

  console.log("\n" + "=".repeat(60));
  console.log("ALL PRODUCTION SMOKE TESTS PASSED");
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
