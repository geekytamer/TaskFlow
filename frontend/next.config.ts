import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Deploys build into a side folder (NEXT_DIST_DIR=.next-new) and swap it in,
  // so the running server never serves a half-written .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Builds fail on type errors and lint errors, so neither can reach a deploy.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
