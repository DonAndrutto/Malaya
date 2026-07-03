import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SITE_URL } from '@/lib/server/site';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Malaya Jewellery · Fine Buddhist Jewellery',
  description: 'Handcrafted Buddhist jewellery — mantras, ritual objects and healing stones in fine gold and silver.',
  // Self-referencing canonical, resolved per route against metadataBase.
  alternates: { canonical: './' },
  openGraph: {
    siteName: 'Malaya Jewellery',
    type: 'website',
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3B231A',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500;600&family=Poppins:wght@300;400;500;600&family=Raleway:wght@300;400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
