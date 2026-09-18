import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  checkChapterMembership,
  joinChapter,
} from "@/lib/membership";

/**
 * Community membership API for a chapter (community).
 *
 *   GET  /api/chapters/[slug]/membership   — the current user's membership
 *                                            status for this chapter.
 *   POST /api/chapters/[slug]/membership   — join the community (submits
 *                                            the community form and creates
 *                                            an ACTIVE membership).
 *
 * PER USER SPEC 2026-09-19: any signed-in user may request to join any
 * community. Joins are auto-approved (status ACTIVE immediately) — the
 * user then becomes able to see all community members and join events.
 *
 * The PRIMARY chapter (User.chapterId) is an implicit membership — POST
 * still records an explicit row (with the form submission) so the
 * community gets the member's form data, and the response reports
 * alreadyMember: true for the primary chapter.
 */

type Params = { params: Promise<{ slug: string }> };

async function getChapter(slug: string) {
  // Phase 3A: slug is no longer globally unique (composite
  // [brandId, countryId, slug]) — findUnique({ where: { slug } }) is
  // REJECTED by Prisma at runtime. Use findFirst (same fix as /login).
  return db.chapter.findFirst({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      isActive: true,
      country: { select: { name: true, code: true, flagEmoji: true } },
      brand: { select: { slug: true, displayName: true } },
      _count: { select: { members: true, users: true, events: true } },
    },
  });
}

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, chapterId: true },
  });
  return user;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const chapter = await getChapter(slug);
  if (!chapter) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const check = await checkChapterMembership(user.id, chapter.id, user.chapterId);
  return NextResponse.json({
    membership: {
      isMember: check.isMember,
      isPrimary: check.isPrimary,
      status: check.isPrimary ? "ACTIVE" : check.rowStatus,
      hasRow: check.hasRow,
    },
    chapter: {
      id: chapter.id,
      name: chapter.name,
      slug: chapter.slug,
      city: chapter.city,
      isActive: chapter.isActive,
      brand: chapter.brand,
      country: chapter.country,
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  const chapter = await getChapter(slug);
  if (!chapter) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  if (!chapter.isActive) {
    return NextResponse.json(
      { error: "This community is not accepting new members right now." },
      { status: 403 }
    );
  }

  // Community join form — optional fields, stored as JSON on the row.
  // Required by spec: the user must FILL THE COMMUNITY FORM when joining.
  // We require at least one intended-answer field (whyJoin) so the form
  // isn't a no-op, and free-text is length-capped.
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const asString = (v: unknown, max: number): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s ? s.slice(0, max) : undefined;
  };
  const title = asString(body.title, 120);
  const company = asString(body.company, 120);
  const linkedinUrl = asString(body.linkedinUrl, 300);
  const whyJoin = asString(body.whyJoin, 1000);

  if (!whyJoin) {
    return NextResponse.json(
      { error: "Please tell the community why you'd like to join." },
      { status: 400 }
    );
  }

  const result = await joinChapter({
    chapterId: chapter.id,
    userId: user.id,
    source: "DIRECTORY",
    formJson: {
      title,
      company,
      linkedinUrl,
      whyJoin,
      name: user.name,
      submittedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    membership: {
      isMember: true,
      isPrimary: user.chapterId === chapter.id,
      status: result.status,
    },
    chapter: {
      id: chapter.id,
      name: chapter.name,
      slug: chapter.slug,
      city: chapter.city,
      brand: chapter.brand,
      country: chapter.country,
    },
    alreadyMember: !result.created,
  });
}
