import type { DefaultSession } from "next-auth";

export type AdminRole = "admin" | "observer";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: AdminRole; isOwner: boolean } & DefaultSession["user"];
  }
  interface User {
    role?: AdminRole;
    isOwner?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AdminRole;
    isOwner?: boolean;
  }
}
