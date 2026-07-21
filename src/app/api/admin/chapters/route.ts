import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";
import { ensureAbsoluteUrl } from "@/lib/url-helpers";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;
  if (!can(user.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? "").trim() || slugify(name);
  const countryId = String(body.countryId ?? "").trim();
  const city = body.city ? String(body.city).trim() : null;
  const timezone = String(body.timezone ?? "Asia/Jerusalem").trim() || "Asia/Jerusalem";
  // Normalize: prepend https:// if the user entered a bare domain.
  // Prevents chapter landing page from rendering a relative-path link.
  const whatsappGroupUrl = ensureAbsoluteUrl(
    body.whatsappGroupUrl ? String(body.whatsappGroupUrl).trim() : ""
  );
  const linkedinUrl = ensureAbsoluteUrl(
    body.linkedinUrl ? String(body.linkedinUrl).trim() : ""
  );
  const isActive = body.isActive !== false;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  if (!countryId) return NextResponse.json({ error: "countryId is required" }, { status: 400 });

  // Scope check: Super Admin can pick any country. Admin can only create
  // chapters in their own country.
  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    if (user.role !== ROLES.ADMIN || user.countryId !== countryId) {
      return NextResponse.json({ error: "You can only create chapters in your own country." }, { status: 403 });
    }
  }

  // Validate country exists
  const country = await db.country.findUnique({ where: { id: countryId } });
  if (!country) return NextResponse.json({ error: "Country not found" }, { status: 404 });

  // Check slug uniqueness
  const existing = await db.chapter.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "Slug already in use" }, { status: 409 });

  const chapter = await db.chapter.create({
    data: {
      name,
      slug,
      countryId,
      city,
      timezone,
      whatsappGroupUrl,
      linkedinUrl,
      isActive,
    },
  });

  return NextResponse.json({ chapter }, { status: 201 });
}

export async function GET() {
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;
  if (!can(user.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Scope: Super Admin sees all; Admin sees their country's chapters;
  // Chapter Organizer sees their own chapter only.
  let where: Record<string, unknown> = {};
  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    if (user.role === ROLES.ADMIN && user.countryId) {
      where = { countryId: user.countryId };
    } else if ((user.role === ROLES.CHAPTER_ORGANIZER || user.role === ROLES.CO_HOST) && user.chapterId) {
      where = { id: user.chapterId };
    } else {
      where = { id: "___NEVER___" };
    }
  }

  const chapters = await db.chapter.findMany({
    where,
    include: {
      country: { select: { name: true, code: true, flagEmoji: true } },
      _count: { select: { users: true, events: true, rsvps: true } },
    },
    orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({ chapters });
}
