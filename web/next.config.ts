import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Include the existing shared Tink modules and category mapping when deploying web/.
  outputFileTracingRoot: path.resolve(import.meta.dirname, ".."),
};

export default nextConfig;
