import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      {
        source: "/companion/nina/:path*",
        destination: "/nina/:path*",
        permanent: true,
      },
      {
        source: "/companion/nina",
        destination: "/nina",
        permanent: true,
      },
      {
        source: "/companion/:path*",
        destination: "/nina/:path*",
        permanent: true,
      },
      {
        source: "/companion",
        destination: "/nina",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
