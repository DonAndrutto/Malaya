import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { localizeImageUrls } from '../lib/legacy-images.js';

type Fields = Record<string, FirestoreValue>;
type FirestoreValue = {
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Fields };
  [otherType: string]: unknown;
};
type Document = { name: string; fields?: Fields; updateTime: string };
type FieldPath = (string | number)[];
type Change = { path: FieldPath; kind: 'key' | 'value'; oldValue: string; newValue: string };

const PUBLIC_COLLECTIONS = ['catalogueOverrides', 'siteSettings'];
const EDITORIAL_COLLECTIONS = ['blogPosts', 'exploreGroups', 'exploreTopics'];
const LEGACY_COLLECTIONS = ['content', 'settings', 'pages', 'products'];
const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'malaya-catalogue';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function rewriteValue(value: FirestoreValue, path: FieldPath, changes: Change[]): FirestoreValue {
  if (value.stringValue !== undefined) {
    const newValue = localizeImageUrls(value.stringValue);
    if (newValue === value.stringValue) return value;
    changes.push({ path, kind: 'value', oldValue: value.stringValue, newValue });
    return { stringValue: newValue };
  }
  const start = changes.length;
  if (value.arrayValue?.values) {
    const values = value.arrayValue.values.map((child, index) => rewriteValue(child, [...path, index], changes));
    if (changes.length > start) return { arrayValue: { values } };
  }
  if (value.mapValue?.fields) {
    const fields = rewriteFields(value.mapValue.fields, path, changes);
    if (changes.length > start) return { mapValue: { fields } };
  }
  return value;
}

function rewriteFields(fields: Fields, path: FieldPath, changes: Change[]): Fields {
  const entries: [string, FirestoreValue][] = [];
  for (const key of Object.keys(fields).sort()) {
    const localKey = localizeImageUrls(key);
    if (key !== localKey) {
      changes.push({ path, kind: 'key', oldValue: key, newValue: localKey });
      // Keep any focal point already saved under the new image URL.
      if (Object.hasOwn(fields, localKey)) continue;
    }
    entries.push([localKey, rewriteValue(fields[key], [...path, localKey], changes)]);
  }
  return Object.fromEntries(entries);
}

function displayPath(path: FieldPath) {
  return path.reduce<string>((label, part) => {
    if (typeof part === 'number') return `${label}[${part}]`;
    if (/^[a-zA-Z_]\w*$/.test(part)) return label ? `${label}.${part}` : part;
    return `${label}[${JSON.stringify(part)}]`;
  }, '');
}

function maskedField(key: string) {
  return /^[a-zA-Z_]\w*$/.test(key) ? key : '`' + key.replace(/[\\`]/g, '\\$&') + '`';
}

async function accessToken() {
  const { applicationDefault, cert } = await import('firebase-admin/app');
  const account = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credential = account
    ? cert(JSON.parse(account.trimStart().startsWith('{') ? account : await readFile(account, 'utf8')))
    : applicationDefault();
  return (await credential.getAccessToken()).access_token;
}

async function main() {
  const { values: flags } = parseArgs({
    options: {
      'dry-run': { type: 'boolean' },
      apply: { type: 'boolean' },
      authenticated: { type: 'boolean' },
    },
  });
  if (flags.apply && flags['dry-run']) throw new Error('Choose either --dry-run or --apply.');
  const authenticated = flags.apply || flags.authenticated;
  const token = authenticated ? await accessToken() : undefined;

  async function request<T>(url: string | URL, body?: object): Promise<T> {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Firestore HTTP ${response.status} for ${url}`);
    return response.json() as Promise<T>;
  }

  async function list(collection: string) {
    const docs: Document[] = [];
    const url = new URL(`${BASE}/${collection}?pageSize=300`);
    let pageToken: string | undefined;
    do {
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await request<{ documents?: Document[]; nextPageToken?: string }>(url);
      docs.push(...(page.documents || []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return docs;
  }

  async function listPublished(collectionId: string) {
    const rows = await request<{ document?: Document }[]>(`${BASE}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } },
      },
    });
    return rows.flatMap(({ document }) => document ? [document] : []);
  }

  console.log(`${flags.apply ? 'Apply' : 'Dry run'} · ${PROJECT}/(default) · ${authenticated ? 'authenticated content' : 'public storefront content'}`);
  const collections = authenticated
    ? [...PUBLIC_COLLECTIONS, ...EDITORIAL_COLLECTIONS, ...LEGACY_COLLECTIONS].map(list)
    : [...PUBLIC_COLLECTIONS.map(list), ...EDITORIAL_COLLECTIONS.map(listPublished)];
  const docs = (await Promise.all(collections)).flat().sort((a, b) => a.name.localeCompare(b.name));
  let changeCount = 0;
  const writes = docs.flatMap((doc) => {
    const changes: Change[] = [];
    const before = doc.fields || {};
    const after = rewriteFields(before, [], changes);
    if (!changes.length) return [];

    const docPath = doc.name.split('/documents/')[1];
    for (const { path, kind, oldValue, newValue } of changes) {
      const field = displayPath(path) || '(document)';
      console.log(`${docPath}  ${field}${kind === 'key' ? ' key' : ''}  ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`);
    }
    changeCount += changes.length;

    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => before[key] !== after[key]);
    return [{
      update: { name: doc.name, fields: Object.fromEntries(keys.filter((key) => Object.hasOwn(after, key)).map((key) => [key, after[key]])) },
      updateMask: { fieldPaths: keys.map(maskedField) },
      currentDocument: { updateTime: doc.updateTime },
    }];
  });

  console.log(`Scanned ${docs.length} documents. ${changeCount} references in ${writes.length} documents.`);
  if (!flags.apply || !writes.length) {
    console.log('No writes sent.');
    return;
  }
  if (writes.length > 500) throw new Error('The migration exceeds the limit for one atomic Firestore commit.');
  await request(`${BASE}:commit`, { writes });
  console.log(`Updated ${writes.length} documents.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
