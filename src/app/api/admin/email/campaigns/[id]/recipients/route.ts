import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/email/campaigns/[id]/recipients
 *
 * Returns the per-recipient breakdown for a campaign. Supports
 * pagination via ?page=1&pageSize=50 and search via ?search=.
 * Used by the admin dashboard's recipient table.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(url.searchParams.get("pageSize") ?? "50", 10)));
  const search = url.searchParams.get("search")?.trim() || "";

  const where: any = { campaignId: id };
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  const [recipients, total] = await Promise.all([
    db.emailRecipient.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.emailRecipient.count({ where }),
  ]);

  return NextResponse.json({
    recipients,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
