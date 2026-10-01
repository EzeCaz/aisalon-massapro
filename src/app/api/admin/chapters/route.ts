import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, normalizeRole, ROLES } from "@/lib/permissions";
import { normalizeHttpUrl } from "@/lib/normalize-url";

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
  // Normalize social URLs to always include an https:// scheme. Without
  // this, an admin entering "linkedin.com/company/foo" (no scheme) would
  // save a value that the browser treats as a relative path on render.
  const whatsappGroupUrl = normalizeHttpUrl(body.whatsappGroupUrl);
  const linkedinUrl = normalizeHttpUrl(body.linkedinUrl);
  const heroImageUrl = normalizeHttpUrl(body.heroImageUrl);
  const isActive = body.isActive !== false;
  // Issue 3 (2026-09-30): public/private visibility. Default true.
  const isPubliclyListed = body.isPubliclyListed !== false;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  if (!countryId) return NextResponse.json({ error: "countryId is required" }, { status: 400 });

  // Scope check: Super Admin can pick any country. Admin can only create
  // chapters in their own country. BRAND_ADMIN (Round 2, 2026-09-30) can
  // create chapters in ANY country — their brand might span multiple
  // countries. The chapter is auto-tagged with their brandId via the
  // brandId field on the create payload below.
  const isBrandAdmin = normalizeRole(user.role) === ROLES.BRAND_ADMIN;
  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    if (!isBrandAdmin && (user.role !== ROLES.ADMIN || user.countryId !== countryId)) {
      return NextResponse.json({ error: "You can only create chapters in your own country." }, { status: 403 });
    }
  }

  // Validate country exists
  const country = await db.country.findUnique({ where: { id: countryId } });
  if (!country) return NextResponse.json({ error: "Country not found" }, { status: 404 });

  // Check slug uniqueness (findFirst: slug is not a unique selector since Phase 3A)
  const existing = await db.chapter.findFirst({ where: { slug } });
  if (existing) return NextResponse.json({ error: "Slug already in use" }, { status: 409 });

  // Round 2 (2026-09-30): BRAND_ADMIN's chapters are auto-tagged with
  // their brandId. Look up the brand row by the user's brandSlug.
  let brandId: string | undefined;
  if (isBrandAdmin) {
    if (!user.brandSlug) {
      return NextResponse.json({ error: "Your user account has no brandSlug — fix this in /admin/brands first." }, { status: 403 });
    }
    const brandRow = await db.brand.findUnique({
      where: { slug: user.brandSlug },
      select: { id: true },
    });
    if (!brandRow) {
      return NextResponse.json({ error: `Brand "${user.brandSlug}" not found in DB.` }, { status: 404 });
    }
    brandId = brandRow.id;
  }

  const chapter = await db.chapter.create({
    data: {
      name,
      slug,
      countryId,
      city,
      timezone,
      whatsappGroupUrl,
      linkedinUrl,
      heroImageUrl,
      isActive,
      isPubliclyListed,
      // Round 2: tag with the BRAND_ADMIN's brandId. Super Admin + country
      // ADMINs don't set this — the chapter will have brandId=null (legacy
      // pattern; they can manually assign a brand later via SQL or via
      // the chapter editor if we add a brand dropdown in round 3).
      ...(brandId ? { brandId } : {}),
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
