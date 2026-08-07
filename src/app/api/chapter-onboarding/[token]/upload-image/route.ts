/**
 * POST /api/chapter-onboarding/[token]/upload-image
 *
 * Public (token-authenticated) image upload endpoint used by the
 * chapter-onboarding form. The chapter lead drops an image into one of
 * the brand-asset upload fields (favicon, login hero, login banner,
 * landing hero, email logo) and we store it so the provision step can
 * later copy/move it into the new chapter's `chapter-brand/<chapterId>/`
 * Blob prefix.
 *
 * STORAGE
 *   - Vercel Blob (production): `chapter-onboarding/<token>/<filename>`
 *   - Local sandbox fallback:   `/public/uploads/chapter-onboarding/<token>/<filename>`
 *
 * The path is keyed by the invite token (not the eventual chapter id)
 * because the chapter doesn't exist yet when the form is being filled.
 * On provision, the bytes are re-uploaded under the new chapter's
 * `chapter-brand/<chapterId>/` prefix and the chapter's ChapterSetting
 * rows point at the new URL — see `provision.ts`.
 *
 * AUTH
 *   No session required. The token in the URL authenticates the
 *   uploader — same model as the form's GET/POST. We reject uploads
 *   for REVOKED / EXPIRED / already-SUBMITTED invites (no edits after
 *   submit).
 *
 * BODY (multipart/form-data)
 *   - file: single image (JPG/PNG/WebP/GIF/AVIF, max 8 MB)
 *
 * RESPONSE
 *   200 { ok: true, url: string, name: string, size: number, mimeType: string }
 *   400 { error: string }  — bad file / too large / unsupported type
 *   404 { error: string }  — invite not found
 *   410 { error: string }  — expired / revoked / already submitted
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "@/lib/blob-paths";

/** True when Vercel Blob is configured (token present). */
function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  // ── Load invite ────────────────────────────────────────────────
  const invite = await db.chapterOnboardingInvite.findUnique({
    where: { token },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  // Reject if expired or revoked.
  if (invite.status === "REVOKED") {
    return NextResponse.json(
      { error: "This invite has been revoked." },
      { status: 410 },
    );
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired. Please ask the admin to send a new one." },
      { status: 410 },
    );
  }
  // Reject uploads AFTER submission — the form is locked once submitted.
  // (Admin can re-open the form by re-sending the invite, but that's a
  // different flow.)
  if (invite.status === "SUBMITTED") {
    return NextResponse.json(
      { error: "This form has already been submitted. Contact the admin to make changes." },
      { status: 410 },
    );
  }

  // ── Parse multipart form ───────────────────────────────────────
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // MIME + size validation
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Use JPG, PNG, WebP, GIF, or AVIF.`,
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }

  // Build a safe filename + path. The token in the path isolates each
  // invite's uploads from other invites (no chance of clobbering).
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = safeFileExtension(file.name, file.type, "bin");
  const filename = uniqueBlobFilename(ext);

  // ── Production path: Vercel Blob ───────────────────────────────
  if (hasBlob()) {
    const pathname = safeBlobPathname("chapter-onboarding", token, filename);
    try {
      const blob = await put(pathname, buf, {
        access: "public",
        contentType: file.type || "application/octet-stream",
        addRandomSuffix: false,
      });
      return NextResponse.json({
        ok: true,
        url: blob.url,
        name: filename,
        size: file.size,
        mimeType: file.type,
      });
    } catch (err) {
      console.error("[chapter-onboarding/upload] Vercel Blob put failed:", err);
      return NextResponse.json(
        {
          error: `Failed to upload image: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
        { status: 500 },
      );
    }
  }

  // ── Sandbox fallback: local filesystem ─────────────────────────
  // /public/uploads/chapter-onboarding/<token>/<filename>
  // Served statically from /uploads/chapter-onboarding/<token>/<filename>
  const LOCAL_DIR = path.join(
    process.cwd(),
    "public",
    "uploads",
    "chapter-onboarding",
    token,
  );
  const LOCAL_URL_PREFIX = `/uploads/chapter-onboarding/${token}`;

  try {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    const fullPath = path.join(LOCAL_DIR, filename);
    await fs.writeFile(fullPath, buf);
    const publicUrl = `${LOCAL_URL_PREFIX}/${encodeURIComponent(filename)}`;
    return NextResponse.json({
      ok: true,
      url: publicUrl,
      name: filename,
      size: file.size,
      mimeType: file.type,
    });
  } catch (err) {
    console.error("[chapter-onboarding/upload] local write failed:", err);
    return NextResponse.json(
      {
        error: `Failed to upload image locally: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 },
    );
  }
}

/** Map a file extension to a MIME type. */
function extToMime(ext: string): string {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

// Suppress unused warning for extToMime + ALLOWED_EXT (kept for future use).
void extToMime;
void ALLOWED_EXT;
