import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { can, isSuperAdmin, ROLES } from "@/lib/permissions";
import { normalizeHttpUrl } from "@/lib/normalize-url";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;
  if (!can(user.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chapter = await db.chapter.findUnique({ where: { id } });
  if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  // Scope check
  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    if (user.role === ROLES.ADMIN && chapter.countryId !== user.countryId) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
    if (
      (user.role === ROLES.CHAPTER_ORGANIZER || user.role === ROLES.CO_HOST) &&
      chapter.id !== user.chapterId
    ) {
      return NextResponse.json({ error: "Out of scope" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.slug === "string" && body.slug.trim()) {
    data.slug = slugify(body.slug);
  }
  if (typeof body.city === "string") data.city = body.city.trim() || null;
  if (typeof body.timezone === "string" && body.timezone.trim()) data.timezone = body.timezone.trim();
  // Normalize social URLs at save time so the DB never stores schemeless
  // URLs (which the browser would treat as relative paths on render).
  if (typeof body.whatsappGroupUrl === "string") data.whatsappGroupUrl = normalizeHttpUrl(body.whatsappGroupUrl);
  if (typeof body.linkedinUrl === "string") data.linkedinUrl = normalizeHttpUrl(body.linkedinUrl);
  if (typeof body.heroImageUrl === "string") data.heroImageUrl = normalizeHttpUrl(body.heroImageUrl);
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  // Country change — only Super Admin
  if (typeof body.countryId === "string" && body.countryId.trim() && body.countryId !== chapter.countryId) {
    if (!isSuperAdmin({ email: user.email, role: user.role })) {
      return NextResponse.json({ error: "Only Super Admin can move a chapter to a different country." }, { status: 403 });
    }
    const newCountry = await db.country.findUnique({ where: { id: body.countryId } });
    if (!newCountry) return NextResponse.json({ error: "Country not found" }, { status: 404 });
    data.countryId = body.countryId;
  }

  // Check slug uniqueness if changing
  if (typeof data.slug === "string" && data.slug !== chapter.slug) {
    const existing = await db.chapter.findUnique({ where: { slug: data.slug } });
    if (existing) return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
  }

  const updated = await db.chapter.update({ where: { id }, data });
  return NextResponse.json({ chapter: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;

  // Only Super Admin can delete
  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    return NextResponse.json({ error: "Only Super Admin can delete a chapter." }, { status: 403 });
  }

  // Defensive: refuse to delete if it still has attached data
  const counts = await db.chapter.findUnique({
    where: { id },
    select: { _count: { select: { users: true, events: true, rsvps: true } } },
  });
  if (counts && (counts._count.users > 0 || counts._count.events > 0 || counts._count.rsvps > 0)) {
    return NextResponse.json(
      {
        error: `Cannot delete: chapter still has ${counts._count.users} users, ${counts._count.events} events, ${counts._count.rsvps} RSVPs attached. Re-assign them first.`,
      },
      { status: 409 }
    );
  }

  await db.chapter.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
