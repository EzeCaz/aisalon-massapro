import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/onboarding";

/**
 * POST /api/user/onboarding
 *
 * Filled out by a brand-new user the first time they hit /events (or
 * /profile) after registering. Saves all intake fields to the user's
 * profile row, then sets `onboardedAt = NOW()` so the redirect gate
 * stops sending them back to /onboarding.
 *
 * Body shape:
 *   {
 *     name: string,                    // Full Name *
 *     company: string,                 // Company name *
 *     email: string,                   // email *  (must match session email)
 *     mobile: string,                  // Mobile *
 *     linkedinUrl: string,             // Linkedin profile *
 *     interestedIn: string[],          // I am interested in... (checkboxes)
 *     interestedInOther?: string,      //   "Other: ___" free text
 *     profileCategories: string[],     // Tell us more about yourself (checkboxes)
 *     bio?: string,                    // Tell us more about yourself :) (long text)
 *   }
 *
 * Pre-imported users (importSource set) are NOT allowed to submit this
 * form — they already have spreadsheet data, and the form page itself
 * redirects them away. We double-check here in case of a stray request.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Don't let pre-imported users submit — they'd clobber spreadsheet data.
  if (!needsOnboarding(me)) {
    return NextResponse.json(
      { error: "You've already completed onboarding.", alreadyOnboarded: true },
      { status: 409 }
    );
  }

  let body: {
    name?: string;
    company?: string;
    email?: string;
    mobile?: string;
    linkedinUrl?: string;
    interestedIn?: string[];
    interestedInOther?: string;
    profileCategories?: string[];
    bio?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // --- Validate required fields -----------------------------------------
  const errors: string[] = [];

  const name = (body.name || "").trim();
  if (name.length < 2) errors.push("Please tell us your full name.");

  const company = (body.company || "").trim();
  if (company.length < 1) errors.push("Please tell us your company name.");

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("A valid email is required.");
  } else if (email !== me.email) {
    // The form is pre-filled with the session email — but if the user
    // somehow changes it, refuse: the email is the immutable identity.
    errors.push("Email cannot be changed — it must match the email you signed in with.");
  }

  const mobile = (body.mobile || "").trim();
  if (mobile.length < 4) {
    errors.push("Please give us a mobile number so we can reach you about events.");
  }

  const linkedinUrl = sanitizeUrl(body.linkedinUrl);
  if (!linkedinUrl) {
    errors.push("Please add a valid LinkedIn profile URL.");
  } else if (!/linkedin\.com/i.test(linkedinUrl)) {
    errors.push("The URL you entered doesn't look like a LinkedIn profile.");
  }

  const interestedIn = Array.isArray(body.interestedIn) ? body.interestedIn.filter(Boolean) : [];
  const interestedInOther = (body.interestedInOther || "").trim();
  if (interestedIn.length === 0 && interestedInOther.length === 0) {
    errors.push('Please pick at least one option under "I am interested in…".');
  }

  const profileCategories = Array.isArray(body.profileCategories)
    ? body.profileCategories.filter(Boolean)
    : [];
  if (profileCategories.length === 0) {
    errors.push('Please pick at least one option under "Tell us more about yourself".');
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: errors.join(" "), fieldErrors: errors },
      { status: 400 }
    );
  }

  // --- Serialize multi-value fields -------------------------------------
  // interestedIn: comma-joined. If "Other" text was provided, append as
  //   "Other: <text>" so it's clearly separated from the preset options.
  const interestedParts = [...interestedIn];
  if (interestedInOther) {
    interestedParts.push(`Other: ${interestedInOther.slice(0, 200)}`);
  }
  const interestedInStr = interestedParts.join(", ");

  // profileCategories: comma-joined.
  const profileCategoriesStr = profileCategories.join(", ");

  // bio: optional, capped at 2000 chars.
  const bio = (body.bio || "").trim().slice(0, 2000) || null;

  // --- Update the user row + mark onboarded -----------------------------
  const updated = await db.user.update({
    where: { id: me.id },
    data: {
      name,
      company: company.slice(0, 120),
      // email is intentionally NOT updated — it's the identity.
      mobile: mobile.slice(0, 60),
      linkedinUrl,
      interestedIn: interestedInStr,
      profileCategories: profileCategoriesStr,
      bio,
      onboardedAt: new Date(),
    },
    select: {
      id: true,
      name: true,
      email: true,
      onboardedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    user: updated,
  });
}

/**
 * GET /api/user/onboarding
 * Returns whether the signed-in user still needs to complete the form.
 * Used by the client to decide whether to redirect to /onboarding after
 * a fresh sign-in (the same check is done server-side in /events/page.tsx
 * and /profile/page.tsx — this endpoint is for any client-side flow).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      mobile: true,
      company: true,
      linkedinUrl: true,
      interestedIn: true,
      profileCategories: true,
      bio: true,
      importSource: true,
      onboardedAt: true,
    },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    needsOnboarding: needsOnboarding(me),
    user: me,
  });
}

/**
 * Sanitize a user-supplied URL:
 *  - reject javascript: / data: schemes
 *  - prepend https:// if missing scheme
 *  - cap length to 500 chars
 *  - return null if the result can't be parsed as a URL
 */
function sanitizeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  if (v.length > 500) v = v.slice(0, 500);
  if (/^(javascript|data|file|vbscript):/i.test(v)) return null;
  if (!/^https?:\/\//i.test(v)) {
    v = `https://${v}`;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(v);
    return v;
  } catch {
    return null;
  }
}
