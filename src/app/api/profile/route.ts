import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/profile
 * Returns the signed-in user's profile (incl. tags).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: { tags: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      photoUrl: user.photoUrl,
      bio: user.bio,
      company: user.company,
      companyUrl: user.companyUrl,
      linkedinUrl: user.linkedinUrl,
      portfolioUrl: user.portfolioUrl,
      role: user.role,
      tags: user.tags,
    },
  });
}

/**
 * PATCH /api/profile
 * Body: {
 *   name?, bio?, linkedinUrl?, company?, companyUrl?, portfolioUrl?
 * }
 * Email is not editable (it's the identity).
 * Photo is uploaded separately via POST /api/profile/photo.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = (await req.json()) as {
    name?: string | null;
    bio?: string | null;
    linkedinUrl?: string | null;
    company?: string | null;
    companyUrl?: string | null;
    portfolioUrl?: string | null;
  };

  // Build the update payload — only allow profile-related fields (not role/email/id).
  const data: Record<string, string | null> = {};

  if (body.name !== undefined) {
    const trimmed = (body.name || "").trim();
    data.name = trimmed.length > 0 ? trimmed.slice(0, 100) : null;
  }
  if (body.bio !== undefined) {
    const trimmed = (body.bio || "").trim();
    data.bio = trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
  }
  if (body.company !== undefined) {
    const trimmed = (body.company || "").trim();
    data.company = trimmed.length > 0 ? trimmed.slice(0, 120) : null;
  }
  if (body.companyUrl !== undefined) {
    const trimmed = (body.companyUrl || "").trim();
    data.companyUrl = trimmed.length > 0 ? sanitizeUrl(trimmed) : null;
  }
  if (body.linkedinUrl !== undefined) {
    const trimmed = (body.linkedinUrl || "").trim();
    data.linkedinUrl = trimmed.length > 0 ? sanitizeUrl(trimmed) : null;
  }
  if (body.portfolioUrl !== undefined) {
    const trimmed = (body.portfolioUrl || "").trim();
    data.portfolioUrl = trimmed.length > 0 ? sanitizeUrl(trimmed) : null;
  }

  const updated = await db.user.update({
    where: { id: me.id },
    data,
    include: { tags: true },
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      image: updated.image,
      photoUrl: updated.photoUrl,
      bio: updated.bio,
      company: updated.company,
      companyUrl: updated.companyUrl,
      linkedinUrl: updated.linkedinUrl,
      portfolioUrl: updated.portfolioUrl,
      role: updated.role,
      tags: updated.tags,
    },
  });
}

/**
 * Sanitize a user-supplied URL:
 *  - reject javascript: / data: schemes
 *  - prepend https:// if missing scheme
 *  - cap length to 500 chars
 */
function sanitizeUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (v.length > 500) v = v.slice(0, 500);
  if (/^(javascript|data|file|vbscript):/i.test(v)) return null;
  if (!/^https?:\/\//i.test(v)) {
    // Default to https for bare domains (e.g. "massapro.com")
    v = `https://${v}`;
  }
  try {
    // Validate by constructing URL
    // eslint-disable-next-line no-new
    new URL(v);
    return v;
  } catch {
    return null;
  }
}
