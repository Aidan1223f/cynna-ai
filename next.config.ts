import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ["192.168.0.157"],
  typescript: {
    tsconfigPath: "tsconfig.next.json",
  },
};

export default nextConfig;
