import { SITE_URL, SITE_NAME } from './site-url';
import { SOCIAL_IMAGES } from './social-images';

// Explicit paths prevent Next's internal home route (/index) becoming canonical.
export function staticPageMetadata({ path, title, description, image }) {
  const url = new URL(path, SITE_URL).toString();
  const images = image ? [{
    url: `${SITE_URL}/social/${image}`,
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: SOCIAL_IMAGES[image].alt,
  }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url, siteName: SITE_NAME, type: 'website', locale: 'en_US',
      ...(images ? { images } : {}),
    },
    twitter: {
      title, description, card: images ? 'summary_large_image' : 'summary',
      ...(images ? { images } : {}),
    },
  };
}
