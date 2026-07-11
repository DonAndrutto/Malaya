'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Explore admin — curate the knowledge layer: Topics (block-based editorial
// pages) and Groups (ordered navigation shelves). Follows the BlogAdmin
// list/editor idiom; saves to Firestore via lib/explore.js.
//
// Association model (one storage location, two editing surfaces):
//   • topic ⇄ group  — lives on the GROUP (`topicSlugs`, ordered). The topic
//     editor's Groups checkboxes write to the group docs.
//   • topic ⇄ product — lives on the PRODUCT (`catalogueOverrides/{id}.topics`).
//     The topic editor's Linked-pieces panel writes product overrides; the
//     Inventory drawer's Symbolism checklist edits the same field.
//
// The split-pane preview renders the production <BlockRenderer> inside a
// .malaya-site-scoped pane — the preview IS the storefront renderer.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { T, ghostBtn } from './theme';
import {
  subscribeExploreAdmin, saveTopic, deleteTopic, saveGroup, deleteGroup,
  groupList, topicProducts, newBlockId, BLOCK_TYPES, RESERVED_GROUP_SLUGS, topicByteSize,
  listTopicRevisions, checkpointTopic, REVISION_KEEP, EXPLORE_SAVE_ERROR_EVENT,
} from '@/lib/explore';
import { slugify, loadBlog } from '@/lib/blog';
import { uploadImage } from '@/lib/upload';
import { resizeImageFile } from '@/lib/image-resize';
import { FIREBASE_ENABLED } from '@/lib/firebase';
import { buildSiteData } from '@/lib/data/site-data';
import { loadOverrides, saveOverrides, subscribeOverrides } from '@/lib/overrides';
import { BlockRenderer } from '@/components/store/site/ExplorePages';

const card = { background: T.panel, border: `1px solid ${T.line}`, padding: '18px 20px', marginBottom: 16 };
const headStyle = { fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accent, margin: '0 0 14px' };
const labelStyle = { fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.muted, marginBottom: 6, display: 'block' };
const fieldStyle = { width: '100%', background: T.card, border: `1px solid ${T.line2}`, color: T.ink, padding: '10px 12px', fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' };
const linkBtn = { background: 'transparent', border: 'none', color: T.danger, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', padding: 0 };
const primaryBtn = { background: T.ink, color: T.panel, border: 'none', padding: '10px 22px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans };

const BLOCK_LABEL = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b.label]));

function blankTopic() {
  return { slug: '', title: '', subtitle: '', excerpt: '', aliases: [], previousSlugs: [], heroImage: '', heroPos: '', blocks: [], published: false };
}
function blankGroup(order) {
  return { slug: '', name: '', description: '', heroImage: '', heroPos: '', order, topicSlugs: [], published: true };
}

// New blocks start with the props their form expects.
function blankBlock(type) {
  const base = { id: newBlockId(), type };
  switch (type) {
    case 'richText': return { ...base, md: '' };
    case 'floatProduct': return { ...base, productId: '', side: 'right', caption: '' };
    case 'editorialImage': return { ...base, src: '', alt: '', caption: '', hotspots: [] };
    case 'quote': return { ...base, text: '', attribution: '' };
    case 'divider': return { ...base, style: 'rule' };
    case 'productGrid': return { ...base, mode: 'linked', ids: [], title: '', limit: 0 };
    case 'relatedTopics': return { ...base, mode: 'auto', slugs: [], title: '' };
    case 'callout': return { ...base, title: '', md: '', tone: 'note' };
    case 'architectureGallery': return { ...base, items: [] };
    default: return base;
  }
}

// One-line summary for a block's list row.
function blockSummary(b) {
  if (!b) return '';
  switch (b.type) {
    case 'richText': return (b.md || '').replace(/\s+/g, ' ').slice(0, 80) || '(empty)';
    case 'floatProduct': return `${b.productId || '(no product)'} · ${b.side || 'right'}`;
    case 'editorialImage': return `${b.src ? 'photo' : '(no photo)'} · ${(b.hotspots || []).length} hotspot(s)`;
    case 'quote': return (b.text || '').slice(0, 80) || '(empty)';
    case 'divider': return b.style === 'knot' ? 'ornamental' : 'rule';
    case 'productGrid': return b.mode === 'manual' ? `${(b.ids || []).length} chosen piece(s)` : 'linked pieces (automatic)';
    case 'relatedTopics': return b.mode === 'manual' ? `${(b.slugs || []).length} chosen topic(s)` : 'shared-shelf siblings (automatic)';
    case 'callout': return b.title || (b.md || '').slice(0, 60) || '(empty)';
    case 'architectureGallery': return `${(b.items || []).length} image(s)`;
    default: return b.type;
  }
}

// ── Small pickers (dropdown + search, the LinkPicker idiom) ──────────────────
function SearchPick({ label, items, onPick, renderLabel, width = 320 }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = (query ? items.filter((it) => renderLabel(it).toLowerCase().includes(query)) : items).slice(0, 40);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={ghostBtn()}>{label} ▾</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', width, maxHeight: 340, overflow: 'auto', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 18px 40px rgba(0,0,0,0.2)', zIndex: 41, padding: 10 }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ ...fieldStyle, marginBottom: 8 }} />
            {shown.map((it, i) => (
              <button key={i} type="button" onClick={() => { onPick(it); setOpen(false); setQ(''); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '7px 8px', fontSize: 12.5, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.card; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                {renderLabel(it)}
              </button>
            ))}
            {shown.length === 0 && <div style={{ padding: 12, fontSize: 12, color: T.muted }}>No matches.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// Asset reuse: accept an already-hosted image URL so a photograph used on one
// topic can be reused elsewhere without re-uploading a duplicate Storage
// object. Only URLs the storefront can actually render are accepted — the
// Firebase Storage host (CSP img-src + next/image remotePatterns allowlist)
// or a site-relative path.
function promptExistingImageUrl() {
  const raw = prompt('Paste the URL of an already-uploaded image (copy it from another topic or from the site — right-click → Copy image address):');
  if (!raw || !raw.trim()) return null;
  const url = raw.trim();
  if (/^https:\/\/firebasestorage\.googleapis\.com\//.test(url) || url.startsWith('/')) return url;
  alert('That URL cannot be shown on the site — paste a Firebase Storage image URL (https://firebasestorage.googleapis.com/…) or a site-relative path.');
  return null;
}

function ImageUpload({ value, folder, onChange, busyKey, busy, setBusy, height = 90 }) {
  const ref = useRef(null);
  const upload = async (file) => {
    if (!FIREBASE_ENABLED) { alert('Connect Firebase to upload images.'); return; }
    setBusy(busyKey);
    try { onChange(await uploadImage(folder, await resizeImageFile(file))); }
    catch (e) { alert('Upload failed: ' + (e && e.message ? e.message : String(e))); }
    finally { setBusy(''); }
  };
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: height * 1.5, height, flexShrink: 0, background: T.card, border: `1px solid ${T.line2}`, overflow: 'hidden' }}>
        {value ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} /> : null}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" disabled={busy === busyKey} onClick={() => ref.current && ref.current.click()} style={ghostBtn(busy === busyKey)}>
          {busy === busyKey ? 'Uploading…' : (value ? 'Replace' : 'Upload')}
        </button>
        <button type="button" title="Reuse an image that is already uploaded, without duplicating it"
          onClick={() => { const u = promptExistingImageUrl(); if (u) onChange(u); }} style={ghostBtn()}>Use existing</button>
        {value && <button type="button" onClick={() => onChange('')} style={linkBtn}>Remove</button>}
        <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) upload(f); }} />
      </div>
    </div>
  );
}

