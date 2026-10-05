/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: [
    '@podscare/ui',
    '@podscare/types',
    '@podscare/api-client',
    '@podscare/config-tailwind',
  ],
  generateBuildId: async () => 'fixo-build-' + Date.now(),
  async headers() {
    return [
      {
        // Không bao giờ cache HTML, trang động hoặc Next.js RSC data
        source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        // Cho phép cache tối đa các file tĩnh có hash
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
