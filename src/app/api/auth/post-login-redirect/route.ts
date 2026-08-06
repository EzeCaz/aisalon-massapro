import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/auth/post-login-redirect[?next=<relative-path>]
 *
 * Called by the browser immediately after a successful sign-in to decide
 * where to send the user. Returns an HTTP 302 redirect (not JSON) so it
 * works for top-level browser navigation — both the Google OAuth callback
 * (which uses `redirect: true` and lands here as a full page navigation)
 * and the email/password flow (which uses `router.push()` to navigate
 * here client-side).
 *
 * Routing logic (in priority order):
 *
 *   1. Not signed in            → /login
 *   2. User row not found       → /login
 *   3. importSource set         → /events         (pre-imported member;
 *                                                  auto-marks onboardedAt
 *                                                  if not set yet; ignores
 *                                                  `next` so the side
 *                                                  effect always runs)
 *   4. onboardedAt set          → `next` or /events  (returning member)
 *   5. otherwise (new user)     → /onboarding     (brand-new self-registered;
 *                                                  ignores `next` — onboarding
 *                                                  is mandatory before they
 *                                                  can browse the site)
 *
 * NOTE: A previous version of this route had a `mustSetPassword` gate
 * that redirected to /set-password. That field was NEVER added to the
 * Prisma schema — the reference was dead code that threw a Prisma
 * validation error at runtime, causing HTTP 500 on every login attempt.
 * The gate has been removed. Users who need to set a password can still
 * visit /set-password directly or use the profile page's "set password"
 * button — both paths are linked from the UI.
 *
 * Security: the `next` param MUST be a relative path (starts with `/` but
 * not `//`). Absolute URLs are rejected to prevent open-redirect abuse.
 *
 * The `next` param is only honored on the "happy path" (returning member
 * who has already onboarded, OR pre-imported member). Needs-onboarding
 * users are always routed to /onboarding — `next` is ignored in that
 * case because onboarding is mandatory.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      importSource: true,
      onboardedAt: true,
    },
  });

  if (!me) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Validate the `next` param once, up front. Only relative paths allowed
  // (starts with "/", not "//" — "//" is a protocol-relative URL that
  // could be interpreted as an absolute URL by the browser). Empty/invalid
  // `next` falls back to "/events".
  const rawNext = req.nextUrl.searchParams.get("next") || "";
  const safeNext =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/events";

  // 1. Pre-imported members (from the AI Salon TLV spreadsheet). They
  //    already have intake data, so they skip onboarding. Auto-mark
  //    onboardedAt if it's somehow not set yet (requirement #2: existing
  //    DB members are auto-marked as "filled"). We ignore `next` here so
  //    the auto-mark side effect always runs at least once per user.
  if (me.importSource) {
    if (!me.onboardedAt) {
      await db.user.update({
        where: { id: me.id },
        data: { onboardedAt: new Date() },
      });
    }
    return NextResponse.redirect(new URL(safeNext, req.url));
  }

  // 2. Returning member who has already completed onboarding. Honor the
  //    `next` param so deep links (e.g. /events/some-slug) work.
  if (me.onboardedAt) {
    return NextResponse.redirect(new URL(safeNext, req.url));
  }

  // 3. Brand-new self-registered user (Google OAuth or email sign-up) who
  //    has NOT yet filled out the intake form. Force them to /onboarding
  //    before they can browse — `next` is ignored because onboarding is
  //    mandatory. After they submit the form, the form's own redirect
  //    sends them to /events.
  return NextResponse.redirect(new URL("/onboarding", req.url));
}
