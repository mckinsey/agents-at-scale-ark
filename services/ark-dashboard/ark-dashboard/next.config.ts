import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: process.env.ARK_DASHBOARD_BASE_PATH || '',
  assetPrefix: process.env.ARK_DASHBOARD_ASSET_PREFIX || '',
  async redirects() {
    return [
      { source: '/events', destination: '/broker', permanent: true },
      { source: '/event/:path*', destination: '/broker', permanent: true },
    ];
  },
};

export default nextConfig;
