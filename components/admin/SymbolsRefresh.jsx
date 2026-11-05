'use client';

import { useState } from 'react';
import { T, ghostBtn } from './theme';

export default function SymbolsRefresh() {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  async function review() {
    setBusy(true); setError(''); setPlan(null);
    try { const api = await import('@/lib/content/symbols-admin'); setPlan(await api.prepareSymbolsRefresh()); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError('');
    try { const api = await import('@/lib/content/symbols-admin'); await api.refreshSymbolsStorefront(); setRefreshed(true); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setError('');
    try {
      const api = await import('@/lib/content/symbols-admin');
      const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `malaya-symbols-before-${Date.now()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      await api.applySymbolsRefresh(plan); setSaved(true);
      await api.refreshSymbolsStorefront(); setRefreshed(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section style={{ marginTop: 20, border: `1px solid ${T.line}`, padding: 18, background: T.panel }}>
    <h3 style={{ margin: '0 0 8px', fontFamily: T.serif, fontSize: 21 }}>Ten Explore symbol sections</h3>
    <p style={{ fontSize: 13, color: T.muted }}>Review the live catalogue, captions, uncertain matches and exact changes together. Stock sets the opening selection automatically.</p>
    {!saved && <button type="button" disabled={busy} onClick={review} style={ghostBtn()}>{busy ? 'Working…' : 'Review fresh symbol changes'}</button>}
    {plan && <div style={{ marginTop: 14, fontSize: 13 }}>
      <p>{plan.scanned} live listings scanned · {plan.changes.length} records to update. Product descriptions, prices, photographs and Vajra content are preserved.</p>
      {plan.shelves.map((s) => <details key={s.slug} style={{ marginBottom: 12 }}>
        <summary>{s.title}: {s.count} eligible · {s.inStock} in stock · {s.gaps.length} review notes</summary>
        <a href={`/explore/topic/${s.slug}`} target="_blank" rel="noreferrer">View section ↗</a>
        {s.gaps.length > 0 && <ul>{s.gaps.map((g, i) => <li key={`${g.id}-${i}`}>{g.id}: {g.reason}</li>)}</ul>}
        <div style={{ overflowX: 'auto' }}><table><thead><tr>{['Current title', 'SKU', 'Details', 'Evidence', 'Caption'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{s.pieces.map((p) => <tr key={p.id}><td><a href={p.url}>{p.title}</a></td><td>{p.sku || 'Not stated'}</td><td>{p.details || 'Not stated'}</td><td>{p.evidence.map((e) => `${e.field}: ${e.text}`).join(' · ')}</td><td>{p.caption}</td></tr>)}</tbody>
        </table></div>
      </details>)}
      <details><summary>Exact before and after fields</summary><pre style={{ overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(plan.changes.map(({ path, before, patch }) => ({ path, before: Object.fromEntries(Object.keys(patch).map((k) => [k, before && k in before ? { existed: true, value: before[k] } : { existed: false }])), after: patch })), null, 2)}</pre></details>
      {!saved && (plan.changes.length ? <><p>A before-state backup downloads before the atomic update. Any newer edit aborts application.</p><button type="button" disabled={busy} onClick={apply} style={ghostBtn()}>Apply reviewed symbol sections</button></> : <p>The reviewed sections are already applied.</p>)}
    </div>}
    {saved && <p role="status">{refreshed ? 'Saved to Firebase and both storefront caches refreshed.' : 'Saved to Firebase. Storefront refresh pending.'}</p>}
    {((saved && !refreshed) || plan?.changes.length === 0) && <button type="button" disabled={busy} onClick={refresh} style={ghostBtn()}>Refresh storefront caches</button>}
    {error && <p role="alert" style={{ color: T.danger }}>{error}</p>}
  </section>;
}
