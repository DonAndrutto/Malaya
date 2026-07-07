'use client';

// Upload images to Firebase Storage and return their public download URLs.

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebase, FIREBASE_ENABLED } from './firebase';

// Upload a File/Blob under `folder` (e.g. 'products/p001' or 'site/hero') and
// return the public URL to store in Firestore.
//
// Every upload gets a unique (timestamped) object name, so the file behind a
// URL never changes — it can safely be cached "forever" by browsers and the
// Firebase CDN (Cache-Control below). Visitors download these files directly
// (the image optimizer is disabled — see IMAGES.md), so this immutable cache
// header is what keeps repeat views free.
export async function uploadImage(folder, file) {
  if (!FIREBASE_ENABLED) throw new Error('Firebase is not configured.');
  const { storage } = getFirebase();
  if (!storage) throw new Error('Storage is unavailable in this context.');
  const safe = (file.name || 'image').replace(/[^\w.\-]+/g, '_');
  const fullPath = `${folder}/${Date.now()}-${safe}`;
  const snap = await uploadBytes(ref(storage, fullPath), file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return getDownloadURL(snap.ref);
}
