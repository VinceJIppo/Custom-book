import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sharp and Prisma are server-only native deps.
  serverExternalPackages: ["sharp", "@prisma/client"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
