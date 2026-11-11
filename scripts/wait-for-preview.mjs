import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// Only read deployment records. Never authenticate to the preview or Firebase.
const { GITHUB_API_URL = 'https://api.github.com', GITHUB_REPOSITORY,
  GITHUB_TOKEN, GITHUB_OUTPUT, PREVIEW_SHA } = process.env;
if (!GITHUB_REPOSITORY || !GITHUB_OUTPUT || !PREVIEW_SHA) {
  throw new Error('Missing repository, output path or preview commit SHA');
}
const api = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}`;
async function get(path) {
  const response = await fetch(`${api}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub deployment lookup failed: ${response.status}`);
  return response.json();
}

const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  const deployments = await get(`/deployments?sha=${encodeURIComponent(PREVIEW_SHA)}&per_page=30`);
  for (const deployment of deployments) {
    if (deployment.sha !== PREVIEW_SHA || deployment.production_environment ||
        !/preview/i.test(deployment.environment)) continue;
    const [status] = await get(`/deployments/${deployment.id}/statuses?per_page=1`);
    if (status?.state !== 'success' || !status.environment_url) continue;
    const url = new URL(status.environment_url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) {
      throw new Error('Expected an HTTPS Vercel preview URL');
    }
    appendFileSync(GITHUB_OUTPUT, `url=${url.origin}\n`);
    console.log(`Testing preview for ${PREVIEW_SHA}: ${url.origin}`);
    process.exit(0);
  }
  console.log(`Waiting for Vercel preview of ${PREVIEW_SHA}`);
  await delay(15_000);
}
throw new Error(`No successful Vercel preview found for ${PREVIEW_SHA} within 10 minutes`);
