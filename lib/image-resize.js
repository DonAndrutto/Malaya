'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side image downscaling/compression. Admin uploads (site images and
// product photos) are run through resizeImageFile() before going to Firebase
// Storage so large originals don't bloat storage or slow the live site.
//
// Opaque photos are encoded as JPEG (longest side ≤ maxDim, byte size ≤ maxBytes
// — best effort: we lower quality, then dimensions, until we get under the budget
// or hit a sensible floor). Images that carry an alpha channel (PNG/WebP — e.g. a
// transparent header logo or Tashi badge) keep their original format so the
// transparency is preserved instead of being flattened onto a white background.
// Animated/vector formats (GIF, SVG) and anything we can't decode are returned
// unchanged so uploads never break.
// ─────────────────────────────────────────────────────────────────────────────

const PASSTHROUGH = /image\/(svg\+xml|gif)/i;
// Formats with an alpha channel: encode back to the same format to keep transparency.
const ALPHA = /image\/(png|webp)/i;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), type, quality);
    else resolve(null);
  });
}

async function loadBitmap(file) {
  // Prefer createImageBitmap (fast, no DOM); fall back to an <img> element.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch {}
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Resize/compress `file` with longest side ≤ maxDim. Opaque images become a JPEG
// ≤ maxBytes; transparent PNG/WebP keep their format (and a roomier budget, since
// they can't be quality-compressed) so the alpha channel survives.
// Returns a File; on any failure (or passthrough type) returns the original.
//
// The stored file is served to visitors as-is (the image optimizer is
// disabled — see IMAGES.md), so the byte budget here IS the delivered payload:
// it balances photographic quality against every viewer's download size.
export async function resizeImageFile(file, { maxBytes, maxDim = 2048 } = {}) {
  if (typeof window === 'undefined' || !file || PASSTHROUGH.test(file.type || '')) return file;
  const isAlpha = ALPHA.test(file.type || '');
  // Transparent images can't trade quality for size, so allow a larger budget and
  // rely on dimension shrinking alone; opaque photos get a generous master budget.
  const budget = maxBytes || (isAlpha ? 600 * 1024 : 400 * 1024);
  const outType = isAlpha ? file.type : 'image/jpeg';
  const qualities = isAlpha ? [undefined] : [0.9, 0.85, 0.8, 0.7, 0.6];
  try {
    const bitmap = await loadBitmap(file);
    const baseW = bitmap.width || bitmap.naturalWidth;
    const baseH = bitmap.height || bitmap.naturalHeight;
    if (!baseW || !baseH) return file;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Start from a dimension cap, then progressively shrink the canvas (and, for
    // opaque images, lower JPEG quality) until the encoded blob fits the budget.
    let scale = Math.min(1, maxDim / Math.max(baseW, baseH));
    let best = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(baseW * scale));
      const h = Math.max(1, Math.round(baseH * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h); // transparent canvas — alpha is preserved for PNG/WebP
      ctx.drawImage(bitmap, 0, 0, w, h);

      let blob = null;
      for (const q of qualities) {
        blob = await canvasToBlob(canvas, outType, q);
        if (!blob) break;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= budget) break;
      }
      if (best && best.size <= budget) break;
      scale *= 0.75; // still too big — shrink the canvas and try again
      if (Math.max(w, h) <= 320) break; // don't go absurdly small
    }

    if (typeof bitmap.close === 'function') bitmap.close();
    if (!best) return file;
    // If we somehow made it bigger (already-optimised original), keep the original
    // — this also keeps a small transparent PNG byte-for-byte intact.
    if (best.size >= (file.size || Infinity)) return file;

    const ext = isAlpha ? (/webp/i.test(outType) ? '.webp' : '.png') : '.jpg';
    const name = (file.name || 'image').replace(/\.[^.]+$/, '') + ext;
    return new File([best], name, { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  }
}
