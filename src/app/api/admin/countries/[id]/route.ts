import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * PATCH /api/admin/countries/[id]
 *
 * Updates a country. Super Admin only.
 *
 * Body (any subset):
 *   { name, code, slug, flagEmoji, defaultEmailDomain,
 *     defaultFromName, defaultReplyTo, isActive }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;

  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    return NextResponse.json(
      { error: "Only Super Admin can edit countries." },
      { status: 403 }
    );
  }

  const country = await db.country.findUnique({ where: { id } });
  if (!country) {
    return NextResponse.json({ error: "Country not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim() && body.name !== country.name) {
    data.name = body.name.trim();
  }
  if (typeof body.code === "string" && body.code.trim()) {
    const code = body.code.trim().toUpperCase();
    if (code.length !== 2) {
      return NextResponse.json(
        { error: "code must be a 2-letter ISO 3166-1 alpha-2 code" },
        { status: 400 }
      );
    }
    if (code !== country.code) data.code = code;
  }
  if (typeof body.slug === "string" && body.slug.trim()) {
    const sl = slugify(body.slug);
    if (sl !== country.slug) data.slug = sl;
  }
  if (typeof body.flagEmoji === "string") data.flagEmoji = body.flagEmoji.trim() || null;
  if (typeof body.defaultEmailDomain === "string") data.defaultEmailDomain = body.defaultEmailDomain.trim() || null;
  if (typeof body.defaultFromName === "string") data.defaultFromName = body.defaultFromName.trim() || null;
  if (typeof body.defaultReplyTo === "string") data.defaultReplyTo = body.defaultReplyTo.trim() || null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  // Uniqueness checks for any changed unique field
  if (typeof data.name === "string") {
    const ex = await db.country.findUnique({ where: { name: data.name } });
    if (ex && ex.id !== id) {
      return NextResponse.json({ error: `Country name "${data.name}" already exists` }, { status: 409 });
    }
  }
  if (typeof data.code === "string") {
    const ex = await db.country.findUnique({ where: { code: data.code } });
    if (ex && ex.id !== id) {
      return NextResponse.json({ error: `Country code "${data.code}" already in use` }, { status: 409 });
    }
  }
  if (typeof data.slug === "string") {
    const ex = await db.country.findUnique({ where: { slug: data.slug } });
    if (ex && ex.id !== id) {
      return NextResponse.json({ error: `Country slug "${data.slug}" already in use` }, { status: 409 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ country, unchanged: true });
  }

  const updated = await db.country.update({ where: { id }, data });
  return NextResponse.json({ country: updated });
}

/**
 * DELETE /api/admin/countries/[id]
 *
 * Deletes a country. Super Admin only.
 *
 * Refuses to delete if the country still has chapters or users attached
 * (callers must reassign them first).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if ("error" in me && me.error) return me.error;
  const user = me.user!;

  if (!isSuperAdmin({ email: user.email, role: user.role })) {
    return NextResponse.json(
      { error: "Only Super Admin can delete countries." },
      { status: 403 }
    );
  }

  const country = await db.country.findUnique({
    where: { id },
    select: { _count: { select: { chapters: true, users: true } } },
  });
  if (!country) {
    return NextResponse.json({ error: "Country not found" }, { status: 404 });
  }

  if (country._count.chapters > 0 || country._count.users > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: country still has ${country._count.chapters} chapter(s) and ${country._count.users} user(s) attached. Re-assign them first.`,
      },
      { status: 409 }
    );
  }

  await db.country.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