// ── Hotspot editor — click to place, drag to move, click a pin to attach ─────
// Coordinates are fractions of the rendered image (resolution-independent);
// the admin never sees a number. Pointer events cover mouse and touch.
function HotspotEditor({ src, hotspots, onChange, products, byId }) {
  const wrapRef = useRef(null);
  const [sel, setSel] = useState(-1);
  const drag = useRef(null); // { index, moved }
  const list = hotspots || [];

  const fracOf = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const update = (i, patch) => onChange(list.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  const addPin = (e) => {
    if (drag.current) return;
    const { x, y } = fracOf(e);
    onChange([...list, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, productId: '' }]);
    setSel(list.length);
  };
  const startDrag = (i) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { index: i, moved: false };
    const move = (ev) => {
      const { x, y } = fracOf(ev);
      drag.current.moved = true;
      update(i, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!drag.current.moved) setSel(i); // a click (no movement) selects the pin
      drag.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    setSel(i);
  };
  const removePin = (i) => { onChange(list.filter((_, j) => j !== i)); setSel(-1); };
  const selected = sel >= 0 ? list[sel] : null;
  const selProduct = selected && selected.productId ? byId[selected.productId] : null;

  if (!src) return <div style={{ fontSize: 12, color: T.muted }}>Upload the photo first, then click it to place product pins.</div>;
  return (
    <div>
      <div ref={wrapRef} onPointerDown={addPin}
        style={{ position: 'relative', cursor: 'crosshair', userSelect: 'none', touchAction: 'none', border: `1px solid ${T.line2}` }}>
        <img src={src} alt="" draggable={false} style={{ width: '100%', display: 'block' }} />
        {list.map((h, i) => (
          <span key={i} onPointerDown={startDrag(i)} title={h.label || (byId[h.productId] || {}).name || 'Unassigned pin'}
            style={{
              position: 'absolute', left: `${(h.x || 0) * 100}%`, top: `${(h.y || 0) * 100}%`,
              transform: 'translate(-50%, -50%)', width: 22, height: 22, borderRadius: '50%',
              background: sel === i ? T.accent : 'rgba(255,255,255,0.92)',
              border: `2px solid ${h.productId ? T.accent : T.danger}`,
              boxShadow: '0 1px 6px rgba(0,0,0,0.3)', cursor: 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: sel === i ? '#fff' : T.ink, fontFamily: T.sans,
            }}>{i + 1}</span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.faint, margin: '8px 0 10px', lineHeight: 1.6 }}>
        Click the photo to place a pin · drag a pin to move it · click a pin to attach its piece. A red ring means no piece is attached yet.
      </div>
      {selected && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: T.card, border: `1px solid ${T.line2}`, padding: '10px 12px' }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.accent }}>Pin {sel + 1}</span>
          <span style={{ fontSize: 12.5, color: selProduct ? T.ink : T.danger }}>
            {selProduct ? `${selProduct.name}${selProduct.salesCode ? ' · ' + selProduct.salesCode : ''}` : 'No piece attached'}
          </span>
          <SearchPick label={selProduct ? 'Change piece' : 'Attach piece'} items={products}
            renderLabel={(p) => `${p.name}${p.salesCode ? ' · ' + p.salesCode : ''}`}
            onPick={(p) => update(sel, { productId: p.id })} />
          <input value={selected.label || ''} placeholder="Label (optional — defaults to the piece name)"
            onChange={(e) => update(sel, { label: e.target.value })}
            style={{ ...fieldStyle, flex: '1 1 200px', width: 'auto', padding: '8px 10px', fontSize: 12.5 }} />
          <button type="button" onClick={() => removePin(sel)} style={linkBtn}>Delete pin</button>
        </div>
      )}
    </div>
  );
}

// Markdown editor with cursor-aware insert pickers (the BlogAdmin
// insertAtCursor idiom): snippets land at the caret — replacing any
// selection — instead of being appended to the end of the text.
function RichTextForm({ block: b, set, products, topicsArr }) {
  const mdRef = useRef(null);
  const insertAtCursor = (snippet) => {
    const el = mdRef.current;
    const cur = b.md || '';
    const start = el ? el.selectionStart : cur.length;
    const end = el ? el.selectionEnd : cur.length;
    set({ md: cur.slice(0, start) + snippet + cur.slice(end) });
    requestAnimationFrame(() => { if (el) { const pos = start + snippet.length; el.focus(); el.setSelectionRange(pos, pos); } });
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <SearchPick label="Insert product link" items={products}
          renderLabel={(p) => `${p.name}${p.salesCode ? ' · ' + p.salesCode : ''}`}
          onPick={(p) => insertAtCursor(`[[product: ${p.salesCode || p.id}]]`)} />
        <SearchPick label="Insert floating product" items={products}
          renderLabel={(p) => `${p.name}${p.salesCode ? ' · ' + p.salesCode : ''}`}
          onPick={(p) => insertAtCursor(`\n\n![[float: ${p.salesCode || p.id} | right]]\n\n`)} />
        <SearchPick label="Insert topic link" items={topicsArr}
          renderLabel={(t) => t.title}
          onPick={(t) => insertAtCursor(`[[topic: ${t.slug}]]`)} />
      </div>
      <textarea ref={mdRef} value={b.md || ''} rows={10} onChange={(e) => set({ md: e.target.value })}
        placeholder={'Write in Markdown.\n\nCross-link with [[topic: endless-knot]], [[product: P045-YGP]].\nFloat a piece into the text with ![[float: P045-YGP | right]] or ![[float: p016 | left | caption]].'}
        style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13 }} />
    </div>
  );
}

