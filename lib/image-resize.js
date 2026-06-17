'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side image downscaling/compression. Admin uploads (site images and
// product photos) are run through resizeImageFile() before going to Firebase
// Storage so large originals don't bloat storage or slow the live site.
//
// The result is a JPEG File whose longest side is ≤ maxDim and whose byte size
// is ≤ maxBytes (best effort — we lower quality, then dimensions, until we get
// under the budget or hit a sensible floor). Animated/vector formats (GIF, SVG)
// and anything we can't decode are returned unchanged so uploads never break.
// ─────────────────────────────────────────────────────────────────────────────

const PASSTHROUGH = /image\/(svg\+xml|gif)/i;

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
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

// Resize/compress `file` to a JPEG ≤ maxBytes with longest side ≤ maxDim.
// Returns a File; on any failure (or passthrough type) returns the original.
export async function resizeImageFile(file, { maxBytes = 100 * 1024, maxDim = 1600 } = {}) {
  if (typeof window === 'undefined' || !file || PASSTHROUGH.test(file.type || '')) return file;
  try {
    const bitmap = await loadBitmap(file);
    const baseW = bitmap.width || bitmap.naturalWidth;
    const baseH = bitmap.height || bitmap.naturalHeight;
    if (!baseW || !baseH) return file;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Start from a dimension cap, then progressively shrink the canvas and
    // lower JPEG quality until the encoded blob fits the byte budget.
    let scale = Math.min(1, maxDim / Math.max(baseW, baseH));
    let best = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(baseW * scale));
      const h = Math.max(1, Math.round(baseH * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);

      let blob = null;
      for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
        blob = await canvasToBlob(canvas, q);
        if (!blob) break;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= maxBytes) break;
      }
      if (best && best.size <= maxBytes) break;
      scale *= 0.75; // still too big — shrink the canvas and try again
      if (Math.max(w, h) <= 320) break; // don't go absurdly small
    }

    if (typeof bitmap.close === 'function') bitmap.close();
    if (!best) return file;
    // If we somehow made it bigger (tiny original), keep the original.
    if (best.size >= (file.size || Infinity)) return file;

    const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([best], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
