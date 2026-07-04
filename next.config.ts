import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the IM gateway preview host to talk to the dev server.
  allowedDevOrigins: [
    "https://*.space-z.ai",
    "http://*.space-z.ai",
  ],
  outputFileTracingExcludes: {
    "*": [
      "./agents/**/*",
      "./backups/**/*",
      "./old-deployment/**/*",
    ],
  },
};

export default nextConfig;
