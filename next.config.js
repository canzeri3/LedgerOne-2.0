/** @type {import('next').NextConfig} */
const nextConfig = {
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

