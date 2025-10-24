import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production build configuration
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has TypeScript errors.
    ignoreBuildErrors: true,
  },
  // Configure for deployment
  output: 'standalone',
  experimental: {
    turbo: {
      root: '../'
    }
  }
};

export default nextConfig;
