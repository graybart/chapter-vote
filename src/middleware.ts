import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Protects /admin/* via the `authorized` callback in auth.config.ts.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/admin/:path*"],
};
