const isDev = process.env.NODE_ENV === 'development';

// Content-Security-Policy. Everything the site talks to is enumerated here:
//   - Firebase (Firestore/Auth/Storage)  → *.googleapis.com
//   - Google Fonts                        → fonts.googleapis.com / fonts.gstatic.com
//   - Vercel Analytics / Speed Insights   → va.vercel-scripts.com, vitals.vercel-insights.com
//   - Vercel preview toolbar              → vercel.live (preview deployments only)
// Next.js needs 'unsafe-inline' scripts for its bootstrap; dev additionally
// needs 'unsafe-eval' for react-refresh.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com https://vercel.live`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://vercel.live",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.googleapis.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://vercel.live wss://*.pusher.com",
  "frame-src https://vercel.live",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Images are served straight from Firebase Storage, NOT through the
    // Vercel image optimizer: the Hobby plan's transformation quota runs out,
    // after which uncached variants 402 and photos vanish. The uploads are
    // already delivery-ready — the admin console downscales every image to
    // ≤2048px within a byte budget (lib/image-resize.js) and stores it under
    // a unique name with a one-year immutable Cache-Control (lib/upload.js).
    // Full background and the revert path (Vercel Pro): IMAGES.md.
    unoptimized: true,
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        // The admin console must never be indexed or cached.
        source: '/admin',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
  // The catalogue is now part of the home page (slideshow → category-grouped
  // scroll); forward the old route and any bookmarks to it.
  async redirects() {
    return [{ source: '/catalogue', destination: '/', permanent: false }];
  },
};

export default nextConfig;
