/**
 * POST /api/email-templates/upload-image
 *
 * Upload an image to Vercel Blob under the `email-assets/` prefix and return
 * the public URL. Used by the WYSIWYG email editor's image-insert toolbar.
 *
 * Falls back to local filesystem (/public/uploads/email-assets/) when the
 * BLOB_READ_WRITE_TOKEN env var is not configured — mirroring the
 * brand-images route's behavior.
 *
 * Auth: admin session (SUPER_ADMIN or ADMIN).
 *
 * Returns: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { safeFileExtension, uniqueBlobFilename } from "@/lib/blob-paths";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const };
  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me || !["SUPER_ADMIN", "ADMIN"].includes(me.role)) return { ok: false as const };
  return { ok: true as const, userId: me.id };
}

function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

const LOCAL_DIR = path.join(process.cwd(), "public", "uploads", "email-assets");
const LOCAL_URL = "/uploads/email-assets";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const MAX_SIZE = 4 * 1024 * 1024; // 4 MB

export async function POST(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file field in form data" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported mime type: ${file.type}. allowed: jpg, png, gif, webp, svg.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `file too large: ${file.size} bytes (max ${MAX_SIZE})` },
      { status: 400 },
    );
  }

  const ext = safeFileExtension(file.name, file.type);
  const filename = `email-${uniqueBlobFilename(ext)}`;

  try {
    if (hasBlob()) {
      const blob = await put(`email-assets/${filename}`, file, {
        access: "public",
        contentType: file.type,
      });
      return NextResponse.json({ url: blob.url });
    }

    // Local fallback
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    const filepath = path.join(LOCAL_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filepath, buffer);
    return NextResponse.json({ url: `${LOCAL_URL}/${filename}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
