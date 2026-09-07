import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Version-skew protection: tabs still running an older build reload instead of failing after a deploy.
  deploymentId: process.env.RENDER_GIT_COMMIT || process.env.NEXT_DEPLOYMENT_ID || undefined,
  serverExternalPackages: ["postgres"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }],
  },
};

export default nextConfig;
