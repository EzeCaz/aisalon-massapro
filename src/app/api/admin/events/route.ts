import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/events
 * Body: full event payload (title, slug, startsAt, endsAt, etc.)
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    title,
    subtitle,
    chapter,
    venue,
    address,
    city,
    country,
    mapUrl,
    startsAt,
    endsAt,
    description,
    takeaways,
    intendedFor,
    rsvpUrl,
  } = body;

  if (!title || !startsAt || !endsAt) {
    return NextResponse.json({ error: "title, startsAt, endsAt required" }, { status: 400 });
  }

  // Auto-generate slug if not provided
  const slug =
    body.slug ||
    `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${new Date(startsAt).toISOString().slice(0, 10)}`;

  const event = await db.event.create({
    data: {
      slug,
      title,
      subtitle: subtitle || null,
      chapter: chapter || "Tel Aviv",
      venue: venue || null,
      address: address || null,
      city: city || null,
      country: country || null,
      mapUrl: mapUrl || null,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      description: description || null,
      takeaways: takeaways || null,
      intendedFor: intendedFor || null,
      rsvpUrl: rsvpUrl || null,
    },
  });

  return NextResponse.json({ event });
}
