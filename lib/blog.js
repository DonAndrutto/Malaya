'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Blog posts — admin-authored Markdown articles. Mirrors lib/overrides.js: each
// post is one Firestore document (collection `blogPosts`, document id = slug) with
// a localStorage cache for an instant paint + cross-tab sync, and a live snapshot
// so posts published in /admin appear on the storefront immediately.
//
// Post shape: { slug, title, date, excerpt, cover, coverPos, tags[], body(markdown), published }
// ─────────────────────────────────────────────────────────────────────────────

import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';

export const BLOG_KEY = 'malaya:blog:v1';
const COLLECTION = 'blogPosts';

export function loadBlog() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(BLOG_KEY)) || {}; } catch { return {}; }
}

function writeLocal(obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(BLOG_KEY, JSON.stringify(obj)); } catch {}
}

// Persist one post (pass null/undefined to delete). localStorage first, then mirror
// the single document to Firestore.
export function saveBlogPost(slug, post) {
  if (!slug) return;
  const all = loadBlog();
  if (post) all[slug] = { ...post, slug }; else delete all[slug];
  writeLocal(all);
  if (!FIREBASE_ENABLED || typeof window === 'undefined') return;
  const { db } = getFirebase();
  if (!db) return;
  try {
    if (post) setDoc(doc(db, COLLECTION, slug), { ...post, slug, _updated: Date.now() }).catch(() => {});
    else deleteDoc(doc(db, COLLECTION, slug)).catch(() => {});
  } catch {}
}

export function deleteBlogPost(slug) { saveBlogPost(slug, null); }

export function subscribeBlog(cb) {
  if (typeof window === 'undefined') return () => {};
  cb(loadBlog());
  if (FIREBASE_ENABLED) {
    const { db } = getFirebase();
    if (db) {
      return onSnapshot(
        collection(db, COLLECTION),
        (snap) => {
          const map = {};
          snap.forEach((d) => { const { _updated, ...rest } = d.data(); map[d.id] = { ...rest, slug: d.id }; });
          writeLocal(map);
          cb(map);
        },
        () => {},
      );
    }
  }
  const onStorage = (e) => { if (e.key === BLOG_KEY) cb(loadBlog()); };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

// {slug: post} map → array, newest first. Falls back to title order for equal dates.
export function blogList(map, { publishedOnly = false } = {}) {
  return Object.values(map || {})
    .filter((p) => p && p.title && (!publishedOnly || p.published))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.title).localeCompare(String(b.title)));
}

export function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
