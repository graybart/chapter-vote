import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { authConfig } from "@/auth.config";

/**
 * Credentials auth against the `admins` table. Individual accounts so
 * created_by / closed_by on elections and contests are attributable.
 * A magic-link provider (Resend/SMTP) can be added here later without
 * schema changes.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const [admin] = await db
          .select()
          .from(admins)
          .where(eq(admins.email, email));
        if (!admin) return null;

        const ok = await bcrypt.compare(password, admin.passwordHash);
        if (!ok) return null;

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          isOwner: admin.isOwner,
        };
      },
    }),
  ],
});
