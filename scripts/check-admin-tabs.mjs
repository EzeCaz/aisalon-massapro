// Use the actual next-auth client-side signIn flow that the login form uses.
// This is a server-side fetch equivalent of:
//   const res = await signIn("email", { email, password, redirect: false });
const BASE = "https://aisalon-massapro-git-v515-prep-tab-ezecazs-projects.vercel.app";

function pickCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  // Node's fetch joins multiple Set-Cookie headers with ", " — which is
  // ambiguous because Expires dates ALSO contain ", ". Use the smarter
  // heuristic: a new cookie starts at a `<name>=` pattern that's preceded
  // by ", " AND where the name is one of the known next-auth cookies.
  // Simpler approach: use getSetCookie() if available (Node 18+).
  // Even simpler: just match the session-token value directly with a regex.
  const sessionMatch = setCookieHeader.match(/(__Secure-next-auth\.session-token=[^;]+)/);
  const callbackMatch = setCookieHeader.match(/(__Secure-next-auth\.callback-url=[^;]+)/);
  const csrfMatch = setCookieHeader.match(/(__Host-next-auth\.csrf-token=[^;]+)/);
  return [csrfMatch?.[1], sessionMatch?.[1], callbackMatch?.[1]].filter(Boolean).join("; ");
}

function mergeCookies(...cookies) {
  const map = new Map();
  for (const c of cookies) {
    if (!c) continue;
    for (const pair of c.split("; ")) {
      const [k, ...rest] = pair.split("=");
      if (k) map.set(k, rest.join("="));
    }
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

// 1. Get CSRF token + cookies
const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
const cookies1 = pickCookies(csrfRes.headers.get("set-cookie"));
const csrfJson = await csrfRes.json();
const csrfToken = csrfJson.csrfToken;
console.log("csrfToken:", csrfToken.slice(0, 12));

// 2. next-auth client calls /api/auth/callback/credentials?nextRouter=1
//    when redirect:false is set, expecting a JSON response.
const body = new URLSearchParams({
  email: "eze@massapro.com",
  password: "Massapro2026!",
  csrfToken,
  callbackUrl: "/admin",
  json: "true",
}).toString();

// NextAuth credentials provider has id="email", so callback URL is
// /api/auth/callback/email (NOT /credentials).
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
const setCookies2 = callbackRes.headers.get("set-cookie") || "";
const cookies2 = pickCookies(setCookies2);
console.log("cookies2:", cookies2.slice(0, 150));

const allCookies = mergeCookies(cookies1, cookies2);

// 3. Fetch /admin
const adminRes = await fetch(`${BASE}/admin`, {
  headers: { "Cookie": allCookies },
  redirect: "manual",
});
console.log("admin status:", adminRes.status);
console.log("admin location:", adminRes.headers.get("location"));

if (adminRes.status === 307) {
  console.log("STILL REDIRECTED TO LOGIN");
  process.exit(0);
}

const adminHtml = await adminRes.text();
console.log("admin html size:", adminHtml.length);

const tabs = ["Members", "Speakers", "Registrants", "Events", "New event", "Door Check-in", "Dashboard", "Event dashboard", "Email", "Images", "Knowledge Base", "Mockups"];
for (const tab of tabs) {
  const found = adminHtml.includes(tab);
  console.log(`  tab "${tab}": ${found ? "FOUND" : "MISSING"}`);
}
