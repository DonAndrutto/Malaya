/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
    ],
  },
  // The catalogue is now part of the home page (slideshow → category-grouped
  // scroll); forward the old route and any bookmarks to it.
  async redirects() {
    return [{ source: '/catalogue', destination: '/', permanent: false }];
  },
};

export default nextConfig;
