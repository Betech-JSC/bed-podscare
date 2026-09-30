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
