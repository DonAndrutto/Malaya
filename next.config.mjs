/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'malayajewelrybhutan.com' },
    ],
  },
};

export default nextConfig;
