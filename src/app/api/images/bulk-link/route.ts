import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/images/bulk-link
 * Body: { imageIds: string[], speakerIds: string[] }
 * Links every image in imageIds to every speaker in speakerIds.
 * (Replaces existing links per image — set semantics.)
 *
 * Used for the "bulk link" UI on the photo gallery.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { imageIds, speakerIds } = (await req.json()) as {
    imageIds: string[];
    speakerIds: string[];
  };

  if (!Array.isArray(imageIds) || !Array.isArray(speakerIds)) {
    return NextResponse.json({ error: "imageIds and speakerIds required" }, { status: 400 });
  }
  if (imageIds.length === 0) {
    return NextResponse.json({ error: "No images selected" }, { status: 400 });
  }

  // Verify all images exist + the user has permission (uploader or admin)
  const images = await db.eventImage.findMany({
    where: { id: { in: imageIds } },
    select: { id: true, uploaderId: true },
  });
  if (images.length !== imageIds.length) {
    return NextResponse.json({ error: "Some images not found" }, { status: 404 });
  }
  const isAdmin = user.role === "ADMIN";
  for (const img of images) {
    if (!isAdmin && img.uploaderId !== user.id) {
      return NextResponse.json(
        { error: `Forbidden for image ${img.id}` },
        { status: 403 }
      );
    }
  }

  // Verify speakers exist
  if (speakerIds.length > 0) {
    const speakers = await db.speaker.findMany({
      where: { id: { in: speakerIds } },
      select: { id: true },
    });
    if (speakers.length !== speakerIds.length) {
      return NextResponse.json({ error: "Some speakers not found" }, { status: 404 });
    }
  }

  // Apply the link to each image (set semantics: replace)
  await db.$transaction(
    imageIds.map((id) =>
      db.eventImage.update({
        where: { id },
        data: {
          speakers: { set: speakerIds.map((sid) => ({ id: sid })) },
        },
      })
    )
  );

  return NextResponse.json({ ok: true, linked: imageIds.length });
}
