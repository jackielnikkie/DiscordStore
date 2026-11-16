import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
