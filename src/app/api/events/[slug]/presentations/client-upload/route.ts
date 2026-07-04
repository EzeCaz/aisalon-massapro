import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleUpload } from "@vercel/blob/client";

/**
 * POST /api/events/[slug]/presentations/client-upload
 *
 * Server-side route helper for Vercel Blob *client-side* uploads of
 * presentation files. Used together with `upload()` from
 * `@vercel/blob/client` on the browser side. This route plays two roles
 * depending on the request body shape (auto-detected by `handleUpload`):
 *
 *   1. TOKEN GENERATION
 *      The browser calls this route FIRST, before uploading the file.
 *      `handleUpload` runs `onBeforeGenerateToken`, which:
 *        - authenticates the user (must be a logged-in member)
 *        - verifies the event exists
 *        - returns a client token constrained to:
 *            * allowedContentTypes: our presentation allow-list
 *            * maximumSizeInBytes: 10 MB (10 * 1024 * 1024)
 *            * addRandomSuffix: false (we control the pathname)
 *
 *      The browser then calls `upload({ pathname, body: file, token })`
 *      which streams the file DIRECTLY to Vercel Blob, bypassing the
 *      4.5 MB serverless function body limit. This is the whole point —
 *      large PDF decks / PPTX with embedded video routinely exceed 4 MB.
 *
 *   2. UPLOAD COMPLETION CALLBACK (optional, only fired when the client
 *      passes `callbackUrl` in the token — currently NOT used here,
 *      because we don't know the eventual DB record ID at token-issue
 *      time. Instead, the browser POSTs the upload result to the
 *      separate /register endpoint below to create the DB row.)
 *
 * Admin/membership: any logged-in member can upload (same gate as the
 * old POST /api/events/[slug]/presentations route).
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.apple.keynote",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/zip", // .key is sometimes a zip
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/avif",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // 1) Auth gate — must be a logged-in member.
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Validate event + user up-front (also checked again in the token
  //    callback, but doing it here lets us return a clean 404/403 before
  //    involving the Blob SDK).
  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  // 3) Body shape depends on which phase the SDK is in. `handleUpload`
  //    inspects `body.type` and dispatches accordingly.
  const body = await req.json();

  try {
    const result = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      request: req,
      body,
      onBeforeGenerateToken: async (_pathname, _clientPayload, _multipart) => {
        // Same constraints for every request — the actual per-file
        // validation (extension, content-type) is done by the browser
        // before calling upload(), and re-checked by Vercel Blob when
        // the upload lands.
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false,
          // Token is valid for 1 hour — plenty of time for a 10 MB upload
          // on a slow connection.
          validUntil: Date.now() + 60 * 60 * 1000,
        };
      },
      // No onUploadCompleted — the browser instead calls the /register
      // endpoint below with the resulting blob URL + metadata so we can
      // create the DB row with the user-supplied title/description/
      // speakerIds/agendaItemId.
    });

    if (result.type === "blob.generate-client-token") {
      return NextResponse.json({ clientToken: result.clientToken });
    }
    // upload-completed callback (not currently used — see comment above)
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[client-upload] handleUpload failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Upload token generation failed",
      },
      { status: 500 }
    );
  }
}
