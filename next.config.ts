import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sharp and Prisma are server-only native deps.
  serverExternalPackages: ["sharp", "@prisma/client"],
  // Each Render deploy has its own id (the commit). A page opened before a deploy then knows it's
  // out of date: Next.js reloads it on the next navigation instead of calling code that no longer exists.
  deploymentId: process.env.RENDER_GIT_COMMIT || undefined,
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
    // proxy.ts runs on every request and buffers bodies only up to this size (10 MB by
    // default). Photo uploads (up to 3 phone photos) are bigger, and a cut-off body
    // breaks the upload, so match the Server Action limit.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
