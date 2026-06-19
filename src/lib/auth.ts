import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
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
    // Developer fallback — lets you sign in with any email locally without Google.
    // Disabled in production by checking NODE_ENV.
    ...(process.env.NODE_ENV !== "production"
      ? [
          CredentialsProvider({
            name: "Dev Email",
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
        ]
      : []),
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
        const existing = await db.user.findUnique({ where: { email: user.email } });
        if (!existing) {
          await db.user.create({
            data: {
              email: user.email,
              name: user.name || null,
              image: user.image || null,
              role,
            },
          });
        } else if (existing.role !== role) {
          // Keep role in sync (in case ADMIN_EMAIL was changed in env)
          await db.user.update({
            where: { id: existing.id },
            data: { role },
          });
        }
        // Stash the provider on the user object so session callback can read it
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
