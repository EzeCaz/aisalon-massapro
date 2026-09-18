import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { isSuperAdmin } from "@/lib/permissions";
import { ensureKnowledgeSeed, getKnowledgeDocs } from "@/lib/knowledge-docs";

/**
 * Knowledge-docs API (per-brand knowledge base).
 *
 *   GET  /api/admin/knowledge-docs?brand=<slug>   — list a brand's docs.
 *                                                  Any admin rank may read
 *                                                  (same gate as the page).
 *   POST /api/admin/knowledge-docs                — create a doc.
 *                                                  SUPER_ADMIN only.
 *
 * PER USER SPEC 2026-09-19: the knowledge base is separated per brand and
 * the Super Admin can change the content and URL of each doc.
 */

const VALID_KINDS = new Set(["folder", "doc", "slides"]);

export async function GET(req: NextRequest) {
  const me = await requirePermission("members.view");
  if (me instanceof NextResponse) return me;

  const brand = (req.nextUrl.searchParams.get("brand") ?? "aisalon").toLowerCase();
  if (brand !== "coma" && brand !== "aisalon") {
    return NextResponse.json({ error: "Unknown brand" }, { status: 400 });
  }

  await ensureKnowledgeSeed();
  const docs = await getKnowledgeDocs(brand);
  return NextResponse.json({ docs });
}

export async function POST(req: NextRequest) {
  const me = await requirePermission("members.view");
  if (me instanceof NextResponse) return me;
  // Writes are SUPER_ADMIN-only — brand content is global per brand.
  if (!isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json(
      { error: "Only Super Admins can edit the knowledge base." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max = 500): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s ? s.slice(0, max) : undefined;
  };

  const brandSlug = str(body.brandSlug)?.toLowerCase();
  const section = str(body.section, 200);
  const title = str(body.title, 300);
  const url = str(body.url, 2000);

  if (!brandSlug || !["coma", "aisalon"].includes(brandSlug)) {
    return NextResponse.json({ error: "brandSlug must be 'coma' or 'aisalon'." }, { status: 400 });
  }
  if (!section || !title || !url) {
    return NextResponse.json({ error: "section, title and url are required." }, { status: 400 });
  }
  const kind = str(body.kind, 20)?.toLowerCase() ?? "doc";
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "kind must be folder, doc, or slides." }, { status: 400 });
  }

  const doc = await db.knowledgeDoc.create({
    data: {
      brandSlug,
      section,
      sectionIntro: str(body.sectionIntro, 2000) ?? null,
      sectionOrder: typeof body.sectionOrder === "number" ? Math.max(0, Math.min(999, Math.floor(body.sectionOrder))) : 99,
      title,
      description: str(body.description, 4000) ?? null,
      url,
      kind,
      sortOrder: typeof body.sortOrder === "number" ? Math.max(0, Math.min(999, Math.floor(body.sortOrder))) : 0,
      isActive: body.isActive === false ? false : true,
      updatedBy: me.email,
    },
  });

  return NextResponse.json({ doc });
}
