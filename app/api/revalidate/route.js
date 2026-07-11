// On-demand cache revalidation — the missing half of the admin publish flow.
//
// The storefront server-renders from Firestore through Next's data cache
// (ISR, lib/server/firestore.js) with a 5-minute safety-net TTL. Admin writes
// happen client-side, straight into Firestore, so the server never learns
// about them on its own — a freshly published topic, blog post, price or
// site-copy change stayed invisible in the server HTML until the TTL expired.
// The admin save paths (lib/revalidate-ping.js) ping this endpoint after every
// ACKED Firestore write; it purges the tagged caches and the routes rendered
// from them, so published content is publicly visible on the very next request.
//
// Requires a signed-in **admin**: the caller sends its Firebase ID token and
// this route verifies it against the Identity Toolkit API (public web key —
// no Admin SDK, no server credentials), accepting the `admin` custom claim or
// the admins/{uid} allowlist document (which the rules let a user read about
// themselves, so the same token authorises the check). The endpoint mutates
// nothing and exposes nothing, but an unauthenticated purge loop would force
// a fresh Firestore read + full re-render on every request — a
// cost-amplification lever nobody anonymous needs to hold.

import { revalidateTag, revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { EXPLORE_CACHE_TAG } from '@/lib/server/explore';
import { BLOG_CACHE_TAG, SITE_CACHE_TAG } from '@/lib/server/firestore';
import { firebaseConfig } from '@/lib/firebase-config';

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
  blog: () => {
    revalidateTag(BLOG_CACHE_TAG);
    revalidatePath('/blog');
    revalidatePath('/blog/[slug]', 'page');
    revalidatePath('/sitemap.xml');
  },
  site: () => {
    // Catalogue overrides and siteSettings feed the layout of every route
    // (getServerLayoutData), so the whole tree drops out together.
    revalidateTag(SITE_CACHE_TAG);
    revalidatePath('/', 'layout');
  },
};

async function isAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        cache: 'no-store',
      },
    );
    if (!res.ok) return false;
    const json = await res.json();
    const user = (json.users || [])[0];
    if (!user || !user.localId) return false;
    try {
      if (JSON.parse(user.customAttributes || '{}').admin === true) return true;
    } catch {}
    // Allowlist fallback: admins/{uid} is readable by its own user, so the
    // caller's token is exactly the credential this read needs.
    const allow = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/admins/${encodeURIComponent(user.localId)}`,
      { headers: { authorization: `Bearer ${idToken}` }, cache: 'no-store' },
    );
    return allow.ok;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const scope = new URL(request.url).searchParams.get('scope') || 'explore';
  const run = SCOPES[scope];
  if (!run) {
    return NextResponse.json({ revalidated: false, error: 'unknown scope' }, { status: 400 });
  }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await isAdminToken(token))) {
    return NextResponse.json({ revalidated: false, error: 'admin token required' }, { status: 401 });
  }
  run();
  return NextResponse.json({ revalidated: true, scope, at: Date.now() });
}
