import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { randomUUID } from "crypto";

/**
 * POST /api/admin/email/campaigns/[id]/save-as-template
 *
 * Clones an existing campaign's snapshot (name, subject, bodyHtml) into a
 * new EmailTemplate row, so the admin can reuse the sent email's content
 * for future campaigns.
 *
 * Body (optional): { name?, category? }
 *   - name: defaults to "<campaignName> (template)"
 *   - category: defaults to "general"
 *
 * This endpoint is also used by the in-composer "Save as template" button
 * — the composer creates a draft campaign first, then calls this endpoint
 * with the draft's ID to save the current draft as a template.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const name = (body?.name || `${campaign.name} (template)`).toString().trim();
  const category = (body?.category || "general").toString().trim() || "general";

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Name is required (max 200 chars)" }, { status: 400 });
  }

  // Generate a slug from the name
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
      subject: campaign.subjectSnapshot,
      bodyHtml: campaign.bodyHtmlSnapshot,
      bodyText: campaign.bodyTextSnapshot,
      signatureHtml: campaign.signatureHtmlSnapshot,
      createdBy: admin.id,
    },
    include: {
      creator: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
