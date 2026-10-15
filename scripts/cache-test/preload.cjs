// Test-process-only network adapter. Never imported by the application.
// NODE_OPTIONS loads this into next build/start (including build workers).
const fs = require('node:fs');
if (!process.env.MALAYA_FIXTURE_FILE) throw new Error('MALAYA_FIXTURE_FILE required');
const originalFetch = global.fetch;
const encode = (v) => v == null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,x]) => [k,encode(x)])) } };
const document = (collection,id,data) => ({ name: `projects/isolated/databases/(default)/documents/${collection}/${id}`, fields: encode(data).mapValue.fields });
global.fetch = async (input, options = {}) => {
  const url = typeof input === 'string' ? input : input.url || String(input);
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return originalFetch(input,options);
  const data = JSON.parse(fs.readFileSync(process.env.MALAYA_FIXTURE_FILE, 'utf8'));
  if (process.env.MALAYA_FIXTURE_LOG) fs.appendFileSync(process.env.MALAYA_FIXTURE_LOG, JSON.stringify({ url, method: options.method || 'GET' })+'\n');
  if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
    const token = JSON.parse(options.body || '{}').idToken;
    return Response.json(token === 'isolated-admin' ? { users: [{ localId: 'test-admin', customAttributes: '{"admin":true}' }] } : {}, { status: token === 'isolated-admin' ? 200 : 401 });
  }
  if (!url.startsWith('https://firestore.googleapis.com/')) throw new Error(`External network disabled in cache tests: ${url}`);
  if (url.endsWith('documents:runQuery')) {
    const query = JSON.parse(options.body).structuredQuery;
    const collection = query.from[0].collectionId;
    const mask = query.select?.fields.map((f) => f.fieldPath);
    const docs = Object.entries(data[collection] || {}).filter(([,v]) => v.published === true).map(([id,v]) => {
      const projected = mask ? Object.fromEntries(Object.entries(v).filter(([k]) => mask.includes(k))) : v;
      return { document: document(collection,id,projected) };
    });
    return Response.json(docs);
  }
  const path = decodeURIComponent(new URL(url).pathname.split('/documents/')[1] || '');
  const [collection,id] = path.split('/');
  if (!id) return Response.json({ documents: Object.entries(data[collection] || {}).map(([key,v]) => document(collection,key,v)) });
  const value = data[collection]?.[id];
  return value ? Response.json(document(collection,id,value)) : Response.json({}, { status: 404 });
};
