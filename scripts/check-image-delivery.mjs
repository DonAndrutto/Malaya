// Real image delivery on desktop/mobile. Default uses ordinary system DNS.
// --public-dns is an explicit diagnostic comparison, not a production fix.
import { spawn } from 'node:child_process';
const env = { ...process.env, E2E_ISOLATED: '0', E2E_ALLOW_WRITES: '0', E2E_ADMIN_EMAIL: '', E2E_ADMIN_PASSWORD: '' };
if (!env.BASE_URL) throw new Error('Set BASE_URL to the preview or production URL for read-only image checks.');
if (process.argv.includes('--public-dns')) {
  const res = await fetch('https://dns.google/resolve?name=firebasestorage.googleapis.com&type=A');
  if (!res.ok) throw new Error(`Public DNS query failed: ${res.status}`);
  const answer = await res.json();
  const address = answer.Answer?.find((record) => record.type === 1)?.data;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address || '')) throw new Error('No IPv4 answer from public DNS');
  env.PLAYWRIGHT_HOST_RESOLVER_RULES = `MAP firebasestorage.googleapis.com ${address}`;
  console.log(`Diagnostic browser-only DNS mapping: firebasestorage.googleapis.com → ${address}. OS DNS unchanged.`);
}
const args = ['node_modules/@playwright/test/cli.js', 'test', 'images.spec.js', '--workers=2', ...process.argv.slice(2).filter((arg) => arg !== '--public-dns')];
const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
