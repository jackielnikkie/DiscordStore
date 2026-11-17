import type { NextConfig } from "next";

// Conservative CSP for the admin panel + admin APIs. 'unsafe-inline' is required on
// script-src because Next injects inline bootstrap/hydration scripts and inline
// styles into the served HTML; a nonce/hash pipeline would need per-request middleware
// rewriting and is out of scope here.
const ADMIN_CSP =
  "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next 15 default cache dynamic = 0 → tiap klik balik ke admin refetch penuh.
    staleTimes: { dynamic: 30, static: 300 },
  },
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  serverExternalPackages: ["discord.js", "@discordjs/ws", "zlib-sync"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/admin/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: ADMIN_CSP },
        ],
      },
      {
        source: "/api/admin/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: ADMIN_CSP },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "zlib-sync": require.resolve("./src/shims/zlib-sync.ts"),
    };

    return config;
  },
};

export default nextConfig;
