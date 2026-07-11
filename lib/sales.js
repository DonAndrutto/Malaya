'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Sales persistence — orders, clients and the sales settings, mirroring the
// override layer's pattern (lib/overrides.js): Firestore is canonical with a
// localStorage cache for an instant paint, and a localStorage-only fallback so
// a bare checkout without Firebase still works in development.
//
// Firestore collections (all admin-only — orders and clients hold customer
// PII, so unlike catalogueOverrides nothing here is publicly readable; see
// firebase/firestore.rules):
//   orders/{orderId}    — one document per order (lib/data/sales.js shape)
//   clients/{clientId}  — the reusable client database
//   salesMeta/counters  — yearly order-number sequences { seq: { "2026": 42 } }
//   salesMeta/settings  — desk configuration { deductOn: 'off'|'paid'|'shipped' }
//
// A future Stripe webhook (server-side, Admin SDK) writes the same orders
// collection; this module only ever *reads* orders it didn't create, so
// integration requires no changes here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection, doc, setDoc, deleteDoc, onSnapshot, runTransaction,
} from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';
import {
  normalizeOrder, normalizeClient, newSalesId,
  formatOrderNumber, nextOrderNumberFromList,
} from './data/sales';

const ORDERS_KEY = 'malaya:sales:orders:v1';
const CLIENTS_KEY = 'malaya:sales:clients:v1';
const SETTINGS_KEY = 'malaya:sales:settings:v1';

export const SALES_SETTINGS_DEFAULTS = { deductOn: 'paid' };

