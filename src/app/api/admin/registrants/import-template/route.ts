import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/admin/registrants/import-template
 *
 * Returns a CSV template with the columns supported by
 * /api/admin/registrants/bulk-import.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const header = ["email", "name", "status", "source"].join(",");
  const exampleRow = [
    "participant@example.com",
    "Participant Name",
    "GOING",
    "IMPORT",
  ].join(",");
  const exampleRow2 = [
    "maybe@example.com",
    "Maybe Person",
    "MAYBE",
    "IMPORT",
  ].join(",");

  const csv = `${header}\n${exampleRow}\n${exampleRow2}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="registrants-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
