// POST /api/auth — accepts any credentials for now.
// TODO: replace with real credential check + JWT / NextAuth session.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const username = (body.username || '').trim() || 'studio';

  // Stub: accept any credentials. Wire real auth here (bcrypt, DB lookup, etc.).
  return Response.json({ ok: true, user: username });
}
