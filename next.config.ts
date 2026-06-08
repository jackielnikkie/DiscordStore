import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.5"],
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
