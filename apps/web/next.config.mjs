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
        destination: `${process.env.BACKEND_INTERNAL_URL || 'http://103.48.84.51:8088'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
