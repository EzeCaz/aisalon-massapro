/**
 * GET  /api/email-audiences — list all audiences.
 * POST /api/email-audiences — create a new audience.
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false };
  return { ok: true, userId: me.id };
}

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const audiences = await db.emailAudience.findMany({
    orderBy: [{ isTest: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { flowSteps: true } },
    },
  });

  // Parse emailsJson for the client.
  return NextResponse.json({
    audiences: audiences.map((a) => ({
      ...a,
      emails: safeParseEmails(a.emailsJson),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    description?: string;
    emails?: string[];
    isTest?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const emails = (body.emails ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e.includes("@"));

  if (emails.length === 0) {
    return NextResponse.json({ error: "at least one email required" }, { status: 400 });
  }

  // Generate a slug from the name.
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  try {
    const audience = await db.emailAudience.create({
      data: {
        name,
        slug,
        description: body.description || null,
        emailsJson: JSON.stringify(emails),
        isTest: body.isTest === true,
      },
    });
    return NextResponse.json({
      ok: true,
      audience: { ...audience, emails },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "An audience with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function safeParseEmails(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}
