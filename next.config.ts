import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  env: {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "",
  },
  async redirects() {
    return [
      {
        source: '/teacher-dashboard',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/teacher-dashboard/:path*',
        destination: '/dashboard/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
