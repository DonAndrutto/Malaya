// Run only against the localhost server started with preload.cjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'cheerio';
const base = process.env.BASE_URL || 'http://localhost:3100';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const fixtureFile = process.env.MALAYA_FIXTURE_FILE || '/tmp/malaya-fixture.json';
const fixture = JSON.parse(fs.readFileSync(fixtureFile));
const results = [];
async function route(path, expectedCache, bodyText) {
  const res = await fetch(base+path, { redirect: 'manual' });
  const body = await res.text();
  // Next persists generated entries asynchronously after completing HTML.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const cache = res.headers.get('x-nextjs-cache');
  results.push({ path, status: res.status, cache });
  if (expectedCache) assert.equal(cache, expectedCache, path);
  if (bodyText) assert.ok(body.includes(bodyText), `${path} missing ${bodyText}`);
  return { res, body, cache };
}
async function purge(scope) {
  const res = await fetch(`${base}/api/revalidate?scope=${scope}`, { method:'POST', headers:{ authorization:'Bearer isolated-admin' } });
  assert.equal(res.status,200,scope);
}
const details = ['/product/p009','/blog/fixture-post','/explore/fixture-group','/explore/topic/fixture-topic'];
for (const path of details) { await route(path, 'MISS'); await route(path, 'HIT'); }
// Inspect rendered DOM and structured data, not just strings in the RSC payload.
for (const [path,title,type,selector,text] of [
  ['/product/p009','Fixture Ring','Product','.pd-name','Fixture Ring'],
  ['/blog/fixture-post','Fixture Post','BlogPosting','.blog-article','Isolated article body.'],
  ['/explore/fixture-group','Fixture Shelf','CollectionPage','.explore-hero-title','Fixture Shelf'],
  ['/explore/topic/fixture-topic','Fixture Topic','Article','.explore-article','Isolated topic body.'],
]) {
  const {body}=await route(path,'HIT'); const $=load(body);
  assert.ok($('title').text().includes(title),path);
  assert.ok($(selector).text().includes(text),`${path} SSR body missing ${text}`);
  assert.ok($('link[rel=canonical]').attr('href').endsWith(path),path);
  const blocks=$('script[type="application/ld+json"]').map((_,el)=>JSON.parse($(el).text())).get();
  assert.ok(blocks.some((block)=>block['@type']===type),`${path} JSON-LD ${type}`);
}
const manifest=JSON.parse(fs.readFileSync('.next/prerender-manifest.json'));
for(const path of ['/product/[id]','/blog/[slug]','/explore/[group]','/explore/topic/[slug]']) assert.ok(manifest.dynamicRoutes[path],path);

await route('/about','HIT'); await route('/blog','HIT');
await purge('blog');
await route('/product/p009','HIT'); await route('/explore/fixture-group','HIT'); await route('/about','HIT');
await route('/blog/fixture-post','MISS'); await route('/blog/fixture-post','HIT');
await purge('explore');
await route('/about','HIT'); await route('/blog','MISS'); // prior blog purge
await route('/blog','HIT');
await route('/product/p009','MISS'); // symbol references are an actual dependency
await route('/explore/fixture-group','MISS');
// Previously missing URLs must become visible after publishing, and a cached
// article must disappear after unpublishing. Only the isolated JSON changes.
await route('/blog/new-post','MISS','This post could not be found.');
fixture.blogPosts['new-post'] = { title:'New Fixture Post', published:true, body:'New isolated body.' };
fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
await purge('blog');
await route('/blog/new-post','MISS','New isolated body.');
await route('/blog/new-post','HIT');
fixture.blogPosts['new-post'].published = false;
fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
await purge('blog');
const hidden = await route('/blog/new-post','MISS','This post could not be found.');
assert.ok(hidden.body.includes('noindex'));
await route('/explore/topic/new-topic','MISS','This topic could not be found');
fixture.exploreTopics['new-topic'] = { title:'New Topic', published:true, previousSlugs:['old-topic'], blocks:[] };
fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
await purge('explore');
await route('/explore/topic/new-topic','MISS','New Topic');
const renamed = await route('/explore/topic/old-topic','MISS');
assert.equal(renamed.res.status,308);
assert.equal(renamed.res.headers.get('location'),'/explore/topic/new-topic');
await route('/explore/topic/old-topic','HIT');
// Settings/copy affect shared chrome; catalogue affects shared cart data.
fixture.siteSettings.content.hero.title = 'Updated Fixture Studio';
fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
await purge('content');
await route('/','MISS','Updated Fixture Studio');
await route('/robots.txt','HIT');
await purge('catalogue');
await route('/about','MISS'); await route('/about','HIT');
const unauth = await fetch(base+'/api/revalidate?scope=blog',{method:'POST'});
assert.equal(unauth.status,401);
const unknown = await fetch(base+'/api/revalidate?scope=unknown',{method:'POST'});
assert.equal(unknown.status,400);
const sitemap = await route('/sitemap.xml'); assert.ok(sitemap.body.includes('/product/p009'));
const redirect = await route('/catalogue'); assert.equal(redirect.res.status,307);
console.log(JSON.stringify(results,null,2));
