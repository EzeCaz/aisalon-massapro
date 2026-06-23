import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PATCH /api/admin/events/[id]/main-image
 *
 * Sets (or clears) the event's "main image" — a pointer to one of
 * its EventImage rows. Used as the hero image on the event page and
 * the thumbnail on /events.
 *
 * Body: { imageId: string | null }
 *   - imageId === null clears the main image
 *   - imageId must belong to this event (otherwise 400)
 *
 * Admin-only (admins can pick the main image for any event).
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

  const { id: eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, mainImageId: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const { imageId } = body as { imageId?: string | null };

  if (imageId === null || imageId === undefined || imageId === "") {
    const updated = await db.event.update({
      where: { id: eventId },
      data: { mainImageId: null },
      select: { id: true, mainImageId: true },
    });
    return NextResponse.json({ event: updated });
  }

  // Verify the image belongs to this event
  const image = await db.eventImage.findUnique({
    where: { id: imageId },
    select: { id: true, eventId: true, fileUrl: true },
  });
  if (!image || image.eventId !== eventId) {
    return NextResponse.json(
      { error: "Image not found in this event" },
      { status: 400 }
    );
  }

  const updated = await db.event.update({
    where: { id: eventId },
    data: { mainImageId: imageId },
    select: { id: true, mainImageId: true, mainImage: { select: { id: true, fileUrl: true } } },
  });

  return NextResponse.json({ event: updated });
}
