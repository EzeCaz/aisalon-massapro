import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/**
 * GET /api/testimonials
 * Query params (all optional):
 *   - eventId: filter to testimonials about a specific event
 *   - speakerId: filter to testimonials about a specific speaker
 *   - agendaItemId: filter to testimonials about a specific session
 *   - scope: "community" → only testimonials with NO eventId/speakerId/agendaItemId
 *   - authorId: filter to testimonials by a specific author
 *   - featured: "true" → only featured testimonials
 *   - limit: max results (default 50, max 200)
 *   - sort: "recent" (default, by createdAt desc) | "top" (by likeCount desc) | "oldest"
 *
 * Returns: testimonials with author info, like state for the caller, and
 * denormalized counts. Hidden testimonials are excluded for non-admins.
 *
 * PUBLIC: This endpoint is readable by anyone — no login required — so
 * the public /testimonials feed works for anonymous visitors. The
 * signed-in user (if any) is used only to compute `likedByMe` and to
 * decide whether to include hidden rows (admins see them, everyone else
 * doesn't).
 */
export async function GET(req: NextRequest) {
  try {
    // Wrap the session lookup in try/catch — if next-auth throws for any
    // reason (e.g. misconfigured cookies, JWT secret rotation), we still
    // want the public feed to render for anonymous visitors.
    let me: { id: string; role: string } | null = null;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const u = await db.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, role: true },
        });
        if (u) me = u;
      }
    } catch (err) {
      console.error("[testimonials GET] session lookup failed:", err);
      // Continue as anonymous — me stays null
    }
    const isAdmin = me?.role === "ADMIN";

  const url = req.nextUrl;
  const eventId = url.searchParams.get("eventId") || undefined;
  const speakerId = url.searchParams.get("speakerId") || undefined;
  const agendaItemId = url.searchParams.get("agendaItemId") || undefined;
  const scope = url.searchParams.get("scope"); // "community"
  const authorId = url.searchParams.get("authorId") || undefined;
  const featuredOnly = url.searchParams.get("featured") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
  const sort = url.searchParams.get("sort") || "recent";

  const where: Record<string, unknown> = {};
  if (!isAdmin) where.hidden = false;
  if (eventId) where.eventId = eventId;
  if (speakerId) where.speakerId = speakerId;
  if (agendaItemId) where.agendaItemId = agendaItemId;
  if (authorId) where.authorId = authorId;
  if (featuredOnly) where.featured = true;
  if (scope === "community") {
    where.AND = [
      { eventId: null },
      { speakerId: null },
      { agendaItemId: null },
    ];
  }

  const orderBy =
    sort === "top"
      ? [{ likeCount: "desc" as const }, { createdAt: "desc" as const }]
      : sort === "oldest"
      ? { createdAt: "asc" as const }
      : { createdAt: "desc" as const };

  // Base include — always present, regardless of whether the caller is
  // signed in. We add the per-user `likes` relation ONLY when we have a
  // signed-in user, by constructing the include object explicitly.
  const baseInclude = {
    author: {
      select: {
        id: true,
        name: true,
        email: true,
        photoUrl: true,
        image: true,
        company: true,
      },
    },
    // Include venue + cover image + mainImage.fileUrl so the share button
    // can build the message "AI Salon event about {title}, at {venue}" and
    // attach the event's profile picture as a file when sharing.
    event: {
      select: {
        id: true,
        title: true,
        slug: true,
        venue: true,
        coverImage: true,
        mainImage: { select: { fileUrl: true } },
      },
    },
    speaker: { select: { id: true, name: true, company: true, photoUrl: true } },
    agendaItem: { select: { id: true, title: true } },
  } as const;

  // For signed-in users, also fetch the per-user like row so we can
  // compute `likedByMe`. For anonymous visitors, skip it entirely.
  const include = me
    ? {
        ...baseInclude,
        likes: {
          where: { userId: me.id },
          select: { id: true },
          take: 1,
        },
      }
    : baseInclude;

  const testimonials = await db.testimonial.findMany({
    where,
    orderBy,
    take: limit,
    include,
  });

  const serialized = testimonials.map((t) => {
    const likesArr = (t as { likes?: { id: string }[] }).likes;
    return {
      id: t.id,
      body: t.body,
      rating: t.rating,
      imageUrl: t.imageUrl,
      eventDate: t.eventDate.toISOString(),
      featured: t.featured,
      hidden: t.hidden,
      likeCount: t.likeCount,
      shareCount: t.shareCount,
      createdAt: t.createdAt.toISOString(),
      author: t.author,
      event: t.event
        ? {
            id: t.event.id,
            title: t.event.title,
            slug: t.event.slug,
            venue: t.event.venue,
            coverImage: t.event.coverImage,
            mainImageUrl: t.event.mainImage?.fileUrl ?? null,
          }
        : null,
      speaker: t.speaker,
      agendaItem: t.agendaItem,
      likedByMe: likesArr ? likesArr.length > 0 : false,
    };
  });

    return NextResponse.json({ testimonials: serialized });
  } catch (err) {
    console.error("[testimonials GET] FATAL:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/testimonials
 * Multipart form data:
 *   - body: string (required, the quote)
 *   - rating: string "1".."5" (default "5")
 *   - eventDate: ISO date string (optional, defaults to now)
 *   - eventId: string (optional)
 *   - speakerId: string (optional)
 *   - agendaItemId: string (optional)
 *   - image: File (optional, will be stored in Vercel Blob)
 *
 * Creates a new testimonial authored by the signed-in user.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("[testimonials] req.formData() failed:", err);
    return NextResponse.json(
      { error: "Upload failed — body too large or malformed." },
      { status: 413 }
    );
  }

  const body = (formData.get("body") as string | null)?.trim() || "";
  const ratingRaw = formData.get("rating") as string | null;
  const rating = Math.max(1, Math.min(5, Number(ratingRaw || "5") || 5));
  const eventDateStr = formData.get("eventDate") as string | null;
  const eventId = (formData.get("eventId") as string | null) || null;
  const speakerId = (formData.get("speakerId") as string | null) || null;
  const agendaItemId = (formData.get("agendaItemId") as string | null) || null;
  const image = formData.getAll("image").find((f): f is File => f instanceof File);

  if (body.length < 3) {
    return NextResponse.json(
      { error: "Please write at least a few words." },
      { status: 400 }
    );
  }
  if (body.length > 2000) {
    return NextResponse.json(
      { error: "Testimonial is too long (max 2000 characters)." },
      { status: 400 }
    );
  }

  if (eventId) {
    const ev = await db.event.findUnique({ where: { id: eventId } });
    if (!ev)
      return NextResponse.json({ error: "Event not found." }, { status: 400 });
  }
  if (speakerId) {
    const sp = await db.speaker.findUnique({ where: { id: speakerId } });
    if (!sp)
      return NextResponse.json({ error: "Speaker not found." }, { status: 400 });
    if (eventId && sp.eventId !== eventId) {
      return NextResponse.json(
        { error: "Speaker does not belong to the selected event." },
        { status: 400 }
      );
    }
  }
  if (agendaItemId) {
    const ai = await db.eventAgendaItem.findUnique({ where: { id: agendaItemId } });
    if (!ai)
      return NextResponse.json(
        { error: "Agenda item not found." },
        { status: 400 }
      );
    if (eventId && ai.eventId !== eventId) {
      return NextResponse.json(
        { error: "Agenda item does not belong to the selected event." },
        { status: 400 }
      );
    }
  }

  let eventDate: Date | null = null;
  if (eventDateStr) {
    const d = new Date(eventDateStr);
    if (!isNaN(d.getTime())) eventDate = d;
  }
  if (!eventDate) eventDate = new Date();

  let imageUrl: string | null = null;
  if (image) {
    const allowedMime = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "image/avif",
    ];
    const allowedExt = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"];
    const ext = safeFileExtension(image.name, image.type, "");
    if (!allowedMime.includes(image.type) && !allowedExt.includes(ext)) {
      return NextResponse.json(
        { error: `Image type not allowed: ${image.type || ext}` },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await image.arrayBuffer());
    let processed: Buffer;
    try {
      processed = await sharp(buf)
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true })
        .toBuffer();
    } catch (err) {
      console.error("[testimonials] sharp processing failed:", err);
      return NextResponse.json(
        { error: "Could not process the image. Please try a different file." },
        { status: 400 }
      );
    }

    const filename = uniqueBlobFilename("jpg");
    const pathname = safeBlobPathname("testimonials", filename);
    try {
      const blob = await put(pathname, processed, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
      });
      imageUrl = blob.url;
    } catch (err) {
      console.error("[testimonials] blob upload failed:", err);
      return NextResponse.json(
        { error: "Image upload failed. Please try again." },
        { status: 500 }
      );
    }
  }

  const t = await db.testimonial.create({
    data: {
      authorId: me.id,
      body,
      rating,
      imageUrl,
      eventDate,
      eventId,
      speakerId,
      agendaItemId,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          photoUrl: true,
          image: true,
          company: true,
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          venue: true,
          coverImage: true,
          mainImage: { select: { fileUrl: true } },
        },
      },
      speaker: { select: { id: true, name: true, company: true, photoUrl: true } },
      agendaItem: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({
    testimonial: {
      id: t.id,
      body: t.body,
      rating: t.rating,
      imageUrl: t.imageUrl,
      eventDate: t.eventDate.toISOString(),
      featured: t.featured,
      hidden: t.hidden,
      likeCount: t.likeCount,
      shareCount: t.shareCount,
      createdAt: t.createdAt.toISOString(),
      author: t.author,
      event: t.event
        ? {
            id: t.event.id,
            title: t.event.title,
            slug: t.event.slug,
            venue: t.event.venue,
            coverImage: t.event.coverImage,
            mainImageUrl: t.event.mainImage?.fileUrl ?? null,
          }
        : null,
      speaker: t.speaker,
      agendaItem: t.agendaItem,
      likedByMe: false,
    },
  });
}
