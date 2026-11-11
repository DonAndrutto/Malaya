import { staticPageMetadata } from '@/lib/metadata';
import { ContactPage } from '@/components/store/site/SitePages';

export const metadata = staticPageMetadata({
  path: '/contact',
  image: 'contact',
  title: 'Contact · Malaya Jewellery',
  description: 'Contact Malaya Jewellery for orders, bespoke pieces and international shipping enquiries — WhatsApp and email.',
});

export default function Page() {
  return <ContactPage />;
}
