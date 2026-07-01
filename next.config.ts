import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  experimental: {
    outputFileTracingIncludes: {
      '/api/parse-pdf': ['./node_modules/pdf-parse/**/*'],
    },
  },
};

export default nextConfig;
