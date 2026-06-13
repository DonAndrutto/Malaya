// GET /api/overrides — fetch saved overrides (future: read from DB).
// POST /api/overrides — save overrides (future: write to DB).
// Currently the client uses localStorage; these routes are the migration path.

export async function GET() {
  // TODO: read from database (e.g. Vercel KV, Postgres, PlanetScale).
  return Response.json({ overrides: {} });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { overrides } = body;

  if (!overrides || typeof overrides !== 'object') {
    return Response.json({ error: 'Invalid overrides payload' }, { status: 400 });
  }

  // TODO: persist overrides to a real store so they survive across sessions / devices.
  return Response.json({ ok: true, saved: Object.keys(overrides).length });
}
