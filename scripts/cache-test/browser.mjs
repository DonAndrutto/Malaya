import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://localhost:3100';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const browser = await chromium.launch({ headless:true });
const results = [];
try {
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 const context = await browser.newContext({ viewport });
 await context.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
 const page = await context.newPage();
 const errors=[];
 page.on('pageerror',(err)=>errors.push(err.message));
 page.on('console',(message)=>{ if(message.type()==='error' && /hydration|hydrating|Minified React error/i.test(message.text())) errors.push(message.text()); });
 await page.addInitScript(() => { if (!localStorage.getItem('fixture-cart-seeded')) {
   localStorage.setItem('malaya-site-cart-v1',JSON.stringify([{id:'p010',qty:1,size:54},{id:'p009',qty:2,size:54},{id:'p009',qty:1,size:56},{id:'missing-fixture',qty:1}]));
   localStorage.setItem('fixture-cart-seeded','1');
 }});
 for (const path of ['/blog','/blog/fixture-post','/explore','/explore/fixture-group','/explore/topic/fixture-topic','/about','/contact','/policy/privacy','/order']) {
  await page.goto(base+path,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('.hdr-cart-count')?.textContent==='5');
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('malaya-site-cart-v1')));
  assert.deepEqual(cart,[{id:'p009',qty:3,size:54},{id:'p009',qty:1,size:56},{id:'missing-fixture',qty:1}]);
  assert.ok((await page.locator('.hdr-cart-name').allTextContents()).some((s)=>s.includes('Fixture Ring')));
  assert.ok((await page.locator('.hdr-cart-name').allTextContents()).some((s)=>s.includes('no longer available')));
  const total = await page.locator('.hdr-cart-total').textContent();
  assert.ok(total.includes('480'),total);
  results.push({width:viewport.width,path,cartCount:5,total:480});
 }
 await page.goto(base+'/product/p009',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(() => document.querySelector('.hdr-cart-count')?.textContent==='5');
 await page.locator('.pd-size-select').selectOption('54');
 await page.waitForFunction(() => document.querySelector('.pd-size-status')?.textContent.includes('54'));
 await page.locator('.pd-order-buy button.btn-malaya').click();
 await page.locator('.cart-notice').waitFor({state:'visible'});
 assert.ok((await page.locator('.cart-notice').innerText()).includes('Fixture Ring'));
 const addedCart = await page.evaluate(() => JSON.parse(localStorage.getItem('malaya-site-cart-v1')));
 assert.equal(addedCart.find((line) => line.id === 'p009' && line.size === 54).qty, 4);
 assert.equal(addedCart.length, 3);
 // Client-side navigation must retain the notice and shared cart outside the
 // nested editorial data context.
 await page.locator('.hdr-nav a[href="/blog"]').first().click();
 await page.waitForURL(base+'/blog');
 assert.ok((await page.locator('.cart-notice').innerText()).includes('Fixture Ring'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(() => document.querySelector('.hdr-cart-count')?.textContent==='6');
 await page.goto(base+'/order',{waitUntil:'domcontentloaded'});
 await page.locator('.order-table tbody tr').first().waitFor();
 assert.ok((await page.locator('.order-table').innerText()).includes('Ring size 54'));
 const checkout=await page.getByRole('link',{name:/checkout via whatsapp/i}).getAttribute('href');
 const text=new URL(checkout).searchParams.get('text');
 assert.ok(text.includes('Fixture Ring')); assert.ok(text.includes('size 54 EU'));
 assert.deepEqual(errors,[]);
 await page.screenshot({path:`/tmp/malaya-cart-${viewport.width}.png`,fullPage:true});
 await context.close();
}
console.log(JSON.stringify(results,null,2));
} finally { await browser.close(); }
