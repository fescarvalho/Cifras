import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf2json', '@napi-rs/canvas'],
  /* config options here */
};

export default nextConfig;