// ── Per-type block forms ─────────────────────────────────────────────────────
function BlockForm({ block, setBlock, products, byId, topicsArr, uploadFolder, busy, setBusy }) {
  const set = (patch) => setBlock({ ...block, ...patch });
  const b = block;
  switch (b.type) {
    case 'richText':
      return <RichTextForm block={b} set={set} products={products} topicsArr={topicsArr} />;
    case 'floatProduct': {
      const p = b.productId ? byId[b.productId] : null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: p ? T.ink : T.muted }}>{p ? `${p.name}${p.salesCode ? ' · ' + p.salesCode : ''}` : 'No piece chosen'}</span>
            <SearchPick label={p ? 'Change piece' : 'Choose piece'} items={products}
              renderLabel={(x) => `${x.name}${x.salesCode ? ' · ' + x.salesCode : ''}`}
              onPick={(x) => set({ productId: x.id })} />
            <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}` }}>
              {['left', 'right'].map((s) => (
                <button key={s} type="button" onClick={() => set({ side: s })}
                  style={{ padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, border: 'none', background: (b.side || 'right') === s ? T.ink : T.card, color: (b.side || 'right') === s ? T.panel : T.ink, textTransform: 'capitalize' }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Caption (optional — defaults to the piece name)</label>
            <input value={b.caption || ''} onChange={(e) => set({ caption: e.target.value })} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Custom cut-out PNG (optional — defaults to the piece’s own photo)</label>
            <ImageUpload value={b.src || ''} folder={uploadFolder} onChange={(url) => set({ src: url })}
              busyKey={'float-' + b.id} busy={busy} setBusy={setBusy} height={70} />
          </div>
        </div>
      );
    }
    case 'editorialImage':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ImageUpload value={b.src || ''} folder={uploadFolder} onChange={(url) => set({ src: url })}
            busyKey={'img-' + b.id} busy={busy} setBusy={setBusy} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Alt text</label>
              <input value={b.alt || ''} onChange={(e) => set({ alt: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Caption</label>
              <input value={b.caption || ''} onChange={(e) => set({ caption: e.target.value })} style={fieldStyle} />
            </div>
          </div>
          <HotspotEditor src={b.src} hotspots={b.hotspots || []} onChange={(hs) => set({ hotspots: hs })}
            products={products} byId={byId} />
        </div>
      );
    case 'quote':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea value={b.text || ''} rows={3} placeholder="The quotation…" onChange={(e) => set({ text: e.target.value })}
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }} />
          <input value={b.attribution || ''} placeholder="Attribution (optional)" onChange={(e) => set({ attribution: e.target.value })} style={fieldStyle} />
        </div>
      );
    case 'divider':
      return (
        <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}` }}>
          {[['rule', 'Gold rule'], ['knot', 'Ornamental']].map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => set({ style: k })}
              style={{ padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, border: 'none', background: (b.style || 'rule') === k ? T.ink : T.card, color: (b.style || 'rule') === k ? T.panel : T.ink }}>{lbl}</button>
          ))}
        </div>
      );
    case 'productGrid':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}`, alignSelf: 'flex-start' }}>
            {[['linked', 'Linked pieces (automatic)'], ['manual', 'Chosen pieces']].map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => set({ mode: k })}
                style={{ padding: '8px 14px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, border: 'none', background: (b.mode || 'linked') === k ? T.ink : T.card, color: (b.mode || 'linked') === k ? T.panel : T.ink }}>{lbl}</button>
            ))}
          </div>
          {b.mode === 'manual' && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {(b.ids || []).map((id) => {
                  const p = byId[id];
                  return (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${T.line2}`, background: T.card, padding: '5px 9px', fontSize: 12 }}>
                      {p ? p.name : id}
                      <button type="button" onClick={() => set({ ids: (b.ids || []).filter((x) => x !== id) })}
                        style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
                    </span>
                  );
                })}
              </div>
              <SearchPick label="Add piece" items={products.filter((p) => !(b.ids || []).includes(p.id))}
                renderLabel={(p) => `${p.name}${p.salesCode ? ' · ' + p.salesCode : ''}`}
                onPick={(p) => set({ ids: [...(b.ids || []), p.id] })} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <div>
              <label style={labelStyle}>Title (optional)</label>
              <input value={b.title || ''} onChange={(e) => set({ title: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Limit (0 = all)</label>
              <input value={b.limit || 0} inputMode="numeric" onChange={(e) => set({ limit: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} style={fieldStyle} />
            </div>
          </div>
        </div>
      );
    case 'relatedTopics':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}`, alignSelf: 'flex-start' }}>
            {[['auto', 'Shared-shelf siblings (automatic)'], ['manual', 'Chosen topics']].map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => set({ mode: k })}
                style={{ padding: '8px 14px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, border: 'none', background: (b.mode || 'auto') === k ? T.ink : T.card, color: (b.mode || 'auto') === k ? T.panel : T.ink }}>{lbl}</button>
            ))}
          </div>
          {b.mode === 'manual' && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {(b.slugs || []).map((s) => (
                  <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${T.line2}`, background: T.card, padding: '5px 9px', fontSize: 12 }}>
                    {s}
                    <button type="button" onClick={() => set({ slugs: (b.slugs || []).filter((x) => x !== s) })}
                      style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
              <SearchPick label="Add topic" items={topicsArr.filter((t) => !(b.slugs || []).includes(t.slug))}
                renderLabel={(t) => t.title} onPick={(t) => set({ slugs: [...(b.slugs || []), t.slug] })} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Title (optional)</label>
            <input value={b.title || ''} onChange={(e) => set({ title: e.target.value })} style={fieldStyle} />
          </div>
        </div>
      );
    case 'callout':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
            <div>
              <label style={labelStyle}>Title (optional)</label>
              <input value={b.title || ''} onChange={(e) => set({ title: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tone</label>
              <select value={b.tone || 'note'} onChange={(e) => set({ tone: e.target.value })} style={{ ...fieldStyle, cursor: 'pointer' }}>
                <option value="note">Note</option>
                <option value="ritual">Ritual</option>
              </select>
            </div>
          </div>
          <textarea value={b.md || ''} rows={4} placeholder="Markdown — pronunciation, ritual use, provenance…" onChange={(e) => set({ md: e.target.value })}
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }} />
        </div>
      );
    case 'architectureGallery': {
      const items = b.items || [];
      const move = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= items.length) return;
        const a = items.slice(); [a[i], a[j]] = [a[j], a[i]];
        set({ items: a });
      };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', border: `1px solid ${T.line}`, padding: 10, background: T.card }}>
              <img src={it.src} alt="" style={{ width: 84, height: 84, objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.style.opacity = 0.3; }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={it.caption || ''} placeholder="Caption" style={{ ...fieldStyle, padding: '7px 9px', fontSize: 12.5 }}
                  onChange={(e) => set({ items: items.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })} />
                <input value={it.location || ''} placeholder="Location (e.g. Punakha Dzong)" style={{ ...fieldStyle, padding: '7px 9px', fontSize: 12.5 }}
                  onChange={(e) => set({ items: items.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)) })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} style={{ ...ghostBtn(i === 0), padding: '4px 8px', fontSize: 10 }}>▲</button>
                <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} style={{ ...ghostBtn(i === items.length - 1), padding: '4px 8px', fontSize: 10 }}>▼</button>
                <button type="button" onClick={() => set({ items: items.filter((_, j) => j !== i) })} style={{ ...linkBtn, padding: '4px 0' }}>✕</button>
              </div>
            </div>
          ))}
          <GalleryUpload folder={uploadFolder} onAdd={(urls) => set({ items: [...items, ...urls.map((src) => ({ src, caption: '', location: '' }))] })} />
        </div>
      );
    }
    default:
      return <div style={{ fontSize: 12, color: T.muted }}>Unknown block type “{b.type}”.</div>;
  }
}

