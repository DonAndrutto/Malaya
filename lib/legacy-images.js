const localImages = new Map([
  ['/images/home/home6/malaya-jewelry-a.jpg', '/images/legacy/malaya-jewelry-a.jpg'],
  ['/images/home/home6/malaya-jewelry-c.jpg', '/images/legacy/malaya-jewelry-c.jpg'],
  ['/images/home/home6/malaya-jewelry-d.jpg', '/images/legacy/malaya-jewelry-d.jpg'],
  ['/images/pages/637029624591127589C.jpg', '/images/legacy/637029624591127589C.jpg'],
  ['/products/637165565495800866M.jpg', '/images/legacy/637165565495800866M.jpg'],
]);

const legacyHost = 'malaya' + 'jewelrybhutan.com';
const legacyUrl = new RegExp(
  String.raw`\bhttps?://(?:www\.)?${legacyHost.replace('.', '\\.')}(/[^?#\s"'<>()[\]{}\\]+)(?:[?#][^\s"'<>()[\]{}\\]*)?`,
  'gi',
);

export function legacyImagePath(sourcePath) {
  return localImages.get(sourcePath);
}

export function localizeImageUrls(text) {
  return text.replace(legacyUrl, (url, pathname) => legacyImagePath(pathname) || url);
}

// Storefront reads can still see old URLs in Firestore or the Next.js cache.
// Image URLs can also be map keys in siteSettings/images.imgPos.
export function localizeImageData(value) {
  if (typeof value === 'string') return localizeImageUrls(value);
  if (Array.isArray(value)) return value.map(localizeImageData);
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;

  const entries = [];
  for (const [key, child] of Object.entries(value)) {
    const localKey = localizeImageUrls(key);
    if (localKey !== key && Object.hasOwn(value, localKey)) continue;
    entries.push([localKey, localizeImageData(child)]);
  }
  return Object.fromEntries(entries);
}
