import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sports/design", "@sports/domain"],
};

export default nextConfig;
