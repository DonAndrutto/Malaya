// On-demand cache revalidation — the missing half of the admin publish flow.
//
// The storefront server-renders from Firestore through Next's data cache
// (ISR, lib/server/firestore.js) with a 5-minute safety-net TTL. Admin writes
// happen client-side, straight into Firestore, so the server never learns
// about them on its own — a topic whose `published` flag just flipped stayed
// invisible on /explore until the TTL expired. The admin save path
// (lib/explore.js) pings this endpoint after every ACKED Firestore write; it
// purges the tagged Explore caches and the routes rendered from them, so
// published content is publicly visible on the very next request.
//
// Deliberately unauthenticated: the admin session lives entirely in the
// browser (Firebase Auth), and this endpoint can only trigger re-reads of
// public data — the same reads any visitor's page view triggers. It exposes
// and mutates nothing.

import { revalidateTag, revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { EXPLORE_CACHE_TAG } from '@/lib/server/explore';

const SCOPES = {
  explore: () => {
    revalidateTag(EXPLORE_CACHE_TAG);
    // Belt-and-braces: purge the prerendered Explore routes and the sitemap
    // too, so the pages themselves (not just their data reads) drop out of
    // the full route cache immediately.
    revalidatePath('/explore');
    revalidatePath('/explore/[group]', 'page');
    revalidatePath('/explore/topic/[slug]', 'page');
    revalidatePath('/sitemap.xml');
  },
};

export async function POST(request) {
  const scope = new URL(request.url).searchParams.get('scope') || 'explore';
  const run = SCOPES[scope];
  if (!run) {
    return NextResponse.json({ revalidated: false, error: 'unknown scope' }, { status: 400 });
  }
  run();
  return NextResponse.json({ revalidated: true, scope, at: Date.now() });
}
