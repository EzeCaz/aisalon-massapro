import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PATCH /api/admin/registrants/[id]
 * Update a registrant's status (GOING / MAYBE / NOT_GOING) or name.
 *
 * Body: { status?: string, name?: string|null }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.eventRsvp.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
  }

  const body = await req.json();
  const { status, name } = body as {
    status?: string;
    name?: string | null;
  };

  const allowedStatuses = ["GOING", "MAYBE", "NOT_GOING"];
  if (status && !allowedStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowedStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const updated = await db.eventRsvp.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(name !== undefined ? { name: name?.trim() || null } : {}),
    },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ rsvp: updated });
}

/**
 * DELETE /api/admin/registrants/[id]
 * Permanently remove a registrant (e.g. removing a test entry, or
 * honoring a deletion request).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.eventRsvp.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
  }

  await db.eventRsvp.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
