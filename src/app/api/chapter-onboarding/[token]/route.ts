/**
 * GET  /api/chapter-onboarding/[token]
 *   Returns invite metadata + (if submitted) the prior submission.
 *   Public — no auth. The token authenticates the requester.
 *
 * POST /api/chapter-onboarding/[token]
 *   Submits the form. Body: ChapterOnboardingFormData (JSON).
 *   Sets status=SUBMITTED, submittedAt=now, submissionJson=JSON.stringify(body).
 *   Returns { ok: true }.
 *   Public — no auth. Idempotent-ish: re-submission overwrites prior data.
 *
 * Both routes also set openedAt on first GET (if status===PENDING and
 * openedAt is null).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ChapterOnboardingFormData } from "@/lib/chapter-onboarding-types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const invite = await db.chapterOnboardingInvite.findUnique({
    where: { token },
    select: {
      token: true,
      status: true,
      inviteeEmail: true,
      prefillChapterName: true,
      prefillChapterSlug: true,
      expiresAt: true,
      submittedAt: true,
      openedAt: true,
      submissionJson: true,
      userId: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  // Look up the invitee's name from the user record (best-effort).
  let inviteeName: string | null = null;
  try {
    const user = await db.user.findUnique({
      where: { id: invite.userId },
      select: { name: true },
    });
    inviteeName = user?.name ?? null;
  } catch {
    // ignore — name is optional
  }

  // Mark opened on first GET (if PENDING and not yet opened).
  if (invite.status === "PENDING" && !invite.openedAt) {
    try {
      await db.chapterOnboardingInvite.update({
        where: { token },
        data: { openedAt: new Date() },
      });
    } catch {
      // non-critical — continue
    }
  }

  // Compute effective status (auto-expire if past expiresAt).
  let effectiveStatus = invite.status;
  if (invite.status === "PENDING" && new Date(invite.expiresAt) < new Date()) {
    effectiveStatus = "EXPIRED";
  }

  const submission: ChapterOnboardingFormData | undefined =
    invite.submissionJson ? JSON.parse(invite.submissionJson) : undefined;

  return NextResponse.json({
    token: invite.token,
    status: effectiveStatus,
    inviteeEmail: invite.inviteeEmail,
    inviteeName,
    prefillChapterName: invite.prefillChapterName,
    prefillChapterSlug: invite.prefillChapterSlug,
    expiresAt: invite.expiresAt,
    submittedAt: invite.submittedAt,
    openedAt: invite.openedAt,
    submission,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const invite = await db.chapterOnboardingInvite.findUnique({
    where: { token },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  // Reject if expired or revoked.
  if (invite.status === "REVOKED") {
    return NextResponse.json({ error: "This invite has been revoked." }, { status: 410 });
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired. Please ask the admin to send a new one." },
      { status: 410 },
    );
  }

  // Parse + validate the submission body.
  let body: ChapterOnboardingFormData;
  try {
    body = (await req.json()) as ChapterOnboardingFormData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Minimal validation — required fields must be present and non-empty.
  const required: (keyof ChapterOnboardingFormData)[] = [
    "chapterName",
    "chapterSlug",
    "country",
    "timezone",
    "whatsappGroupUrl",
    "linkedinUrl",
    "primaryLanguage",
    "leadName",
    "leadEmail",
  ];
  const missing = required.filter((k) => !body[k] || !String(body[k]).trim());
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // Persist the submission.
  await db.chapterOnboardingInvite.update({
    where: { token },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submissionJson: JSON.stringify(body),
    },
  });

  return NextResponse.json({ ok: true });
}
