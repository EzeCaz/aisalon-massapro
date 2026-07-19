import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPasswordEmail, emailConfigured } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateUtmUid, attributeSignup, UTM_COOKIE_NAME } from "@/lib/utm";

/**
 * POST /api/auth/signup
 * Body: { email, name? }
 *
 * - Validates email format + name.
 * - If user already exists AND has a passwordHash, resets the password
 *   and emails the new one (acts as a "forgot password" flow).
 * - If user exists but has no passwordHash (Google-only), generates a new
 *   password, hashes it, attaches to the user, and emails the plaintext.
 * - If user doesn't exist, creates them with role=MEMBER and a fresh
 *   password hash, then emails the plaintext.
 *
 * The plaintext password is NEVER stored — only the bcrypt hash.
 *
 * All errors are caught and returned as JSON so the client can show a
 * meaningful message instead of "Could not reach the server".
 */
export async function POST(req: NextRequest) {
  try {
    let body: { email?: unknown; name?: unknown; chapterSlug?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const name = (body.name as string | undefined)?.trim();
    const chapterSlug = (body.chapterSlug as string | undefined)?.trim().toLowerCase() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Please tell us your name." }, { status: 400 });
    }

    // V7: if chapterSlug is provided, resolve the chapter so we can tag
    // the new user with countryId + chapterId. This is what makes
    // /c/[chapterSlug] registration URLs work — anyone signing up via
    // that URL is automatically scoped to that chapter.
    let chapterScope: { countryId: string; chapterId: string; chapterName: string } | null = null;
    if (chapterSlug) {
      const chapter = await db.chapter.findUnique({
        where: { slug: chapterSlug },
        select: {
          id: true,
          name: true,
          countryId: true,
          isActive: true,
        },
      });
      if (!chapter) {
        return NextResponse.json(
          { error: `Chapter "${chapterSlug}" not found.` },
          { status: 404 }
        );
      }
      if (!chapter.isActive) {
        return NextResponse.json(
          { error: `Chapter "${chapter.name}" is not currently accepting new members.` },
          { status: 403 }
        );
      }
      chapterScope = {
        countryId: chapter.countryId,
        chapterId: chapter.id,
        chapterName: chapter.name,
      };
    }

    // Generate a memorable-ish but random 8-char password (alphanumeric)
    const password = crypto.randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
    const passwordHash = await bcrypt.hash(password, 10);

    // Detect missing SMTP config early — we can still create the user, but
    // we won't be able to email them the password. Surface this clearly.
    const smtpReady = emailConfigured();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aisalon.massapro.com");

    let userExisted = false;
    let userHasPassword = false;
    let displayName = name;

    try {
      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, countryId: true, chapterId: true, utmUid: true },
      });
      userExisted = !!existing;
      userHasPassword = !!existing?.passwordHash;

      // ----------------------------------------------------------------------
      // STEP 1: ALWAYS persist the new passwordHash for existing users.
      // This is the whole point of the signup/"forgot password" flow —
      // the user gets a new password via email, and that same password
      // MUST be the one whose hash is stored in the DB.
      //
      // BUG HISTORY (fixed 2026-07-19): previously this write was buried
      // inside the utmUid-allocation retry loop. When an existing user
      // already had a utmUid (which is 100% of returning users after
      // the V5.18 backfill), the loop would `break` BEFORE reaching
      // `db.user.update({ passwordHash })` — leaving the DB with the
      // OLD hash while the email went out with the NEW plaintext.
      // Symptom: signup email said password B, login only accepted
      // password A (or failed entirely for Google-only users whose
      // hash was null).
      // ----------------------------------------------------------------------
      if (existing) {
        // For existing users signing up via a chapter URL: if they don't
        // already have a chapter scope, backfill it now. We DON'T overwrite
        // an existing scope (admin may have manually assigned them).
        const updateData: { passwordHash: string; name: string; countryId?: string; chapterId?: string } = {
          passwordHash,
          name: displayName,
        };
        if (chapterScope && !existing.countryId && !existing.chapterId) {
          updateData.countryId = chapterScope.countryId;
          updateData.chapterId = chapterScope.chapterId;
        }
        await db.user.update({
          where: { id: existing.id },
          data: updateData,
        });
      } else {
        // Brand-new user — allocate utmUid with collision retry, then create.
        // V7: if chapterScope is set (user arrived via /c/[chapterSlug]),
        // tag them with that chapter's countryId + chapterId at creation.
        let utmUid: string | undefined;
        for (let i = 0; i < 5; i++) {
          utmUid = generateUtmUid();
          try {
            await db.user.create({
              data: {
                email,
                name,
                passwordHash,
                role: "MEMBER",
                utmUid,
                ...(chapterScope
                  ? {
                      countryId: chapterScope.countryId,
                      chapterId: chapterScope.chapterId,
                    }
                  : {}),
              },
            });
            break;
          } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            if (code === "P2002" && i < 4) {
              // utmUid collision — regenerate + retry.
              utmUid = undefined;
              continue;
            }
            throw err;
          }
        }
        if (!utmUid) {
          // All retries failed (essentially impossible). Fall back to creating
          // the user without a utmUid — backfill script will fill it in later.
          await db.user.create({
            data: {
              email,
              name,
              passwordHash,
              role: "MEMBER",
              ...(chapterScope
                ? {
                    countryId: chapterScope.countryId,
                    chapterId: chapterScope.chapterId,
                  }
                : {}),
            },
          });
        }
      }

      // ----------------------------------------------------------------------
      // STEP 2 (best-effort, non-blocking): backfill utmUid for existing
      // users that somehow don't have one yet. Rare since V5.18 backfill.
      // Failure here MUST NOT block signup — utmUid is non-critical.
      // ----------------------------------------------------------------------
      if (existing && !existing.utmUid) {
        for (let i = 0; i < 5; i++) {
          const candidate = generateUtmUid();
          try {
            await db.user.update({
              where: { id: existing.id },
              data: { utmUid: candidate },
            });
            break;
          } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            if (code === "P2002" && i < 4) continue;
            console.warn("[signup] utmUid backfill failed (non-blocking):", err);
            break;
          }
        }
      }

      // UTM attribution — if the visitor arrived via a member's share link,
      // attribute this signup to that referrer.
      const utmCookie = req.cookies.get(UTM_COOKIE_NAME)?.value;
      if (utmCookie && existing?.id !== undefined) {
        // Existing user — they may already have an attribution, skip.
      } else if (utmCookie) {
        // New user — find their id and attribute the signup to the referrer.
        const newUser = await db.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (newUser) {
          await attributeSignup({
            newUserId: newUser.id,
            utmUid: utmCookie,
          }).catch((err) => {
            // Attribution failure must never block signup
            console.warn("[signup] UTM attribution failed:", err);
          });
        }
      }
    } catch (dbErr) {
      console.error("[signup] DB error:", dbErr);
      // The most common cause in production is a misconfigured DATABASE_URL
      // (e.g. pointing at a read-only local SQLite file on Vercel's
      // serverless filesystem). Surface a clear, actionable message.
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      return NextResponse.json(
        {
          error:
            "The user database isn't reachable from the server. " +
            "This usually means DATABASE_URL on Vercel is still pointing at a local SQLite file — " +
            "switch it to a real Postgres database (Vercel → Storage → Create Postgres) and run `prisma db push`. " +
            "Internal: " + msg.slice(0, 200),
        },
        { status: 503 }
      );
    }

    // SMTP not configured — we can't email the password. Don't fail the
    // request, but be honest about it so the user / admin can fix SMTP.
    if (!smtpReady) {
      console.warn(
        `[signup] SMTP_* env vars are not set on the server — cannot email the password to ${email}. ` +
          `User record was ${userExisted ? "updated" : "created"} successfully, but the password is only visible in this server log:\n` +
          `----\nPassword for ${email}: ${password}\n----`
      );
      return NextResponse.json({
        ok: true,
        message:
          "Your account is ready, but the email server isn't configured yet on our side. " +
          "The site admin has been notified and will send you your password manually. " +
          "(If you are the admin, check the Vercel function logs — the password is printed there.)",
      });
    }

    const result = await sendPasswordEmail({
      to: email,
      name: displayName,
      password,
      siteUrl,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            "Account " + (userExisted ? "updated" : "created") +
            ", but we couldn't send the password email (" +
            (result.error || "unknown error") +
            "). Please contact the admin.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: userHasPassword
        ? "We sent a new password to your email. Check your inbox (and spam folder)."
        : "We sent your password to your email. Check your inbox (and spam folder).",
    });
  } catch (err) {
    console.error("[signup] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Unexpected server error: " + msg.slice(0, 200) },
      { status: 500 }
    );
  }
}
