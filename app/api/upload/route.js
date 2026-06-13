// POST /api/upload — image upload stub.
// TODO: wire to Vercel Blob (or S3) for persistent storage.
// Usage: multipart/form-data with field "file" + "productId".
export async function POST(request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: 'No form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const productId = formData.get('productId') || 'unknown';

  if (!file || typeof file === 'string') {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  // Stub response — replace this block with Vercel Blob upload:
  // const blob = await put(`products/${productId}/${file.name}`, file, { access: 'public' });
  // return Response.json({ url: blob.url });

  return Response.json({
    ok: true,
    url: null,
    message: 'Image upload backend not yet configured. Connect Vercel Blob or S3 in app/api/upload/route.js.',
    productId,
    filename: file.name,
    size: file.size,
  });
}
