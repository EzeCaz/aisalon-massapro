import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth-guards";
import { getUserScope } from "@/lib/permissions";
import { randomUUID } from "crypto";

/**
 * GET /api/admin/email/templates
 *   List all email templates (most recent first).
 *   Query params:
 *     - category  filter by category (optional)
 *
 * TSK-0075: scoped by chapter. Global templates (chapterId=null) are
 * visible to all admins. A Montreal admin sees globals + Montreal-scoped
 * templates only.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TSK-0075: apply the emailModelWhere scoping pattern (matches
  // /admin/email/page.tsx so the API returns the same set the page shows).
  const { scope } = await getCurrentUser();
  const emailModelWhere =
    scope!.kind === "global"
      ? {}
      : scope!.kind === "country"
      ? { OR: [{ chapterId: null }, { chapter: { countryId: scope!.countryId } }] }
      : scope!.kind === "chapter"
      ? { OR: [{ chapterId: null }, { chapterId: scope!.chapterId }] }
      : { id: "___NEVER___" };

  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  const where =
    category && category !== "all"
      ? { ...emailModelWhere, category }
      : emailModelWhere;
  // TSK-0074: was db.emailTemplate (legacy, now EmailTemplateLegacy).
  // Now reads from the unified EmailTemplate2 table. The `creator` include
  // is no longer possible (EmailTemplate2.createdBy is a plain String?, no
  // User relation — matches the legacy EmailStageTemplate convention).
  const templates = await db.emailTemplate2.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { campaigns: true } },
    },
  });

  return NextResponse.json({ templates });
}

/**
 * POST /api/admin/email/templates
 *   Create a new email template.
 *   Body: { name, category?, subject, bodyHtml, bodyText?, signatureHtml? }
 *
 * Validation:
 *   - name (1-200 chars)
 *   - subject (1-500 chars)
 *   - bodyHtml (1-100000 chars)
 *   - category defaults to "general"
 *
 * TSK-0075: stamps the new template with the creator's chapterId when the
 * admin is chapter-scoped (so the template is visible only in their
 * chapter). Global admins create global templates (chapterId=null) which
 * are visible to everyone — this is the default template pattern.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body?.name || "").toString().trim();
  const subject = (body?.subject || "").toString().trim();
  const bodyHtml = (body?.bodyHtml || "").toString();
  const bodyText = body?.bodyText ? (body.bodyText).toString() : null;
  const signatureHtml = body?.signatureHtml ? (body.signatureHtml).toString() : null;
  const category = (body?.category || "general").toString().trim() || "general";

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Name is required (max 200 chars)" }, { status: 400 });
  }
  if (!subject || subject.length > 500) {
    return NextResponse.json({ error: "Subject is required (max 500 chars)" }, { status: 400 });
  }
  if (!bodyHtml || bodyHtml.length > 100000) {
    return NextResponse.json({ error: "Body HTML is required (max 100000 chars)" }, { status: 400 });
  }

  // TSK-0075: resolve the admin's scope so we can stamp the new template
  // with the appropriate chapterId. Global scope → null (global template,
  // visible to all). Country scope → null (country-level templates aren't
  // modeled separately; fall back to global). Chapter scope → scope.chapterId.
  const { scope } = await getCurrentUser();
  const templateChapterId =
    scope?.kind === "chapter" ? scope.chapterId : null;

  // Generate a slug from the name (lowercase, hyphenated, suffix with random
  // to guarantee uniqueness even if two templates have the same name).
  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const slug = `${slugBase || "template"}-${randomUUID().slice(0, 8)}`;

  // TSK-0074: was db.emailTemplate (legacy). Now writes to EmailTemplate2.
  const template = await db.emailTemplate2.create({
    data: {
      name,
      slug,
      category,
      subject,
      bodyHtml,
      bodyText: bodyText,
      signatureHtml: signatureHtml,
      createdBy: admin.id,
      chapterId: templateChapterId,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
