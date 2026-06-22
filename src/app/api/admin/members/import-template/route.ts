import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/admin/members/import-template
 *
 * Returns a CSV template with the columns supported by
 * /api/admin/members/bulk-import. Admins can hand this to whoever
 * prepares the spreadsheet so the column names match exactly.
 *
 * The `Content-Disposition: attachment` header makes the browser
 * download the file as `members-import-template.csv`.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const header = [
    "name",
    "email",
    "company",
    "companyUrl",
    "linkedinUrl",
    "portfolioUrl",
    "bio",
    "mobile",
    "interestedIn",
    "profileCategories",
    "appliedFor",
    "invitedToSpeak",
  ].join(",");

  const exampleRow = [
    "Eze Cazares",
    "eze@massapro.com",
    "MassaPro",
    "https://massapro.com",
    "https://www.linkedin.com/in/ezecaz",
    "https://ezecaz.com",
    "Community builder, AI Salon TLV host.",
    "+972-50-123-4567",
    "Be a guest speaker; Want to pitch my startup",
    "I am an entrepreneur",
    "Fast pitch",
    "",
  ].join(",");

  const csv = `${header}\n${exampleRow}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="members-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
