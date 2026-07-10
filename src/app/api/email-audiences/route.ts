/**
 * GET    /api/email-audiences — list all audiences (with resolved email count).
 * POST   /api/email-audiences — create a new audience (STATIC or DYNAMIC).
 * POST   /api/email-audiences/preview — evaluate a filter spec and return
 *        the matching emails (does NOT persist anything). Used by the live
 *        preview in the audience builder UI.
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  parseSpec,
  resolveAudienceEmails,
  type AudienceFilterSpec,
} from "@/lib/email-orchestrator/audience-filter";

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

function safeParseEmails(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — list all audiences
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const audiences = await db.emailAudience.findMany({
    orderBy: [{ isTest: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { flowSteps: true } },
    },
  });

  // For STATIC audiences, parse emailsJson. For DYNAMIC audiences, also resolve
  // the live email count on read so the admin UI can show how many recipients
  // the filter currently matches (auto-updates as users/RSVPs change).
  const resolved = await Promise.all(
    audiences.map(async (a) => {
      if (a.kind === "STATIC") {
        const emails = safeParseEmails(a.emailsJson);
        return {
          id: a.id,
          name: a.name,
          slug: a.slug,
          description: a.description,
          kind: a.kind,
          isTest: a.isTest,
          emails,
          emailCount: emails.length,
          filters: null,
          flowStepsCount: a._count.flowSteps,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      }
      // DYNAMIC — resolve live count
      let emailCount = 0;
      let emailPreview: string[] = [];
      try {
        if (a.filtersJson) {
          const spec = parseSpec(a.filtersJson);
          const all = await resolveAudienceEmails(spec);
          emailCount = all.length;
          emailPreview = all.slice(0, 3); // first 3 for inline preview
        }
      } catch {
        // If resolution fails (e.g. invalid filter), fall back to 0 — UI will still render.
      }
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        description: a.description,
        kind: a.kind,
        isTest: a.isTest,
        emails: [] as string[],
        emailCount,
        emailPreview,
        filters: a.filtersJson ? parseSpec(a.filtersJson) : null,
        flowStepsCount: a._count.flowSteps,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      };
    }),
  );

  return NextResponse.json({ audiences: resolved });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — create a new audience
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    description?: string;
    kind?: "STATIC" | "DYNAMIC";
    emails?: string[];
    filters?: AudienceFilterSpec;
    isTest?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const kind = body.kind === "DYNAMIC" ? "DYNAMIC" : "STATIC";

  let emailsJson = "[]";
  let filtersJson: string | null = null;

  if (kind === "STATIC") {
    const emails = (body.emails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes("@"));
    if (emails.length === 0) {
      return NextResponse.json({ error: "at least one email required for STATIC audience" }, { status: 400 });
    }
    emailsJson = JSON.stringify(emails);
  } else {
    // DYNAMIC — must have a valid filter spec with at least one group
    if (!body.filters || !body.filters.groups || body.filters.groups.length === 0) {
      return NextResponse.json({ error: "at least one filter group required for DYNAMIC audience" }, { status: 400 });
    }
    filtersJson = JSON.stringify(body.filters);
  }

  try {
    const audience = await db.emailAudience.create({
      data: {
        name,
        slug: slugify(name),
        description: body.description || null,
        kind,
        emailsJson,
        filtersJson,
        isTest: body.isTest === true,
      },
    });
    return NextResponse.json({
      ok: true,
      audience: {
        ...audience,
        emails: kind === "STATIC" ? safeParseEmails(audience.emailsJson) : [],
        filters: kind === "DYNAMIC" ? parseSpec(audience.filtersJson) : null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "An audience with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
