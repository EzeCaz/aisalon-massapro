// Debug: do the credentials POST and capture the response body + status.
const BASE = "https://aisalon-massapro-git-v515-prep-tab-ezecazs-projects.vercel.app";

function pickCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  const parts = setCookieHeader.split(/,\s*(?=[A-Za-z0-9_-]+=)/);
  return parts.map(c => c.split(";")[0]).filter(Boolean).join("; ");
}

// 1. Get CSRF token + cookies
const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
const cookies1 = pickCookies(csrfRes.headers.get("set-cookie"));
const csrfJson = await csrfRes.json();
const csrfToken = csrfJson.csrfToken;
console.log("csrfToken:", csrfToken.slice(0, 12));
console.log("cookies1:", cookies1);

// 2. POST credentials — capture full response
// NextAuth v4 expects form-urlencoded POST to /api/auth/callback/credentials
// with csrfToken + email + password. The "json: true" param is for the
// _next/auth URL, not the standard callback.
const body = new URLSearchParams({
  email: "eze@massapro.com",
  password: "Massapro2026!",
  csrfToken,
  callbackUrl: "/admin",
}).toString();

const callbackRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie": cookies1,
  },
  body,
  redirect: "manual",
});
console.log("callback status:", callbackRes.status);
console.log("callback headers:");
callbackRes.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));

const callbackText = await callbackRes.text();
console.log("callback body (first 500):", callbackText.slice(0, 500));

const cookies2 = pickCookies(callbackRes.headers.get("set-cookie"));
console.log("cookies2:", cookies2);
