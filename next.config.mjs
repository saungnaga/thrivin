import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
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
  eslint: {
    // Non-interactive build gate: ignore ESLint wizard during next build
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
