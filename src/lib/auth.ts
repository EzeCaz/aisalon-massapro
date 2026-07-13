import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isSuperAdminEmail, ROLES, type Role } from "@/lib/permissions";
import { generateUtmUid } from "@/lib/utm";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "eze@massapro.com").toLowerCase();

/**
 * Resolve the role for a given email on FIRST sign-in (i.e. when the
 * user row doesn't exist yet).
 *
 *   - Super Admin emails (hard-coded list in permissions.ts) → "SUPER_ADMIN"
 *   - ADMIN_EMAIL env var → "ADMIN"
 *   - everyone else → "MEMBER"
 *
 * NOTE: After the first sign-in, the role is stored on the User row
 * and is NOT re-synced from this function on subsequent logins (except
 * for the Super Admin list — that ALWAYS overrides). This is so an
 * admin can promote/demote a user via the Edit Member dialog without
 * their change being clobbered on the user's next login.
 */
function resolveInitialRole(email: string): Role {
  if (isSuperAdminEmail(email)) return ROLES.SUPER_ADMIN;
  if (email.toLowerCase() === ADMIN_EMAIL) return ROLES.ADMIN;
  return ROLES.MEMBER;
}

/**
 * For an EXISTING user, decide what role they should have on this sign-in.
 *
 * Super Admin emails ALWAYS get SUPER_ADMIN (cannot be revoked via UI).
 * Everyone else keeps their existing DB role (whatever the admin set).
 */
function resolveRoleForExistingUser(email: string, currentRole: string): Role {
  if (isSuperAdminEmail(email)) return ROLES.SUPER_ADMIN;
  return currentRole as Role;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          scope: "openid email profile",
        },
      },
    }),
    // Email + password login. Available in BOTH dev and production so
    // members can sign up with email/name and receive their first-time
    // password via email (see /api/auth/signup).
    CredentialsProvider({
      id: "email",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = creds?.email?.trim().toLowerCase();
        const password = creds?.password ?? "";
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email.split("@")[0],
          image: user.photoUrl || user.image || null,
        };
      },
    }),
    // Login provider — email + name, no password. Available in dev so
    // you can sign in without going through Google OAuth or the email
    // password flow. The login form calls signIn("dev", ...), so the
    // provider id MUST be "dev" (was previously "login", which caused
    // silent failures — the form would submit, get an error from
    // NextAuth, and redirect back to /login).
    CredentialsProvider({
      id: "dev",
      name: "Login",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        name: { label: "Name", type: "text", placeholder: "Your Name" },
      },
      async authorize(creds) {
        if (!creds?.email) return null;
        return {
          id: creds.email,
          email: creds.email,
          name: creds.name || creds.email.split("@")[0],
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Persist the user in our DB on every successful sign-in
      if (!user?.email) return false;
      try {
        const lowerEmail = user.email.toLowerCase();

        // 1. Direct lookup by primary email
        let existing = await db.user.findUnique({ where: { email: lowerEmail } });

        // 2. Fallback: secondary email (UserEmail table). If found,
        //    treat the signed-in user as the linked User — same person,
        //    different inbox. This is what lets an admin attach multiple
        //    emails to one member.
        if (!existing) {
          const secondary = await db.userEmail.findUnique({
            where: { email: lowerEmail },
            include: { user: true },
          });
          if (secondary) {
            existing = secondary.user;
          }
        }

        if (!existing) {
          // Brand-new user → use the initial role resolver
          const role = resolveInitialRole(user.email);
          // Generate a unique utmUid (12-char hex) for referral tracking.
          // Retry on collision (P2002) — astronomically unlikely with 16^12
          // possibilities, but defensive.
          let utmUid: string | undefined;
          for (let i = 0; i < 5; i++) {
            try {
              utmUid = generateUtmUid();
              await db.user.create({
                data: {
                  email: lowerEmail,
                  name: user.name || null,
                  image: user.image || null,
                  role,
                  utmUid,
                  lastLoginAt: new Date(),
                  lastActiveAt: new Date(),
                },
              });
              break;
            } catch (err: unknown) {
              const code = (err as { code?: string })?.code;
              if (code === "P2002" && i < 4) {
                // Unique constraint on utmUid — regenerate + retry
                utmUid = undefined;
                continue;
              }
              throw err;
            }
          }
          if (!utmUid) {
            // All 5 attempts collided (essentially impossible). Fall back to
            // creating the user WITHOUT a utmUid — the backfill script can
            // fill it in later. This way the signup never fails just because
            // UTM_UID generation had bad luck.
            await db.user.create({
              data: {
                email: lowerEmail,
                name: user.name || null,
                image: user.image || null,
                role,
                lastLoginAt: new Date(),
                lastActiveAt: new Date(),
              },
            });
          }
        } else {
          // Existing user — only sync the role if they're a Super Admin
          // (so the SUPER_ADMIN status always matches the hard-coded
          // email list). Otherwise, keep whatever role the admin set.
          const syncedRole = resolveRoleForExistingUser(user.email, existing.role);
          const patch: Record<string, unknown> = {
            // Always update lastLoginAt on every successful sign-in so the
            // admin activity-report page can show "last logged in at X".
            lastLoginAt: new Date(),
            lastActiveAt: new Date(),
          };
          if (existing.role !== syncedRole) patch.role = syncedRole;
          if (!existing.name && user.name) patch.name = user.name;
          if (!existing.image && user.image) patch.image = user.image;
          await db.user.update({ where: { id: existing.id }, data: patch });
          // CRITICAL: when the user signed in via a secondary email,
          // overwrite the next-auth `user.email` with the primary email
          // so the rest of the auth flow (JWT callback, session) uses
          // the canonical identity. Otherwise the session would store
          // the secondary email, and downstream code that does
          // db.user.findUnique({ where: { email: session.user.email } })
          // would miss.
          if (existing.email !== lowerEmail) {
            (user as { email?: string }).email = existing.email;
          }
        }
        (user as { provider?: string }).provider = account?.provider || "google";
        return true;
      } catch (err) {
        console.error("[next-auth] signIn persistence error:", err);
        // Still allow sign-in — the user record is non-critical for auth itself
        return true;
      }
    },
    async jwt({ token, user, account }) {
      if (user?.email) {
        // For the JWT, we always re-resolve from the DB so role changes
        // by an admin take effect on the user's NEXT login (not the
        // current session — that requires a re-auth).
        const dbUser = await db.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.id = dbUser.id;
          token.email = user.email.toLowerCase();
        } else {
          // Fallback (shouldn't happen since signIn creates the row)
          token.role = resolveInitialRole(user.email);
          token.id = user.id || token.sub;
          token.email = user.email.toLowerCase();
        }
        if (account?.provider) token.provider = account.provider;
      } else if (token.email && !token.idResolved) {
        // Self-heal: if the user's JWT was minted during a transient
        // DB issue (or before their row existed), `token.id` may be a
        // Google OAuth `sub` instead of a Prisma UUID — which makes
        // every API that does `db.user.findUnique({ where: { id } })`
        // fail with "User not found". On subsequent requests (where
        // `user` is undefined), re-resolve from the DB by email and
        // mark the token as resolved so we don't repeat the lookup
        // every request.
        const dbUser = await db.user.findUnique({
          where: { email: token.email as string },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.idResolved = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user?.email) {
        (session.user as { role?: string }).role =
          (token.role as string) || resolveInitialRole(session.user.email);
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
