import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  generateOnboardingToken,
} from "@/lib/brand-onboarding-types";
import type { BrandOnboardingFormData } from "@/lib/brand-onboarding-types";

/**
 * POST /api/apply
 *
 * Self-serve brand application. Auth-gated — the signed-in user becomes
 * the applicantUserId on the BrandOnboardingInvite row, so Super Admin
 * can reach them directly.
 *
 * Body: BrandOnboardingFormData (the same shape as the invite-based
 * flow). Required: brandName, brandSlug, leadName, leadEmail. The
 * email defaults to the signed-in user's email.
 *
 * Creates a BrandOnboardingInvite row with:
 *   - source: "SELF_SERVE"
 *   - status: "SUBMITTED"
 *   - applicantUserId: signed-in user's id
 *   - inviteeEmail: signed-in user's email (or body.leadEmail if provided)
 *   - invitedById: NULL (no Super Admin invited)
 *   - expiresAt: ~10 years out (effectively never)
 *
 * Returns: { ok: true, inviteId, token }
 *
 * One-application-per-user rule: if the user already has an
 * application (SELF_SERVE source, their user.id, OR their email), the
 * endpoint returns 409 with the existing invite's token so the client
 * can redirect to view it.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true },
  });
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: BrandOnboardingFormData;
  try {
    body = (await req.json()) as BrandOnboardingFormData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required-field validation (mirror the invite-based flow).
  if (!body.brandName || body.brandName.trim().length < 2) {
    return NextResponse.json({ error: "Brand name is required (min 2 characters)." }, { status: 400 });
  }
  if (!body.brandSlug || !/^[a-z0-9-]{2,40}$/.test(body.brandSlug.trim().toLowerCase())) {
    return NextResponse.json({ error: "Brand slug is required (2-40 lowercase letters/digits/hyphens)." }, { status: 400 });
  }
  // Lead info — default to signed-in user's name + email when not provided.
  const leadName = (body.leadName || me.name || "").trim();
  if (!leadName || leadName.length < 2) {
    return NextResponse.json({ error: "Your name is required." }, { status: 400 });
  }
  const leadEmail = (body.leadEmail || me.email).trim().toLowerCase();
  if (!leadEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
    return NextResponse.json({ error: "A valid lead email is required." }, { status: 400 });
  }

  // Color hex validation.
  for (const [k, v] of [
    ["primaryColor", body.primaryColor],
    ["secondaryColor", body.secondaryColor],
    ["accentColor", body.accentColor],
  ] as const) {
    if (v && !/^#[0-9A-Fa-f]{6}$/.test(v.trim())) {
      return NextResponse.json({ error: `${k} must be a 6-digit hex color (e.g. "#0A1F44") or empty.` }, { status: 400 });
    }
  }

  // One-application-per-user: check for an existing SELF_SERVE application
  // by this user (or by their email — covers the case where they applied
  // before signing in with this user.id).
  const existing = await db.brandOnboardingInvite.findFirst({
    where: {
      OR: [
        { applicantUserId: me.id, source: "SELF_SERVE" },
        { inviteeEmail: me.email, source: "SELF_SERVE" },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, status: true, appliedBrandId: true },
  });
  if (existing) {
    return NextResponse.json({
      error: "You've already submitted an application. Re-visit /apply/form to view it.",
      existingToken: existing.token,
      existingStatus: existing.status,
      existingAppliedBrandId: existing.appliedBrandId,
    }, { status: 409 });
  }

  // Build the submission payload (same shape as the invite flow).
  const submission: BrandOnboardingFormData = {
    ...body,
    leadName,
    leadEmail,
  };

  const token = generateOnboardingToken();
  // ~10 years out — effectively never expires. The admin can take their
  // time reviewing without the application auto-expiring.
  const expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

  const invite = await db.brandOnboardingInvite.create({
    data: {
      token,
      inviteeEmail: leadEmail,
      invitedById: null, // SELF_SERVE — no Super Admin invited
      applicantUserId: me.id,
      source: "SELF_SERVE",
      status: "SUBMITTED",
      submittedAt: new Date(),
      expiresAt,
      submissionJson: JSON.stringify(submission),
    },
    select: { id: true, token: true },
  });

  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    token: invite.token,
    status: "SUBMITTED",
  });
}
