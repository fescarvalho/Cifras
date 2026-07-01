import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/parse-pdf': ['./node_modules/pdf-parse/**/*'],
  },
};

export default withSerwist(nextConfig);
