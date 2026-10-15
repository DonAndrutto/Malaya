// Local fixture verification of the preview-only, non-reporting diagnostic.
// Transport is mocked here; these tests do not claim actual image delivery.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL;
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const browser=await chromium.launch();
const evidence=[];
try {
 for(const outcome of ['loaded','failed','timeout']) {
  const context=await browser.newContext({...devices['iPhone 13']});
  const requests=[];
  await context.route('**/*',async route=>{
   const url=route.request().url();requests.push(url);
   if(url.startsWith(base))return route.continue();
   if(url.startsWith('https://firebasestorage.googleapis.com/')) {
    if(outcome==='failed')return route.abort('failed');
    if(outcome==='timeout')return; // Hold the request; the page must abort/finish itself.
    return route.fulfill({status:200,headers:{'content-type':'image/svg+xml','access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="46"><rect width="64" height="46" fill="green"/></svg>'});
   }
   throw new Error('Unexpected external diagnostic request: '+new URL(url).hostname);
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base+'/api/image-check',{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  assert.ok(response.headers()['content-security-policy'].includes("script-src 'sha256-"));
  const started=Date.now();
  await page.getByText('Finished. Do the pictures above appear?',{exact:false}).waitFor({timeout:27000});
  const elapsed=Date.now()-started;
  assert.ok(elapsed<27000, 'Diagnostic exceeded its time budget');
  assert.equal(await page.locator('[data-sample]').count(),3);
  const report=await page.locator('#report').inputValue();
  assert.ok(report.includes('Control: loaded 64×46'));
  assert.ok(report.length<=2500);
  assert.ok(report.split('\n').length>=11, 'Copy report must contain readable lines');
  assert.ok(!/https?:|token=|userAgent|utun|10\.\d+\.\d+\.\d+/.test(report));
  if(outcome==='loaded') {assert.ok(report.includes('loaded 64×46'));assert.ok(report.includes('HTTP 200 / image/svg+xml'));}
  else if(outcome==='failed') {assert.ok(report.includes('image error'));assert.ok(report.includes('status unavailable'));}
  else {assert.ok(report.includes('timed out'));}
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(url=>url.startsWith(base)||url.startsWith('https://firebasestorage.googleapis.com/')));
  assert.ok(requests.length<=11,`Unbounded requests: ${requests.length}`);
  evidence.push({outcome,report,requests:requests.length,extraServices:0,elapsedMs:elapsed});
  await context.close();
 }
} finally {await browser.close();}
console.log(JSON.stringify(evidence,null,2));
