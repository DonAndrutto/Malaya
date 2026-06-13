// GET  /api/overrides — read the shared catalogue overrides (price/stock/name edits).
// POST /api/overrides — replace the shared overrides with the studio's latest edits.
//
// Persistence is handled by lib/server/overridesStore.js (Vercel KV / Upstash Redis,
// with an in-memory fallback when no store is configured).

import { readOverrides, writeOverrides, persistence } from '@/lib/server/overridesStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const overrides = await readOverrides();
    return Response.json({ overrides, persistence });
  } catch (err) {
    return Response.json({ overrides: {}, persistence, error: String(err) }, { status: 200 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { overrides } = body;

  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return Response.json({ error: 'Invalid overrides payload' }, { status: 400 });
  }

  try {
    await writeOverrides(overrides);
    return Response.json({ ok: true, saved: Object.keys(overrides).length, persistence });
  } catch (err) {
    return Response.json({ error: 'Failed to persist overrides', detail: String(err) }, { status: 500 });
  }
}
