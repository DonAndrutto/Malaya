'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Client runtime for the storefront: localStorage cart, toast, and the context
// that hands the resolved site data (catalogue + extras + site image settings)
// to every page. Routing is handled by the Next.js App Router.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState } from 'react';

// ── Cart store (localStorage-backed) ─────────────────────────────────────────
const CART_KEY = 'malaya-site-cart-v1';

function readCart() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}

let cartListeners = [];
function writeCart(items) {
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch {}
  }
  cartListeners.forEach((f) => f(items));
}

export function useCart() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setItems(readCart());
    const f = (it) => setItems(it.slice());
    cartListeners.push(f);
    const onStorage = (e) => { if (e.key === CART_KEY) setItems(readCart()); };
    window.addEventListener('storage', onStorage);
    return () => {
      cartListeners = cartListeners.filter((x) => x !== f);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return items;
}

export function addToCart(id, qty = 1) {
  const items = readCart();
  const ex = items.find((i) => i.id === id);
  if (ex) ex.qty += qty; else items.push({ id, qty });
  writeCart(items);
  showToast('Added to your order');
}

export function setCartQty(id, qty) {
  let items = readCart();
  items = qty <= 0 ? items.filter((i) => i.id !== id) : items.map((i) => (i.id === id ? { ...i, qty } : i));
  writeCart(items);
}

export function removeFromCart(id) {
  writeCart(readCart().filter((i) => i.id !== id));
}

export function cartTotal(items, byId) {
  return items.reduce((s, i) => s + ((byId[i.id] || {}).price || 0) * i.qty, 0);
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
export function showToast(msg) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('site-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'site-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Site data context ────────────────────────────────────────────────────────
// { SITE_PRODUCTS, SITE_BY_ID, TASHI_PRODUCTS, HOME_BEST, MEGA_FEATURED, settings }
export const SiteDataContext = createContext(null);
export function useSiteData() {
  return useContext(SiteDataContext) || {
    SITE_PRODUCTS: [], SITE_BY_ID: {}, TASHI_PRODUCTS: [], HOME_BEST: [], MEGA_FEATURED: [], settings: {},
  };
}
