import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat route reads its instructions from this file, so make sure it ships with the route.
  outputFileTracingIncludes: {
    "/api/chat": ["./lib/instructions.md"],
  },
};

export default nextConfig;
