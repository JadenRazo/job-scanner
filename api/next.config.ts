import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "./"),
  serverExternalPackages: [
    "pg",
    "unpdf",
    "mammoth",
  ],
};

export default nextConfig;
