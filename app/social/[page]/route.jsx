import { ImageResponse } from 'next/og';
import { SOCIAL_IMAGES } from '@/lib/social-images';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SOCIAL_IMAGES).map((page) => ({ page }));
}

// Render once during the build: social crawlers receive a local, cached PNG
// without depending on Firebase image delivery at request time.
export async function GET(_request, { params }) {
  const { page } = await params;
  const photo = SOCIAL_IMAGES[page];
  if (!photo) return new Response('Not found', { status: 404 });
  const response = await fetch(photo.source, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Social image source unavailable: ${page}`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.startsWith('image/')) throw new Error(`Invalid social image source: ${page}`);
  const src = `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  return new ImageResponse(
    <div style={{ display: 'flex', width: 1200, height: 630, background: '#f5f0e5' }}>
      {/* ImageResponse requires a plain img; the original photograph is unchanged. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={photo.alt} width={1200} height={630}
        style={{ objectFit: photo.fit, objectPosition: photo.position }} />
    </div>,
    { width: 1200, height: 630 },
  );
}
