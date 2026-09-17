import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output = self-contained server bundle, required for the Docker
  // deployment target. Vercel ignores this and deploys normally.
  output: "standalone",
};

export default nextConfig;
