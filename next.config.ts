import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["192.168.1.189"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
