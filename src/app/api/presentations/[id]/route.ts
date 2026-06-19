import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { del } from "@vercel/blob";

/**
 * PATCH /api/presentations/[id]
 * Body: { title?, description?, speakerIds?, agendaItemId? }
 * Updates a presentation file's metadata / links.
 * Uploader OR admin can edit.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { id } = await params;
  const file = await db.presentationFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Presentation not found" }, { status: 404 });

  const isAdmin = user.role === "ADMIN";
  const isOwner = file.uploaderId === user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    title,
    description,
    speakerIds,
    agendaItemId,
  } = body as {
    title?: string | null;
    description?: string | null;
    speakerIds?: string[];
    agendaItemId?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (typeof title === "string") data.title = title.trim() || null;
  if (typeof description === "string") data.description = description.trim() || null;
  if (agendaItemId !== undefined) {
    data.agendaItemId = agendaItemId || null;
  }
  if (Array.isArray(speakerIds)) {
    data.speakers = { set: speakerIds.map((sid) => ({ id: sid })) };
  }

  const updated = await db.presentationFile.update({
    where: { id },
    data,
    include: {
      uploader: { select: { id: true, name: true, email: true } },
      speakers: { select: { id: true, name: true, role: true, company: true } },
      agendaItem: {
        select: { id: true, title: true, startsAt: true, endsAt: true, type: true },
      },
    },
  });
  return NextResponse.json({ presentation: updated });
}

/**
 * DELETE /api/presentations/[id]
 * Removes the presentation (DB record + blob in Vercel Blob storage).
 * Uploader OR admin can delete.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { id } = await params;
  const file = await db.presentationFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Presentation not found" }, { status: 404 });

  const isAdmin = user.role === "ADMIN";
  const isOwner = file.uploaderId === user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete blob (best-effort) — only if it's a Vercel Blob URL (https://).
  if (file.fileUrl.startsWith("https://")) {
    try {
      await del(file.fileUrl);
    } catch (e) {
      console.warn("[delete-presentation] blob removal failed:", e);
    }
  }

  await db.presentationFile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
