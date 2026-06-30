// Same as check-admin-tabs.mjs but print the callback response body.
const BASE = "https://aisalon-massapro-git-v515-prep-tab-ezecazs-projects.vercel.app";

function pickCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  const parts = setCookieHeader.split(/,\s*(?=[A-Za-z0-9_-]+=)/);
  return parts.map(c => c.split(";")[0]).filter(Boolean).join("; ");
}

const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
const cookies1 = pickCookies(csrfRes.headers.get("set-cookie"));
const csrfJson = await csrfRes.json();
const csrfToken = csrfJson.csrfToken;
console.log("csrfToken:", csrfToken.slice(0, 12));

const body = new URLSearchParams({
  email: "eze@massapro.com",
  password: "Massapro2026!",
  csrfToken,
  callbackUrl: "/admin",
  json: "true",
}).toString();

const callbackRes = await fetch(`${BASE}/api/auth/callback/email?nextRouter=1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie": cookies1,
  },
  body,
  redirect: "manual",
});
console.log("callback status:", callbackRes.status);
const text = await callbackRes.text();
console.log("callback body:", text.slice(0, 500));
console.log("set-cookie:", callbackRes.headers.get("set-cookie"));
