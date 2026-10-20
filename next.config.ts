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
        // The usual belt and braces on every response; the app embeds nothing and is embedded nowhere.
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
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
