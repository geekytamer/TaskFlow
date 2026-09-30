/** @type {import('next').NextConfig} */
const nextConfig = {
  // Two dev servers (client and influencer) must not share one output directory.
  // Production builds once into .next and both hosts read it.
  distDir: process.env.PORTAL_DIST_DIR || '.next',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/:path((?!api/files/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        ],
      },
      {
        // Files come from outside the company. Config headers override a route's
        // own, so the download's sandbox has to be declared here, not only upstream.
        source: '/api/files/:id',
        headers: [
          { key: 'Content-Security-Policy', value: "sandbox; default-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
