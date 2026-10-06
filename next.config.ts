import type { NextConfig } from "next";

const s3Host = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).hostname : undefined;

const nextConfig: NextConfig = {
  // End-to-end tests build into their own folder so they never disturb `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Card data never touches our servers (Stripe Checkout), but we still lock headers down.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      ...(s3Host ? [{ protocol: "https" as const, hostname: s3Host }] : []),
      { protocol: "https", hostname: "files.cdn.printful.com" },
      { protocol: "https", hostname: "images-api.printify.com" },
      { protocol: "https", hostname: "*.gelatoapis.com" },
    ],
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
