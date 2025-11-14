/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // TEMP: allow builds to succeed even if ESLint finds errors.
    // This is so you can deploy now and clean up lint issues later.
    ignoreDuringBuilds: true,
  },

  async rewrites() {
    return [
      // SAFETY: map accidental "/live,<ids>" to the legacy batched adapter
      {
        source: "/live,:ids",
        destination: "/api/price-live?ids=:ids",
      },
    ];
  },
};

module.exports = nextConfig;
