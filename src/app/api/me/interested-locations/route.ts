import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * /api/me/interested-locations
 *
 *   GET  — return the signed-in user's interested locations (with
 *          joined country rows for display).
 *
 *   PUT  — replace the user's interested locations. Body:
 *          { locations: [{ countryId?: string, city: string }, ...] }
 *          Up to 5 entries. Empty city is dropped. Wipes existing
 *          rows + creates new ones in a single transaction.
 *
 *   POST — alias for PUT (some clients prefer POST for updates).
 *
 * Auth: requires a signed-in user.
 */

type LocationInput = { countryId?: string | null; city?: string | null };

async function getUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
}

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.userInterestedLocation.findMany({
    where: { userId: me.id },
    include: { country: { select: { id: true, name: true, code: true, flagEmoji: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    locations: rows.map((r) => ({
      id: r.id,
      countryId: r.countryId,
      country: r.country,
      city: r.city,
      region: r.region,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { locations?: LocationInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.locations) ? body.locations : [];
  // Normalize: trim city, drop empty entries, cap at 5.
  const cleaned = raw
    .map((e) => ({
      city: (e.city || "").trim().slice(0, 120),
      countryId:
        typeof e.countryId === "string" && e.countryId.trim() ? e.countryId.trim() : null,
    }))
    .filter((e) => e.city)
    .slice(0, 5);

  // Validate countryId references exist (best-effort — invalid ones
  // are silently dropped to null).
  const final_ = await Promise.all(
    cleaned.map(async (c) => {
      if (!c.countryId) return c;
      const exists = await db.country.findUnique({
        where: { id: c.countryId },
        select: { id: true },
      });
      return exists ? c : { ...c, countryId: null };
    })
  );

  // Replace in two steps (delete + createMany) — wrapped in a tx so a
  // crash between the two never leaves the user with no rows.
  await db.$transaction(async (tx) => {
    await tx.userInterestedLocation.deleteMany({ where: { userId: me.id } });
    if (final_.length > 0) {
      await tx.userInterestedLocation.createMany({
        data: final_.map((c) => ({
          userId: me.id,
          city: c.city,
          countryId: c.countryId,
        })),
        skipDuplicates: true,
      });
    }
  });

  return NextResponse.json({ ok: true, count: final_.length });
}

export async function POST(req: NextRequest) {
  return PUT(req);
}
