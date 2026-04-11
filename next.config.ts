import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["@resvg/resvg-js"],
  async redirects() {
    return [
      // Canonical host: www.coolbid.app → coolbid.app
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.coolbid.app" }],
        destination: "https://coolbid.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
