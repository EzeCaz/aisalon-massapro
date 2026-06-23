import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { randomUUID } from "crypto";

/**
 * GET /api/admin/email/templates
 *   List all email templates (most recent first).
 *   Query params:
 *     - category  filter by category (optional)
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  const where = category && category !== "all" ? { category } : {};
  const templates = await db.emailTemplate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { campaigns: true } },
      creator: { select: { id: true, email: true, name: true } },
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

  // Generate a slug from the name (lowercase, hyphenated, suffix with random
  // to guarantee uniqueness even if two templates have the same name).
  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const slug = `${slugBase || "template"}-${randomUUID().slice(0, 8)}`;

  const template = await db.emailTemplate.create({
    data: {
      name,
      slug,
      category,
      subject,
      bodyHtml,
      bodyText: bodyText,
      signatureHtml: signatureHtml,
      createdBy: admin.id,
    },
    include: {
      creator: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
