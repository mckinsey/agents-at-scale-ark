import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, './'),
  basePath: process.env.ARK_DASHBOARD_BASE_PATH || '',
  assetPrefix: process.env.ARK_DASHBOARD_ASSET_PREFIX || '',
};

export default nextConfig;
