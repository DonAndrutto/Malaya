import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'malaya-cache-test-'));
const fixture=path.join(output,'fixture.json');
fs.copyFileSync(path.join(root,'scripts/cache-test/fixture.json'),fixture);
const env={...process.env,VERCEL_ENV:'preview',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:`--require=${path.join(root,'scripts/cache-test/preload.cjs')}`,MALAYA_FIXTURE_FILE:fixture,MALAYA_FIXTURE_LOG:path.join(output,'fetches.jsonl')};
const next=path.join(root,'node_modules/next/dist/bin/next');
function run(args,envOverride,log) {
 return new Promise((resolve,reject)=>{const stream=fs.openSync(path.join(output,log),'w'); const child=spawn(process.execPath,args,{cwd:root,env:envOverride,stdio:['ignore',stream,stream]});child.on('exit',(code)=>code===0?resolve():reject(new Error(`${log} exited ${code}; inspect ${output}`)));child.on('error',reject);});
}
console.log(`Evidence: ${output}`);
// Own generated build directory only. Never run concurrently with next dev.
fs.rmSync(path.join(root,'.next'),{recursive:true,force:true});
await run([next,'build'],env,'build.log');
const stream=fs.openSync(path.join(output,'server.log'),'w');
const server=spawn(process.execPath,[next,'start','--hostname','127.0.0.1','--port','3101'],{cwd:root,env,stdio:['ignore',stream,stream]});
const base='http://127.0.0.1:3101';
try {
 let ready=false;
 for(let i=0;i<100;i++){ try { await fetch(base+'/robots.txt');ready=true;break; } catch {} await new Promise(r=>setTimeout(r,100)); }
 if(!ready)throw new Error('Server failed to start');
 const testEnv={...process.env,BASE_URL:base,MALAYA_FIXTURE_FILE:fixture,E2E_ISOLATED:'1'};delete testEnv.NODE_OPTIONS;
 await run(['scripts/cache-test/runtime.mjs'],testEnv,'runtime.json');
 await run(['scripts/cache-test/browser.mjs'],testEnv,'browser.json');
 await run(['scripts/cache-test/diagnostic.mjs'],testEnv,'diagnostic.json');
 await run(['node_modules/@playwright/test/cli.js','test','cart.spec.js','seo.spec.js','--workers=2'],testEnv,'playwright.log');
 console.log(`PASS: cold/warm routes, targeted invalidation, publication/rename, and desktop/mobile cart. Evidence: ${output}`);
} finally {server.kill('SIGTERM');}
