import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — no DB or bcrypt imports, so it can run in
 * middleware. Providers are attached in src/auth.ts (Node runtime only).
 */
export const authConfig = {
  pages: { signIn: "/admin/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isProtected =
        nextUrl.pathname.startsWith("/admin") &&
        !nextUrl.pathname.startsWith("/admin/login");
      if (isProtected) return !!auth?.user;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "admin";
        token.isOwner = user.isOwner ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      session.user.role =
        (token.role as "admin" | "observer" | undefined) ?? "admin";
      session.user.isOwner = (token.isOwner as boolean | undefined) ?? false;
      return session;
    },
  },
  providers: [], // filled in src/auth.ts
} satisfies NextAuthConfig;
