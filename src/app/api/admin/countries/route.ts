import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin } from "@/lib/permissions";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * GET /api/admin/countries
 *
 * Lists all countries visible to the caller, each with chapter + user counts.
 *
 * Scope rules:
 *   - Super Admin: ALL countries
 *   - Admin: only their own country
 *   - Chapter Organizer / CO_HOST: only their own country
 *   - Member / Speaker: 403
 *
 * Response shape:
 *   {
 *     countries: [{
 *       id, name, code, slug, flagEmoji, defaultEmailDomain,
 *       defaultFromName, defaultReplyTo, isActive, createdAt,
 *       _count: { chapters, users }
 *     }]
 *   }
 */
export async function GET() {
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;
  if (!can(user.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isSuper = isSuperAdmin({ email: user.email, role: user.role });

  // Super Admin: all. Admin / Chapter Organizer: their own only.
  const where: Record<string, unknown> = isSuper
    ? {}
    : user.countryId
      ? { id: user.countryId }
      : { id: "___NEVER___" };

  const countries = await db.country.findMany({
    where,
    include: {
      _count: { select: { chapters: true, users: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ countries });
}

/**
 * POST /api/admin/countries
 *
 * Creates a new country. Super Admin only.
 *
 * Body:
 *   {
 *     name:           "Israel",                  // required
 *     code:           "IL",                      // required, ISO 3166-1 alpha-2
 *     slug:           "israel",                  // optional, derived from name
 *     flagEmoji:      "🇮🇱",                      // optional
 *     defaultEmailDomain: "aisalon.co.il",       // optional
 *     defaultFromName:    "AI Salon Israel",     // optional
 *     defaultReplyTo:     "hello@aisalon.co.il", // optional
 *     isActive:       true                       // optional, default true
 *   }
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;

  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    return NextResponse.json(
      { error: "Only Super Admin can create countries." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();
  const slug = String(body.slug ?? "").trim() || slugify(name);
  const flagEmoji = body.flagEmoji ? String(body.flagEmoji).trim() : null;
  const defaultEmailDomain = body.defaultEmailDomain
    ? String(body.defaultEmailDomain).trim()
    : null;
  const defaultFromName = body.defaultFromName
    ? String(body.defaultFromName).trim()
    : null;
  const defaultReplyTo = body.defaultReplyTo
    ? String(body.defaultReplyTo).trim()
    : null;
  const isActive = body.isActive !== false;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!code || code.length !== 2) {
    return NextResponse.json(
      { error: "code is required and must be a 2-letter ISO 3166-1 alpha-2 code (e.g. IL, US, GB)" },
      { status: 400 }
    );
  }
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  // Uniqueness checks
  const [byName, byCode, bySlug] = await Promise.all([
    db.country.findUnique({ where: { name } }),
    db.country.findUnique({ where: { code } }),
    db.country.findUnique({ where: { slug } }),
  ]);
  if (byName) return NextResponse.json({ error: `Country name "${name}" already exists` }, { status: 409 });
  if (byCode) return NextResponse.json({ error: `Country code "${code}" already in use` }, { status: 409 });
  if (bySlug) return NextResponse.json({ error: `Country slug "${slug}" already in use` }, { status: 409 });

  const country = await db.country.create({
    data: {
      name,
      code,
      slug,
      flagEmoji,
      defaultEmailDomain,
      defaultFromName,
      defaultReplyTo,
      isActive,
    },
  });

  return NextResponse.json({ country }, { status: 201 });
}
