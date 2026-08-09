import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "Brand-Field-Platform-Plan.pdf");
    const fileBuffer = await readFile(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": fileBuffer.byteLength.toString(),
        "Content-Disposition": 'attachment; filename="Brand-Field-Platform-Plan.pdf"',
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "File not found", details: String(err) },
      { status: 404 }
    );
  }
}
