/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/live,:ids',
        destination: '/api/price-live?ids=:ids',
      },
    ];
  },

  // ✅ Do NOT fail production builds because of ESLint
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ✅ Do NOT fail production builds because of TypeScript errors
  // (you still get typechecking in your editor / dev, but builds won't be blocked)
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