function readLocal(key) {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
function writeLocal(key, obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
}

const logWriteError = (what) => (err) => {
  console.error(`[malaya] Failed to save ${what} to Firestore:`, err && err.code ? err.code : err);
};

// In-tab listeners so this tab's own writes re-emit immediately, in every
// mode. The desk opens editors for records it just created ("+ New order" →
// its drawer, "+ New client" → its form), so a write must be visible to the
// subscription the moment it lands in the local cache — never gated on the
// Firestore snapshot round-trip, which can be slow or never confirm at all
// (e.g. a write rejected by stale deployed rules). Snapshots still supersede
// whenever they arrive; the browser's `storage` event covers *other* tabs.
let salesListeners = [];
function currentLocal() {
  return {
    orders: readLocal(ORDERS_KEY),
    clients: readLocal(CLIENTS_KEY),
    settings: { ...SALES_SETTINGS_DEFAULTS, ...readLocal(SETTINGS_KEY) },
  };
}
function emitLocal() {
  const data = currentLocal();
  salesListeners.forEach((f) => f(data));
}

export function newOrderId() { return newSalesId('o'); }
export function newClientId() { return newSalesId('k'); }

// ── Writes ───────────────────────────────────────────────────────────────────
function saveDoc(colName, cacheKey, id, data, what) {
  const cache = readLocal(cacheKey);
  cache[id] = data;
  writeLocal(cacheKey, cache);
  emitLocal();
  if (FIREBASE_ENABLED && typeof window !== 'undefined') {
    const { db } = getFirebase();
    if (db) setDoc(doc(db, colName, id), { ...data, _updated: Date.now() }).catch(logWriteError(what));
  }
}
function removeDoc(colName, cacheKey, id, what) {
  const cache = readLocal(cacheKey);
  delete cache[id];
  writeLocal(cacheKey, cache);
  emitLocal();
  if (FIREBASE_ENABLED && typeof window !== 'undefined') {
    const { db } = getFirebase();
    if (db) deleteDoc(doc(db, colName, id)).catch(logWriteError(what));
  }
}

export function saveOrder(order) {
  const { id, ...data } = order;
  saveDoc('orders', ORDERS_KEY, id, data, `order "${order.number || id}"`);
}
export function deleteOrder(id) { removeDoc('orders', ORDERS_KEY, id, `order "${id}"`); }

export function saveClient(client) {
  const { id, ...data } = client;
  saveDoc('clients', CLIENTS_KEY, id, data, `client "${client.name || id}"`);
}
export function deleteClient(id) { removeDoc('clients', CLIENTS_KEY, id, `client "${id}"`); }

export function saveSalesSettings(patch) {
  const next = { ...SALES_SETTINGS_DEFAULTS, ...readLocal(SETTINGS_KEY), ...patch };
  writeLocal(SETTINGS_KEY, next);
  emitLocal();
  if (FIREBASE_ENABLED && typeof window !== 'undefined') {
    const { db } = getFirebase();
    if (db) setDoc(doc(db, 'salesMeta', 'settings'), { ...next, _updated: Date.now() }).catch(logWriteError('sales settings'));
  }
}

// ── Order-number allocation ──────────────────────────────────────────────────
// MJ-<year>-<seq>, one shared yearly sequence. With Firebase the counter doc is
// bumped in a transaction (safe even if a second device/integration allocates
// at the same moment); without it — or if the transaction can't run — fall back
// to deriving the next free number from the orders already loaded.
export async function allocateOrderNumber(loadedOrders = []) {
  const now = new Date();
  const year = String(now.getFullYear());
  if (FIREBASE_ENABLED && typeof window !== 'undefined') {
    const { db } = getFirebase();
    if (db) {
      try {
        return await runTransaction(db, async (tx) => {
          const ref = doc(db, 'salesMeta', 'counters');
          const snap = await tx.get(ref);
          const seqs = (snap.exists() && snap.data().seq) || {};
          const next = (Number(seqs[year]) || 0) + 1;
          tx.set(ref, { seq: { ...seqs, [year]: next }, _updated: Date.now() });
          return formatOrderNumber(year, next);
        });
      } catch (err) {
        logWriteError('order counter')(err);
      }
    }
  }
  return nextOrderNumberFromList(loadedOrders, now);
}

// ── Subscription ─────────────────────────────────────────────────────────────
// Emits { orders, clients, settings } — orders/clients as id-keyed maps of
// normalised records. Requires an admin sign-in when Firebase is enabled (the
// collections are admin-only); the Sales tab lives behind the admin login, so
// that always holds.
export function subscribeSales(cb) {
  if (typeof window === 'undefined') return () => {};

  const normalize = ({ orders, clients, settings }) => {
    const o = {}; Object.keys(orders || {}).forEach((id) => { o[id] = normalizeOrder(orders[id], id); });
    const c = {}; Object.keys(clients || {}).forEach((id) => { c[id] = normalizeClient(clients[id], id); });
    return { orders: o, clients: c, settings: { ...SALES_SETTINGS_DEFAULTS, ...(settings || {}) } };
  };

  cb(normalize(currentLocal())); // instant paint from the cache

  // This tab's own writes (saveDoc/removeDoc → emitLocal) re-emit in every
  // mode, so a freshly created order/client is in the caller's state before
  // its editor is asked to open — even while the Firestore echo is in flight.
  const onLocal = (data) => cb(normalize(data));
  salesListeners.push(onLocal);
  const dropLocal = () => { salesListeners = salesListeners.filter((x) => x !== onLocal); };

  if (FIREBASE_ENABLED) {
    const { db } = getFirebase();
    if (db) {
      let orders = null;
      let clients = null;
      let settings = null;
      const emit = () => {
        if (orders === null && clients === null) return; // nothing live yet
        const data = {
          orders: orders || readLocal(ORDERS_KEY),
          clients: clients || readLocal(CLIENTS_KEY),
          settings: settings || readLocal(SETTINGS_KEY),
        };
        if (orders) writeLocal(ORDERS_KEY, orders);
        if (clients) writeLocal(CLIENTS_KEY, clients);
        if (settings) writeLocal(SETTINGS_KEY, settings);
        cb(normalize(data));
      };
      const mapSnap = (snap) => {
        const map = {};
        snap.forEach((d) => { const { _updated, ...rest } = d.data(); map[d.id] = rest; });
        return map;
      };
      const unsubs = [
        onSnapshot(collection(db, 'orders'), (snap) => { orders = mapSnap(snap); emit(); }, () => {}),
        onSnapshot(collection(db, 'clients'), (snap) => { clients = mapSnap(snap); emit(); }, () => {}),
        onSnapshot(doc(db, 'salesMeta', 'settings'), (snap) => {
          const { _updated, ...rest } = snap.exists() ? snap.data() : {};
          settings = rest;
          emit();
        }, () => {}),
      ];
      return () => { dropLocal(); unsubs.forEach((u) => u()); };
    }
  }

  const onStorage = (e) => {
    if ([ORDERS_KEY, CLIENTS_KEY, SETTINGS_KEY].includes(e.key)) cb(normalize(currentLocal()));
  };
  window.addEventListener('storage', onStorage);
  return () => {
    dropLocal();
    window.removeEventListener('storage', onStorage);
  };
}
