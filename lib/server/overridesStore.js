// Server-side persistence for catalogue overrides, shared across all visitors.
//
// Uses the Vercel KV / Upstash Redis REST API over plain fetch — no SDK dependency.
// Connect a KV store in the Vercel dashboard (Storage → KV / Upstash Redis) and the
// integration injects the env vars below automatically; no code change needed.
//
// Without a configured store it falls back to a module-level cache so the app still
// runs locally. That cache is per-instance and NOT shared across serverless
// invocations, so configure KV in production for edits to reach every visitor.

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'malaya:overrides:v1';

export const persistence = REST_URL && REST_TOKEN ? 'kv' : 'memory';

let memory = {};

async function command(cmd) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`KV ${cmd[0]} failed: ${res.status}`);
  return res.json();
}

export async function readOverrides() {
  if (persistence !== 'kv') return memory;
  const { result } = await command(['GET', KEY]);
  if (!result) return {};
  return typeof result === 'string' ? JSON.parse(result) : result;
}

export async function writeOverrides(overrides) {
  if (persistence !== 'kv') { memory = overrides; return; }
  await command(['SET', KEY, JSON.stringify(overrides)]);
}
