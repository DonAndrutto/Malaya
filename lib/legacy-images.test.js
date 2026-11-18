import { localizeImageData, localizeImageUrls } from './legacy-images';

const origin = 'https://malaya' + 'jewelrybhutan.com';
const oldProduct = origin + '/products/637165565495800866M.jpg';
const product = '/images/legacy/637165565495800866M.jpg';
const oldTile = origin + '/images/pages/637029624591127589C.jpg';
const tile = '/images/legacy/637029624591127589C.jpg';

test('localizes product galleries and URL-keyed focal points before hydration', () => {
  const input = {
    name: 'Double Dorje Stud Earring',
    img: oldProduct,
    images: [oldProduct, '/images/site/uploaded.jpg'],
    imgPos: { [oldTile]: '62% 60%', '/images/site/uploaded.jpg': 'center' },
  };
  const localized = localizeImageData(input);
  expect(localized).toEqual({
    ...input,
    img: product,
    images: [product, '/images/site/uploaded.jpg'],
    imgPos: { [tile]: '62% 60%', '/images/site/uploaded.jpg': 'center' },
  });
  expect(localizeImageData(localized)).toEqual(localized);
  expect(input.img).toBe(oldProduct);
});

test('preserves a focal point already saved under the local path', () => {
  expect(localizeImageData({ [oldTile]: '62% 60%', [tile]: 'center' })).toEqual({ [tile]: 'center' });
});

test('localizes image URLs in Markdown and keeps unrelated links intact', () => {
  expect(localizeImageUrls(`![Earrings](${oldProduct}?size=large) [About](/about)`))
    .toBe(`![Earrings](${product}) [About](/about)`);
  const other = 'https://example.org/products/637165565495800866M.jpg';
  expect(localizeImageUrls(other)).toBe(other);
});
