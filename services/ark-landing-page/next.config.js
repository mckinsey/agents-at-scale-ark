/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    // TODO: Fix TypeScript errors in demos.ts related to @kubernetes/client-node API changes
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
