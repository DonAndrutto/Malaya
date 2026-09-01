// ─────────────────────────────────────────────────────────────────────────────
// Guards the storefront's cache policy — the thing that decides how much
// Vercel ISR/compute the site burns, and how fast an admin publish goes live.
//
// Two invariants worth a test:
//   1. Route segment config (`export const revalidate = …`) must be a literal,
//      so it cannot import REVALIDATE_SECONDS. Nothing but this test stops the
//      two drifting apart — and a route that quietly keeps a 300 while the
//      constant says 86400 is exactly the regression that put the ISR-write
//      allowance over quota.
//   2. No storefront route may opt out of caching (force-dynamic / no-store /
//      revalidate = 0). Every one of them would turn a cacheable page into a
//      render on every request.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'app');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(e.name) ? [full] : [];
  });
}

const APP_FILES = walk(APP);
const rel = (f) => path.relative(ROOT, f);

// Read the constant out of the source rather than importing lib/server/*:
// those modules pull in `react`'s server-only `cache` export, which does not
// exist under a plain Node (jest) resolution.
const FIRESTORE_SRC = fs.readFileSync(path.join(__dirname, 'firestore.js'), 'utf8');
const REVALIDATE_SECONDS = Number(
  (FIRESTORE_SRC.match(/^export const REVALIDATE_SECONDS = (\d+);$/m) || [])[1],
);

describe('cache policy', () => {
  test('the safety-net TTL is 24 hours', () => {
    expect(REVALIDATE_SECONDS).toBe(86400);
  });

  test('every route segment `revalidate` matches the safety-net TTL', () => {
    const found = APP_FILES.flatMap((f) => {
      const m = fs.readFileSync(f, 'utf8').match(/^export const revalidate = (\S+);$/m);
      return m ? [[rel(f), m[1]]] : [];
    });
    // If this drops to zero, someone removed the route configs wholesale and
    // the routes now inherit whatever their data reads happen to say.
    expect(found.length).toBeGreaterThan(0);
    found.forEach(([file, value]) => {
      expect([file, value]).toEqual([file, String(REVALIDATE_SECONDS)]);
    });
  });

  test('the server Firestore readers default to the safety-net TTL', () => {
    // fetchDoc/fetchCollection take `revalidate = REVALIDATE_SECONDS`; the
    // unstable_cache wrappers pass it explicitly. No literal seconds anywhere.
    const serverSrc = ['firestore.js', 'explore.js', 'site.js']
      .map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'))
      .join('\n');
    expect(serverSrc).not.toMatch(/revalidate:\s*\d/);
    expect(serverSrc).not.toMatch(/REVALIDATE_SECONDS = \d+;[\s\S]*REVALIDATE_SECONDS = \d+;/);
  });

  test('no storefront route opts out of caching', () => {
    const offenders = APP_FILES.filter((f) => {
      if (rel(f).startsWith(path.join('app', 'api'))) return false; // route handlers are meant to be dynamic
      const src = fs.readFileSync(f, 'utf8');
      return /export const dynamic = ['"]force-dynamic['"]/.test(src)
        || /export const fetchCache = ['"]force-no-store['"]/.test(src)
        || /export const revalidate = 0/.test(src)
        || /cache:\s*['"]no-store['"]/.test(src);
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  test('every admin write scope has a matching on-demand purge', () => {
    // lib/*.js pings a scope after an ACKED Firestore write; the endpoint must
    // know it, or that content silently waits out the 24h TTL instead.
    const pinged = new Set();
    ['blog.js', 'explore.js', 'overrides.js', 'site-content.js', 'site-settings.js'].forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8');
      for (const m of src.matchAll(/pingRevalidate\(['"]([a-z-]+)['"]\)/g)) pinged.add(m[1]);
    });
    const routeSrc = fs.readFileSync(path.join(APP, 'api', 'revalidate', 'route.js'), 'utf8');
    const scopes = new Set(
      [...routeSrc.matchAll(/^\s{2}([a-z-]+): \(\) => \{$/gm)].map((m) => m[1]),
    );
    expect([...pinged].sort()).toEqual(['blog', 'explore', 'site']);
    [...pinged].forEach((scope) => expect([...scopes]).toContain(scope));
  });

  test('images are still served straight from Firebase Storage', () => {
    // Re-enabling the Vercel image optimizer exhausts the Hobby transformation
    // quota and photos start 402-ing — see IMAGES.md.
    const cfg = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
    expect(cfg).toMatch(/images:\s*\{[\s\S]*?unoptimized:\s*true/);
  });
});
