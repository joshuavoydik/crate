import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  // Read at request time; the file tracer cannot see a readdir.
  outputFileTracingIncludes: { "/api/mac/install": ["./helpers/nowplaying/**"], "/api/chrome/extension": ["./crate-chrome/**"] },
  devIndicators: false,
  serverExternalPackages: ["@libsql/client", "sharp"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
