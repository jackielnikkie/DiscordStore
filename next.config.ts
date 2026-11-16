import type { NextConfig } from "next";

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
