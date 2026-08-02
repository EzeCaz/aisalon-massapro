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
  // Allow next/image to load remote brand assets stored in Vercel Blob,
  // as well as any other common image hosts used in the project.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.vercel-storage.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      // PER USER SPEC 2026-07-31 (TSK-0034): Style 2 hero overlay assets
      // are served from the production AI Salon site. Without this entry,
      // next/image throws:
      //   "Invalid src prop on `next/image`, hostname 'aisalon.massapro.com'
      //    is not configured under images in your `next.config.js`"
      { protocol: "https", hostname: "aisalon.massapro.com" },
      { protocol: "https", hostname: "*.massapro.com" },
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "./agents/**/*",
      "./backups/**/*",
      "./old-deployment/**/*",
    ],
  },
};

export default nextConfig;
