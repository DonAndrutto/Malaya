'use client';

import { useState } from 'react';
import { T, ghostBtn } from './theme';

export default function VajraRefresh() {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  async function review() {
    setBusy(true); setError('');
    try {
      const { prepareVajraAdminRefresh } = await import('@/lib/content/vajra-admin');
      setPlan(await prepareVajraAdminRefresh());
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true); setError('');
    try {
      const { applyVajraAdminRefresh, refreshVajraStorefront } = await import('@/lib/content/vajra-admin');
      // Keep a product before-state backup; the topic also has server history.
      const backup = plan.changes.map(({ path, before, patch }) => ({ path, fields: Object.fromEntries(Object.keys(patch).map((key) => [key,
        before && key in before ? { existed: true, value: before[key] } : { existed: false },
      ])) }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `malaya-vajra-before-${Date.now()}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      await applyVajraAdminRefresh(plan);
      setSaved(true);
      await refreshVajraStorefront();
      setRefreshed(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function retryRefresh() {
    setBusy(true); setError('');
    try {
      const { refreshVajraStorefront } = await import('@/lib/content/vajra-admin');
      await refreshVajraStorefront(); setRefreshed(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <section style={{ marginTop: 20, border: `1px solid ${T.line}`, padding: 18, background: T.panel }}>
    <h3 style={{ margin: '0 0 8px', fontFamily: T.serif, fontSize: 21 }}>Vajra / Dorje refresh</h3>
    <p style={{ fontSize: 13, color: T.muted }}>Apply the approved copy and product links to the live catalogue. Current stock comes first; double dorje, Phurba and mantra necklaces are excluded.</p>
    {!saved && <button type="button" disabled={busy} onClick={review} style={ghostBtn()}>{busy ? 'Working…' : plan ? 'Review fresh changes' : 'Review Vajra refresh'}</button>}
    {plan && !saved && <div style={{ marginTop: 14, fontSize: 13 }}>
      <p>{plan.pieces.length} shelf pieces · {plan.changes.length} records to update.</p>
      {plan.changes.length === 0 ? <p>The approved refresh is already applied.</p> : <>
        <p>Existing photos, prices, stock and substantive product stories are preserved. A backup downloads before applying.</p>
        <details><summary>Review pieces and exact changes</summary>
          <ul>{plan.pieces.map((p) => <li key={p.id}>{p.name} · {p.salesCode || p.id} · {p.stock || 'Stock unknown'}</li>)}</ul>
          <pre style={{ overflow: 'auto', maxHeight: 340, whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(plan.changes.map(({ path, patch }) => ({ path, patch })), null, 2)}</pre>
        </details>
        <button type="button" disabled={busy} onClick={apply} style={{ ...ghostBtn(), marginTop: 14 }}>Apply approved refresh</button>
      </>}
    </div>}
    {saved && <p role="status">{refreshed ? 'Saved to Firebase and storefront refreshed.' : 'Saved to Firebase. Storefront refresh pending.'} <a href="/explore/topic/vajra" target="_blank" rel="noreferrer">View Vajra / Dorje ↗</a></p>}
    {saved && !refreshed && <button type="button" disabled={busy} onClick={retryRefresh} style={ghostBtn()}>Retry storefront refresh</button>}
    {error && <p role="alert" style={{ color: T.danger, fontSize: 13 }}>{error}</p>}
  </section>;
}
