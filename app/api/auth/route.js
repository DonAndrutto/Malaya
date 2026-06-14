// POST /api/auth — legacy stub. The admin now signs in client-side with
// Firebase Auth (email/password); see lib/auth.js. Kept as a harmless no-op so
// any old clients still get a 200.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const username = (body.username || '').trim() || 'studio';
  return Response.json({ ok: true, user: username });
}
