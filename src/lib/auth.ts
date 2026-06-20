import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "eze@massapro.com").toLowerCase();

/**
 * Resolve the role for a given email.
 * Only ADMIN_EMAIL gets "ADMIN"; everyone else is "MEMBER".
 */
function resolveRole(email: string): "ADMIN" | "MEMBER" {
  return email.toLowerCase() === ADMIN_EMAIL ? "ADMIN" : "MEMBER";
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
    // Login provider — email + name, no password. Currently the ONLY
    // working sign-in option while we resolve Google OAuth
    // (redirect_uri_mismatch) and email-password delivery (no SMTP
    // configured yet). To restore the multi-tab login UI, see git
    // history of src/app/login/login-form.tsx.
    CredentialsProvider({
      id: "login",
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
        const role = resolveRole(user.email);
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
          await db.user.create({
            data: {
              email: lowerEmail,
              name: user.name || null,
              image: user.image || null,
              role,
            },
          });
        } else {
          // Keep role in sync (in case ADMIN_EMAIL was changed in env).
          // Only patch fields that need patching — don't clobber the
          // user's profile photo / bio / etc.
          const patch: Record<string, unknown> = {};
          if (existing.role !== role) patch.role = role;
          if (!existing.name && user.name) patch.name = user.name;
          if (!existing.image && user.image) patch.image = user.image;
          if (Object.keys(patch).length > 0) {
            await db.user.update({ where: { id: existing.id }, data: patch });
          }
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
        token.role = resolveRole(user.email);
        token.id = user.id || token.sub;
        if (account?.provider) token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user?.email) {
        (session.user as { role?: string }).role =
          (token.role as string) || resolveRole(session.user.email);
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
