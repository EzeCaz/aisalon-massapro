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
    "https://preview-chat-604b7c23-05dc-4d4c-8ebf-db5e8a49077c.space-z.ai",
    "https://preview-ws-28fa7467-2732-4124-b464-646264dc1fda.space-z.ai",
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