function GalleryUpload({ folder, onAdd }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const addFiles = async (files) => {
    if (!FIREBASE_ENABLED) { alert('Connect Firebase to upload images.'); return; }
    const arr = files ? Array.from(files) : [];
    if (!arr.length) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of arr) urls.push(await uploadImage(folder, await resizeImageFile(f)));
      onAdd(urls);
    } catch (e) { alert('Upload failed: ' + (e && e.message ? e.message : String(e))); }
    finally { setBusy(false); }
  };
  return (
    <div onClick={() => ref.current && ref.current.click()}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      style={{ border: `1px dashed ${T.line2}`, background: T.card, padding: '16px', textAlign: 'center', cursor: busy ? 'wait' : 'pointer', color: T.muted }}>
      <div style={{ fontSize: 12 }}>{busy ? 'Uploading…' : 'Click or drop photos here'}</div>
      {!busy && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); const u = promptExistingImageUrl(); if (u) onAdd([u]); }}
          style={{ background: 'none', border: 'none', color: T.accent, fontSize: 11, cursor: 'pointer', padding: '6px 0 0', fontFamily: T.sans, textDecoration: 'underline' }}>
          …or paste the URL of an existing image
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={(e) => { const fs = e.target.files; e.target.value = ''; addFiles(fs); }} />
    </div>
  );
}

