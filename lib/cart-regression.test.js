import { buildSiteData } from './data/site-data';
import { migrateCartAliases, cartTotal, removeFromCart, addToCart } from '@/components/store/site/store';
const key = 'malaya-site-cart-v1';
let data;
beforeEach(() => { data={}; global.window={}; global.localStorage={getItem:(k)=>data[k]||null,setItem:(k,v)=>{data[k]=v;}}; });
afterEach(() => { delete global.window; delete global.localStorage; });
const read = () => JSON.parse(data[key]);
test('alias migration merges quantities per ring size and preserves unavailable lines', () => {
  const { ALIASES, SITE_BY_ID } = buildSiteData({p010:{mergedInto:'p009'},p009:{name:'Cart Ring',listPrice:120}});
  data[key]=JSON.stringify([{id:'p010',qty:1,size:54},{id:'p009',qty:2,size:54},{id:'p009',qty:1,size:56},{id:'missing',qty:1}]);
  migrateCartAliases(ALIASES);
  expect(read()).toEqual([{id:'p009',qty:3,size:54},{id:'p009',qty:1,size:56},{id:'missing',qty:1}]);
  expect(cartTotal(read(),SITE_BY_ID)).toBe(480);
  removeFromCart('missing');
  expect(read()).toHaveLength(2);
  addToCart('p009',1,56);
  expect(read()[1]).toEqual({id:'p009',qty:2,size:56});
});