// ── Revision history (content safety net) — load on demand, restore a copy ──
function RevisionHistory({ slug, onRestore }) {
  const [revs, setRevs] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  useEffect(() => { setRevs(null); }, [slug]);
  if (!FIREBASE_ENABLED) return null;
  const load = async () => {
    setLoading(true);
    try { setRevs(await listTopicRevisions(slug)); } finally { setLoading(false); }
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ ...headStyle, margin: 0 }}>History</h3>
        <button type="button" disabled={loading} onClick={load} style={ghostBtn(loading)}>
          {loading ? 'Loading…' : (revs ? 'Refresh' : 'Show snapshots')}
        </button>
      </div>
      {revs && (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {revs.length === 0 && (
            <div style={{ fontSize: 12.5, color: T.muted }}>No snapshots yet — they accrue automatically as you edit.</div>
          )}
          {revs.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${T.line}`, background: T.card, padding: '8px 12px' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.ink }}>
                {new Date(r.savedAt).toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: T.faint, whiteSpace: 'nowrap' }}>
                {(r.topic.blocks || []).length} block{(r.topic.blocks || []).length === 1 ? '' : 's'} · {(topicByteSize(r.topic) / 1024).toFixed(1)} KB
              </span>
              <button type="button" onClick={() => onRestore(r)} style={{ ...ghostBtn(), padding: '5px 12px', fontSize: 10 }}>Restore</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: T.faint, marginTop: 10, lineHeight: 1.6 }}>
        A snapshot of the previous version is kept automatically while you edit (at most one every 5 minutes) and always before a
        delete or rename; the newest {REVISION_KEEP} are retained. Restoring checkpoints the current version first.
      </div>
    </div>
  );
}

function Toast({ text }) {
  return <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: T.ink, color: T.panel, padding: '12px 22px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{text}</div>;
}

// ─────────────────────────────────────────────────── Root: Explore admin ────
export default function ExploreAdmin() {
  const [data, setData] = useState({ topics: {}, groups: {} });
  const [overrides, setOverrides] = useState({});
  const [view, setView] = useState('topics'); // 'topics' | 'groups'
  const [editKey, setEditKey] = useState(null); // topic slug being edited ('__new__' for unsaved)
  const [draft, setDraft] = useState(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [topicSearch, setTopicSearch] = useState('');
  const [blockOpen, setBlockOpen] = useState(null); // block id expanded in the editor
  // Latest draft for async callbacks (image uploads resolve seconds after the
  // render that started them): persisting the render-time draft would revert
  // everything edited while the upload was in flight.
  const draftRef = useRef(null);
  draftRef.current = draft;

  useEffect(() => subscribeExploreAdmin(setData), []);
  useEffect(() => subscribeOverrides(setOverrides), []);
  // Error toasts (⚠) carry a Firestore error code the studio may need to read
  // out or screenshot — keep them up longer than the 1.8s "Saved" flash.
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), toast.startsWith('⚠') ? 6000 : 1800); return () => clearTimeout(t); }, [toast]);
  // Failed Firestore writes (rules rejection) are broadcast by lib/explore.js —
  // without this the editor would see "Saved" while the cloud copy is stale.
  // The full error is in the console; the toast names the code and the path.
  useEffect(() => {
    const onErr = (e) => {
      const d = (e && e.detail) || {};
      setToast(`⚠ Cloud save failed${d.code ? ` (${d.code})` : ''}${d.path ? ` at ${d.path}` : ''} — the change is only in this browser`);
    };
    window.addEventListener(EXPLORE_SAVE_ERROR_EVENT, onErr);
    return () => window.removeEventListener(EXPLORE_SAVE_ERROR_EVENT, onErr);
  }, []);

  const flash = (m) => setToast(m);
  const { SITE_PRODUCTS, SITE_BY_ID } = useMemo(() => {
    try { return buildSiteData(overrides); } catch { return { SITE_PRODUCTS: [], SITE_BY_ID: {} }; }
  }, [overrides]);
  const posts = useMemo(() => Object.values(loadBlog()), []);

  const topicsArr = useMemo(
    () => Object.values(data.topics).filter((t) => t && t.title).sort((a, b) => String(a.title).localeCompare(String(b.title))),
    [data.topics],
  );
  const groupsArr = useMemo(() => groupList(data.groups), [data.groups]);

  // Optimistic local writes: Firestore snapshots reconcile moments later, but
  // the console must not wait on the round trip (or on Firebase existing).
  const putTopic = (slug, topic) => {
    const ack = saveTopic(slug, topic); // promise<true|false> | null — see saveExploreDoc
    setData((d) => ({ ...d, topics: { ...d.topics, [slug]: { ...topic, slug } } }));
    return ack;
  };
  const dropTopic = (slug) => {
    deleteTopic(slug);
    setData((d) => { const topics = { ...d.topics }; delete topics[slug]; return { ...d, topics }; });
  };
  const putGroup = (slug, group) => {
    saveGroup(slug, group);
    setData((d) => ({ ...d, groups: { ...d.groups, [slug]: { ...group, slug } } }));
  };
  const dropGroup = (slug) => {
    deleteGroup(slug);
    setData((d) => { const groups = { ...d.groups }; delete groups[slug]; return { ...d, groups }; });
  };

  // topic ⇄ group membership: writes to the GROUP doc (append at shelf end).
  const setTopicInGroup = (groupSlug, topicSlug, on) => {
    const g = data.groups[groupSlug];
    if (!g) return;
    const list = (g.topicSlugs || []).filter((s) => s !== topicSlug);
    if (on) list.push(topicSlug);
    putGroup(groupSlug, { ...g, topicSlugs: list });
  };

  // topic ⇄ product link: writes to the PRODUCT override (topics field).
  const toggleProductTopic = (productId, topicSlug) => {
    const all = { ...loadOverrides() };
    const o = { ...(all[productId] || {}) };
    const set = new Set(Array.isArray(o.topics) ? o.topics : []);
    if (set.has(topicSlug)) set.delete(topicSlug); else set.add(topicSlug);
    if (set.size) o.topics = [...set].slice(0, 20); else delete o.topics;
    if (Object.keys(o).length) all[productId] = o; else delete all[productId];
    saveOverrides(all);
    setOverrides(all);
  };

  // ── Topic editor persistence (the BlogAdmin persist idiom) ────────────────
  const uniqueTopicSlug = (base) => {
    let s = base || 'topic'; let i = 2;
    while (s !== editKey && data.topics[s]) { s = `${base}-${i}`; i += 1; }
    return s;
  };

  const persist = (next, { silent } = {}) => {
    const d = next || draft;
    if (!d || !d.title.trim()) { setDraft(d); return null; }
    let slug = slugify(d.slug || d.title);
    if (editKey === '__new__') slug = uniqueTopicSlug(slug);
    const renaming = editKey && editKey !== '__new__' && editKey !== slug;
    if (renaming && data.topics[slug]) {
      // Never let a rename land on a slug another topic already owns — that
      // would silently overwrite the other topic's document.
      alert(`Another topic already uses the slug “${slug}” — nothing was saved. Pick a different slug.`);
      setDraft(d);
      return null;
    }
    // A renamed topic keeps its old slugs so the topic route can issue
    // permanent redirects from every URL it has ever lived at.
    const previousSlugs = [
      ...new Set([...(d.previousSlugs || []), ...(renaming ? [editKey] : [])]),
    ].filter((s) => s && s !== slug).slice(-30);
    const topic = {
      slug,
      title: d.title.trim(),
      subtitle: d.subtitle || '',
      excerpt: d.excerpt || '',
      aliases: (d.aliases || []).filter(Boolean),
      ...(previousSlugs.length ? { previousSlugs } : {}),
      heroImage: d.heroImage || '',
      heroPos: d.heroPos || '',
      blocks: d.blocks || [],
      published: !!d.published,
    };
    if (renaming) {
      // Slug rename: move the doc and carry every reference with it so no
      // group shelf or product link dangles. Destructive legs (deleting the
      // old doc, rewriting shelves and product links) run only after the
      // server ACCEPTS the new document — a rejected create (stale rules, a
      // future validation drift) must never delete the only copy. On
      // rejection the save-error toast fires, the snapshot listener rolls the
      // optimistic entry back, and the editor returns to the old slug so the
      // next save simply retries the rename.
      const oldKey = editKey;
      const ack = putTopic(slug, topic);
      const finishRename = () => {
        dropTopic(oldKey);
        groupsArr.forEach((g) => {
          if ((g.topicSlugs || []).includes(oldKey)) {
            putGroup(g.slug, { ...g, topicSlugs: g.topicSlugs.map((s) => (s === oldKey ? slug : s)) });
          }
        });
        const all = { ...loadOverrides() };
        let changed = false;
        Object.keys(all).forEach((id) => {
          const t = all[id] && all[id].topics;
          if (Array.isArray(t) && t.includes(oldKey)) {
            all[id] = { ...all[id], topics: t.map((x) => (x === oldKey ? slug : x)) };
            changed = true;
          }
        });
        if (changed) { saveOverrides(all); setOverrides(all); }
      };
      if (ack && typeof ack.then === 'function') {
        ack.then((ok) => {
          if (ok === false) { setEditKey((k) => (k === slug ? oldKey : k)); return; }
          finishRename();
        });
      } else {
        finishRename(); // localStorage-only mode: no server to wait for
      }
    } else {
      putTopic(slug, topic);
    }
    setEditKey(slug);
    setDraft({ ...d, slug, previousSlugs });
    if (!silent) flash('Saved');
    return slug;
  };

  const newTopic = () => { setDraft(blankTopic()); setEditKey('__new__'); setBlockOpen(null); };
  const openTopic = (slug) => { setDraft({ ...blankTopic(), ...data.topics[slug] }); setEditKey(slug); setBlockOpen(null); };
  const closeEditor = () => { setEditKey(null); setDraft(null); };
  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const removeTopic = (slug) => {
    if (!confirm('Delete this topic? Its page disappears; shelf and product references are cleaned up. This cannot be undone.')) return;
    dropTopic(slug);
    // Prune the slug from every shelf and product link (dangling refs are
    // tolerated by the resolvers, but the admin save path prunes eagerly).
    groupsArr.forEach((g) => {
      if ((g.topicSlugs || []).includes(slug)) putGroup(g.slug, { ...g, topicSlugs: g.topicSlugs.filter((s) => s !== slug) });
    });
    const all = { ...loadOverrides() };
    let changed = false;
    Object.keys(all).forEach((id) => {
      const t = all[id] && all[id].topics;
      if (Array.isArray(t) && t.includes(slug)) {
        const rest = t.filter((x) => x !== slug);
        all[id] = { ...all[id] };
        if (rest.length) all[id].topics = rest; else delete all[id].topics;
        if (!Object.keys(all[id]).length) delete all[id];
        changed = true;
      }
    });
    if (changed) { saveOverrides(all); setOverrides(all); }
    if (editKey === slug) closeEditor();
    flash('Deleted');
  };

  // Restore a History snapshot: content and metadata come back from the
  // snapshot; the current slug, redirect history and visibility are kept so a
  // restore can never rename, collide or unpublish.
  const restoreRevision = (rev) => {
    if (!confirm('Replace the current content with this snapshot? The current version is checkpointed to History first.')) return;
    checkpointTopic(editKey);
    const next = {
      ...blankTopic(),
      ...rev.topic,
      slug: draft.slug,
      previousSlugs: draft.previousSlugs || [],
      published: !!draft.published,
    };
    setDraft(next);
    persist(next, { silent: true });
    setBlockOpen(null);
    flash('Snapshot restored');
  };

  // ── Blocks ────────────────────────────────────────────────────────────────
  // All block mutators read through draftRef: a block image upload calls
  // setBlock long after its render, and the render-time draft would clobber
  // any field edited meanwhile.
  const setBlocks = (blocks) => { const next = { ...(draftRef.current || draft), blocks }; setDraft(next); persist(next, { silent: true }); };
  const curBlocks = () => ((draftRef.current || draft).blocks) || [];
  const addBlock = (type) => {
    const b = blankBlock(type);
    setBlocks([...curBlocks(), b]);
    setBlockOpen(b.id);
  };
  const setBlock = (nb) => setBlocks(curBlocks().map((x) => (x.id === nb.id ? nb : x)));
  const moveBlock = (i, dir) => {
    const arr = curBlocks().slice();
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setBlocks(arr);
  };
  const removeBlock = (id) => setBlocks(curBlocks().filter((x) => x.id !== id));

  // ── Views ─────────────────────────────────────────────────────────────────
  if (editKey !== null) {
    const d = draft || blankTopic();
    const slugPreview = slugify(d.slug || d.title) || 'topic';
    const uploadFolder = 'site/explore/' + (slugPreview || 'topic');
    const linked = topicProducts(editKey === '__new__' ? '∅' : editKey, SITE_PRODUCTS);
    const bytes = topicByteSize(d);
    const previewCtx = {
      topic: { ...d, slug: editKey === '__new__' ? slugPreview : editKey },
      products: SITE_PRODUCTS,
      byId: SITE_BY_ID,
      topicsMap: data.topics,
      groupsMap: data.groups,
      topics: topicsArr,
      posts,
    };
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 28px 80px' }} className="adm-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <button onClick={closeEditor} style={{ ...ghostBtn(), padding: '8px 14px' }}>← All topics</button>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: bytes > 800_000 ? T.danger : T.faint, letterSpacing: '0.05em' }}>
              {(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB of 1,024 KB
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.ink, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!d.published} onChange={(e) => persist({ ...d, published: e.target.checked })} style={{ accentColor: T.accent }} />
              Published
            </label>
            {editKey !== '__new__' && (
              <a href={`/explore/topic/${editKey}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn(), padding: '8px 14px', textDecoration: 'none' }}>View ↗</a>
            )}
            <button onClick={() => setShowPreview((s) => !s)} style={{ ...ghostBtn(), padding: '8px 14px' }}>{showPreview ? 'Hide preview' : 'Show preview'}</button>
            <button onClick={() => persist(d)} style={primaryBtn}>Save</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', gap: 18, alignItems: 'start' }}>
          <div>
            {/* Meta */}
            <div style={card}>
              <h3 style={headStyle}>Topic</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Title</label>
                  <input value={d.title} placeholder="The Endless Knot" onChange={(e) => setField('title', e.target.value)} onBlur={() => persist(d, { silent: true })} style={{ ...fieldStyle, fontSize: 15 }} />
                </div>
                <div>
                  <label style={labelStyle}>Slug (URL)</label>
                  <input value={d.slug} placeholder={slugPreview} onChange={(e) => setField('slug', e.target.value)} onBlur={() => persist(d, { silent: true })} style={fieldStyle} />
                  <div style={{ fontSize: 10.5, color: T.faint, marginTop: 5 }}>/explore/topic/{slugPreview}</div>
                </div>
                <div>
                  <label style={labelStyle}>Subtitle (native names)</label>
                  <input value={d.subtitle} placeholder="Palbeu · དཔལ་བེའུ" onChange={(e) => setField('subtitle', e.target.value)} onBlur={() => persist(d, { silent: true })} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Aliases (comma separated — search &amp; imports)</label>
                  <input value={(d.aliases || []).join(', ')} placeholder="Eternal Knot, Shrivatsa, Palbeu"
                    onChange={(e) => setField('aliases', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                    onBlur={() => persist(d, { silent: true })} style={fieldStyle} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>Excerpt (card text + meta description)</label>
                <textarea value={d.excerpt} rows={2} placeholder="One or two sentences." onChange={(e) => setField('excerpt', e.target.value)} onBlur={() => persist(d, { silent: true })} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={labelStyle}>Hero image</label>
                  <ImageUpload value={d.heroImage} folder={uploadFolder} busyKey="hero" busy={busy} setBusy={setBusy}
                    onChange={(url) => persist({ ...(draftRef.current || d), heroImage: url }, { silent: true })} />
                </div>
                {d.heroImage && (
                  <div style={{ width: 170 }}>
                    <label style={labelStyle}>Focal point (x% y%)</label>
                    <input value={d.heroPos} placeholder="50% 35%" onChange={(e) => setField('heroPos', e.target.value)} onBlur={() => persist(d, { silent: true })} style={fieldStyle} />
                  </div>
                )}
              </div>
            </div>

            {/* Groups (writes to the group docs) */}
            <div style={card}>
              <h3 style={headStyle}>Shelves (Groups)</h3>
              {groupsArr.length === 0 && <div style={{ fontSize: 12.5, color: T.muted }}>No groups yet — create shelves in the Groups view.</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {groupsArr.map((g) => {
                  const on = editKey !== '__new__' && (g.topicSlugs || []).includes(editKey);
                  return (
                    <button key={g.slug} disabled={editKey === '__new__'}
                      onClick={() => setTopicInGroup(g.slug, editKey, !on)}
                      title={editKey === '__new__' ? 'Save the topic first' : (on ? 'Remove from this shelf' : 'Add to the end of this shelf')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', fontSize: 12, cursor: editKey === '__new__' ? 'not-allowed' : 'pointer', fontFamily: T.sans, border: `1px solid ${on ? T.accent : T.line2}`, background: on ? 'rgba(138,106,59,0.12)' : T.card, color: on ? T.accent : T.muted, opacity: editKey === '__new__' ? 0.5 : 1 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? T.accent : T.line2 }} />{g.name}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 8, lineHeight: 1.6 }}>
                Ticking adds this topic to the end of that shelf (membership lives on the group). Reorder a shelf from the Groups view.
                {editKey === '__new__' && ' Save the topic first.'}
              </div>
            </div>

            {/* Linked pieces (writes to product overrides) */}
            <div style={card}>
              <h3 style={headStyle}>Linked pieces</h3>
              {editKey === '__new__' ? (
                <div style={{ fontSize: 12.5, color: T.muted }}>Save the topic first, then link the pieces that bear this symbol.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {linked.map((p) => (
                      <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${T.line2}`, background: T.card, padding: '5px 9px', fontSize: 12 }}>
                        {p.name}{p.salesCode ? ` · ${p.salesCode}` : ''}
                        <button type="button" onClick={() => toggleProductTopic(p.id, editKey)}
                          style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
                      </span>
                    ))}
                    {linked.length === 0 && <span style={{ fontSize: 12.5, color: T.muted }}>Nothing linked yet.</span>}
                  </div>
                  <SearchPick label="Link a piece" items={SITE_PRODUCTS.filter((p) => !(p.topics || []).includes(editKey))}
                    renderLabel={(p) => `${p.name}${p.salesCode ? ' · ' + p.salesCode : ''}`}
                    onPick={(p) => toggleProductTopic(p.id, editKey)} />
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 8, lineHeight: 1.6 }}>
                    Writes the link onto the piece itself — also editable from the item’s drawer in Inventory (“Symbolism”).
                  </div>
                </>
              )}
            </div>

            {/* Blocks */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <h3 style={{ ...headStyle, margin: 0 }}>Content blocks</h3>
                <SearchPick label="Add block" items={BLOCK_TYPES} renderLabel={(t) => t.label} width={240}
                  onPick={(t) => addBlock(t.type)} />
              </div>
              {(d.blocks || []).length === 0 && (
                <div style={{ padding: 22, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 17 }}>
                  No content yet — add a Text block to begin.
                </div>
              )}
              {(d.blocks || []).map((b, i) => (
                <div key={b.id || i} style={{ border: `1px solid ${blockOpen === b.id ? T.accent : T.line}`, marginBottom: 8, background: T.card }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                    <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.accent, border: `1px solid ${T.line2}`, padding: '3px 7px', whiteSpace: 'nowrap' }}>{BLOCK_LABEL[b.type] || b.type}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{blockSummary(b)}</span>
                    <button type="button" disabled={i === 0} onClick={() => moveBlock(i, -1)} style={{ ...ghostBtn(i === 0), padding: '4px 8px', fontSize: 10 }}>▲</button>
                    <button type="button" disabled={i === (d.blocks || []).length - 1} onClick={() => moveBlock(i, 1)} style={{ ...ghostBtn(i === (d.blocks || []).length - 1), padding: '4px 8px', fontSize: 10 }}>▼</button>
                    <button type="button" onClick={() => setBlockOpen(blockOpen === b.id ? null : b.id)} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 10 }}>{blockOpen === b.id ? 'Close' : 'Edit'}</button>
                    <button type="button" onClick={() => { if (confirm('Remove this block?')) removeBlock(b.id); }}
                      style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '4px 8px', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}>✕</button>
                  </div>
                  {blockOpen === b.id && (
                    <div style={{ padding: '4px 12px 14px', borderTop: `1px solid ${T.line}` }}>
                      <BlockForm block={b} setBlock={setBlock} products={SITE_PRODUCTS} byId={SITE_BY_ID}
                        topicsArr={topicsArr.filter((t) => t.slug !== editKey)} uploadFolder={uploadFolder}
                        busy={busy} setBusy={setBusy} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {editKey !== '__new__' && <RevisionHistory slug={editKey} onRestore={restoreRevision} />}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {editKey !== '__new__'
                ? <button onClick={() => removeTopic(editKey)} style={{ ...ghostBtn(), color: T.danger, borderColor: T.line2 }}>Delete topic</button>
                : <span />}
              <button onClick={() => persist(d)} style={primaryBtn}>Save</button>
            </div>
          </div>

          {/* Live preview — the production renderer inside a storefront-scoped pane */}
          {showPreview && (
            <div style={{ position: 'sticky', top: 76 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.muted, marginBottom: 8 }}>Live preview</div>
              <div className="malaya-site" style={{ background: '#fff', border: `1px solid ${T.line2}`, overflow: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
                <div className="explore-hero" style={d.heroImage ? { backgroundImage: `url(${d.heroImage})`, backgroundPosition: d.heroPos || 'center' } : undefined}>
                  <div style={{ padding: '34px 26px', position: 'relative' }}>
                    <span className="explore-hero-kicker">Explore</span>
                    <h1 className="explore-hero-title" style={{ fontSize: 30 }}>{d.title || 'Untitled topic'}</h1>
                    {d.subtitle && <span className="explore-hero-sub">{d.subtitle}</span>}
                  </div>
                </div>
                <div style={{ padding: '22px 26px 34px' }}>
                  <BlockRenderer blocks={d.blocks || []} ctx={previewCtx} />
                </div>
              </div>
            </div>
          )}
        </div>
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  // ── List views ──────────────────────────────────────────────────────────────
  const filteredTopics = topicSearch.trim()
    ? topicsArr.filter((t) => `${t.title} ${t.slug} ${(t.aliases || []).join(' ')}`.toLowerCase().includes(topicSearch.trim().toLowerCase()))
    : topicsArr;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '30px 28px 80px' }} className="adm-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: T.serif, fontSize: 30, color: T.ink, margin: '0 0 6px' }}>Explore</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
            Knowledge topics (editorial pages) and the shelves that curate them. Draft topics never show on the site.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}` }}>
            {[['topics', `Topics (${topicsArr.length})`], ['groups', `Groups (${groupsArr.length})`]].map(([k, lbl]) => (
              <button key={k} onClick={() => setView(k)}
                style={{ padding: '9px 16px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans, border: 'none', background: view === k ? T.ink : T.card, color: view === k ? T.panel : T.ink }}>{lbl}</button>
            ))}
          </div>
          {view === 'topics'
            ? <button onClick={newTopic} style={primaryBtn}>New topic</button>
            : <button onClick={() => {
                const name = prompt('Shelf name (e.g. Protective Deities):');
                if (!name || !name.trim()) return;
                let slug = slugify(name);
                if (RESERVED_GROUP_SLUGS.includes(slug)) { alert(`“${slug}” is reserved by the site's routes — pick another name.`); return; }
                let i = 2; const base = slug;
                while (data.groups[slug]) { slug = `${base}-${i}`; i += 1; }
                const maxOrder = groupsArr.reduce((m, g) => Math.max(m, g.order || 0), 0);
                putGroup(slug, { ...blankGroup(maxOrder + 1), slug, name: name.trim() });
                flash('Shelf created');
              }} style={primaryBtn}>New group</button>}
        </div>
      </div>
      {!FIREBASE_ENABLED && (
        <div style={{ ...card, background: T.card, borderColor: T.danger, color: T.danger, fontSize: 13, marginTop: 16 }}>
          Firebase is not configured — Explore content saves locally to this browser only and image uploads are disabled.
        </div>
      )}

      {view === 'topics' ? (
        <>
          {topicsArr.length > 8 && (
            <input value={topicSearch} onChange={(e) => setTopicSearch(e.target.value)} placeholder="Filter topics…"
              style={{ ...fieldStyle, marginTop: 16, maxWidth: 320 }} />
          )}
          <div style={{ ...card, marginTop: 16, padding: 0 }}>
            {filteredTopics.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20 }}>
                {topicsArr.length === 0 ? 'No topics yet.' : 'No topics match.'}
              </div>
            )}
            {filteredTopics.map((t) => {
              const shelves = groupsArr.filter((g) => (g.topicSlugs || []).includes(t.slug));
              const pieces = topicProducts(t.slug, SITE_PRODUCTS).length;
              return (
                <div key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ width: 54, height: 40, flexShrink: 0, background: T.card, border: `1px solid ${T.line2}`, overflow: 'hidden' }}>
                    {t.heroImage ? <img src={t.heroImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} /> : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.serif, fontSize: 17, color: T.ink, lineHeight: 1.2 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: T.faint, marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ color: t.published ? T.good : T.faint }}>{t.published ? '● published' : '○ draft'}</span>
                      <span>{shelves.length ? shelves.map((g) => g.name).join(' · ') : 'no shelf'}</span>
                      <span>{pieces} linked piece{pieces === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <a href={`/explore/topic/${t.slug}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn(), padding: '7px 14px', fontSize: 10, textDecoration: 'none' }}>View ↗</a>
                  <button onClick={() => openTopic(t.slug)} style={{ ...ghostBtn(), padding: '7px 14px', fontSize: 10 }}>Edit</button>
                  <button onClick={() => removeTopic(t.slug)} title="Delete" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '7px 9px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans }}>🗑</button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 16 }}>
          {groupsArr.length === 0 && (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20 }}>No shelves yet.</div>
          )}
          {groupsArr.map((g, gi) => (
            <GroupCard key={g.slug} group={g} topicsMap={data.topics}
              canUp={gi > 0} canDown={gi < groupsArr.length - 1}
              onMove={(dir) => {
                const other = groupsArr[gi + dir];
                if (!other) return;
                // Swap navigation order with the neighbour (normalising missing values).
                putGroup(g.slug, { ...g, order: other.order ?? gi + dir + 1 });
                putGroup(other.slug, { ...other, order: g.order ?? gi + 1 });
              }}
              onSave={(next) => putGroup(g.slug, next)}
              onDelete={() => {
                if (!confirm(`Delete the shelf “${g.name}”? Its topics are NOT deleted — they just leave this shelf.`)) return;
                dropGroup(g.slug);
                flash('Shelf deleted');
              }}
              allTopics={topicsArr} />
          ))}
        </div>
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}

// One shelf: name/description/published + the ordered, sortable topic list —
// this IS the §2 relationship model, edited directly.
function GroupCard({ group, topicsMap, allTopics, canUp, canDown, onMove, onSave, onDelete }) {
  const g = group;
  const [name, setName] = useState(g.name || '');
  const [desc, setDesc] = useState(g.description || '');
  useEffect(() => { setName(g.name || ''); }, [g.name]);
  useEffect(() => { setDesc(g.description || ''); }, [g.description]);

  const slugs = g.topicSlugs || [];
  const moveTopic = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= slugs.length) return;
    const a = slugs.slice(); [a[i], a[j]] = [a[j], a[i]];
    onSave({ ...g, topicSlugs: a });
  };
  return (
    <div style={{ ...card }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && onSave({ ...g, name: name.trim() })}
          style={{ ...fieldStyle, fontFamily: T.serif, fontSize: 19, width: 'auto', flex: '1 1 220px', background: 'transparent', border: 'none', borderBottom: `1px solid ${T.line}`, padding: '4px 0' }} />
        <span style={{ fontSize: 10.5, color: T.faint }}>/explore/{g.slug}</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: T.ink, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!g.published} onChange={(e) => onSave({ ...g, published: e.target.checked })} style={{ accentColor: T.accent }} />
          Published
        </label>
        <button disabled={!canUp} onClick={() => onMove(-1)} style={{ ...ghostBtn(!canUp), padding: '5px 9px', fontSize: 10 }}>▲</button>
        <button disabled={!canDown} onClick={() => onMove(1)} style={{ ...ghostBtn(!canDown), padding: '5px 9px', fontSize: 10 }}>▼</button>
        <a href={`/explore/${g.slug}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn(), padding: '5px 12px', fontSize: 10, textDecoration: 'none' }}>View ↗</a>
        <button onClick={onDelete} title="Delete shelf" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '5px 9px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans }}>🗑</button>
      </div>
      <textarea value={desc} rows={2} placeholder="Shelf description (shown on the listing pages)."
        onChange={(e) => setDesc(e.target.value)} onBlur={() => onSave({ ...g, description: desc })}
        style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6, marginBottom: 12 }} />
      <div style={{ display: 'grid', gap: 6 }}>
        {slugs.map((slug, i) => {
          const t = topicsMap[slug];
          return (
            <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${T.line}`, background: T.card, padding: '7px 10px' }}>
              <span style={{ fontSize: 11, color: T.faint, width: 18, textAlign: 'right' }}>{i + 1}.</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: t ? T.ink : T.danger }}>
                {t ? t.title : `${slug} (missing topic)`}
                {t && t.published === false && <span style={{ color: T.faint, fontSize: 11 }}> · draft</span>}
              </span>
              <button disabled={i === 0} onClick={() => moveTopic(i, -1)} style={{ ...ghostBtn(i === 0), padding: '3px 8px', fontSize: 10 }}>▲</button>
              <button disabled={i === slugs.length - 1} onClick={() => moveTopic(i, 1)} style={{ ...ghostBtn(i === slugs.length - 1), padding: '3px 8px', fontSize: 10 }}>▼</button>
              <button onClick={() => onSave({ ...g, topicSlugs: slugs.filter((s) => s !== slug) })}
                style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>×</button>
            </div>
          );
        })}
        {slugs.length === 0 && <div style={{ fontSize: 12.5, color: T.muted, padding: '4px 2px' }}>Empty shelf — add topics below.</div>}
      </div>
      <div style={{ marginTop: 10 }}>
        <SearchPick label="Add topic" items={allTopics.filter((t) => !slugs.includes(t.slug))}
          renderLabel={(t) => `${t.title}${t.published === false ? ' (draft)' : ''}`}
          onPick={(t) => onSave({ ...g, topicSlugs: [...slugs, t.slug] })} />
      </div>
    </div>
  );
}
