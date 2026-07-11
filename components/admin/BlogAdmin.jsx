'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Blog admin — author Markdown posts with a live preview and Obsidian-style
// cross-linking. Posts save to Firestore (collection `blogPosts`) via lib/blog.js
// and appear on /blog immediately. The body supports GitHub-flavoured Markdown
// plus [[wiki links]] to other posts, products and pages; the "Insert link" picker
// writes the right [[…]] for you, and "Insert image" uploads + embeds a photo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { T, ghostBtn } from './theme';
import { subscribeBlog, saveBlogPost, deleteBlogPost, blogList, slugify } from '@/lib/blog';
import { loadTopics } from '@/lib/explore';
import { uploadImage } from '@/lib/upload';
import { resizeImageFile } from '@/lib/image-resize';
import { FIREBASE_ENABLED } from '@/lib/firebase';
import { buildSiteData } from '@/lib/data/site-data';
import { loadOverrides } from '@/lib/overrides';
import Markdown from '@/components/store/site/Markdown';

const card = { background: T.panel, border: `1px solid ${T.line}`, padding: '18px 20px', marginBottom: 16 };
const headStyle = { fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accent, margin: '0 0 14px' };
const labelStyle = { fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.muted, marginBottom: 6, display: 'block' };
const fieldStyle = { width: '100%', background: T.card, border: `1px solid ${T.line2}`, color: T.ink, padding: '10px 12px', fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' };
const linkBtn = { background: 'transparent', border: 'none', color: T.danger, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', padding: 0 };
const today = () => new Date().toISOString().slice(0, 10);

function blankPost() {
  return { slug: '', title: '', date: today(), excerpt: '', cover: '', tags: [], body: '', published: false };
}

export default function BlogAdmin() {
  const [posts, setPosts] = useState({});
  const [editKey, setEditKey] = useState(null); // null = list, '__new__' = unsaved, else slug
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const bodyRef = useRef(null);
  const coverInput = useRef(null);
  const imgInput = useRef(null);
  // Latest draft for async callbacks: an image upload resolves seconds after
  // the render that started it, and persisting the render-time draft would
  // silently revert everything typed while the upload was in flight.
  const draftRef = useRef(null);
  draftRef.current = draft;

  useEffect(() => subscribeBlog(setPosts), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 1800); return () => clearTimeout(t); }, [toast]);

  // Catalogue products + posts + Explore topics, for resolving cross-links in
  // the live preview.
  const products = useMemo(() => { try { return buildSiteData(loadOverrides()).SITE_PRODUCTS; } catch { return []; } }, []);
  const topics = useMemo(() => Object.values(loadTopics()), []);
  const postsArr = useMemo(() => Object.values(posts), [posts]);
  const list = blogList(posts);

  const newPost = () => { setDraft(blankPost()); setEditKey('__new__'); setShowPreview(true); };
  const openPost = (slug) => { setDraft({ ...blankPost(), ...posts[slug] }); setEditKey(slug); };
  const closeEditor = () => { setEditKey(null); setDraft(null); };
  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const uniqueSlug = (base) => {
    let s = base || 'post'; let i = 2;
    while (s !== editKey && posts[s]) { s = `${base}-${i}`; i += 1; }
    return s;
  };

  // Save the current draft (handles slug rename). Returns the persisted slug or null.
  const persist = (next, { silent } = {}) => {
    const d = next || draft;
    if (!d || !d.title.trim()) { setDraft(d); return null; }
    let slug = slugify(d.slug || d.title);
    if (editKey === '__new__') slug = uniqueSlug(slug);
    const post = {
      slug, title: d.title.trim(), date: d.date || '', excerpt: d.excerpt || '',
      cover: d.cover || '', tags: (d.tags || []).filter(Boolean), body: d.body || '',
      published: !!d.published,
    };
    if (editKey && editKey !== '__new__' && editKey !== slug) deleteBlogPost(editKey);
    saveBlogPost(slug, post);
    setEditKey(slug);
    setDraft({ ...d, slug });
    if (!silent) setToast('Saved');
    return slug;
  };

  const removePost = (slug) => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    deleteBlogPost(slug);
    if (editKey === slug) closeEditor();
    setToast('Deleted');
  };

  const uploadTo = async (key, file, onUrl) => {
    if (!FIREBASE_ENABLED) { alert('Connect Firebase to upload images.'); return; }
    setBusy(key);
    try { onUrl(await uploadImage('blog/' + (slugify(draft.slug || draft.title) || 'post'), await resizeImageFile(file))); }
    catch (e) { alert('Upload failed: ' + (e && e.message ? e.message : String(e))); }
    finally { setBusy(''); }
  };

  const insertAtCursor = (snippet) => {
    const el = bodyRef.current;
    const cur = (draftRef.current || draft).body || '';
    const start = el ? el.selectionStart : cur.length;
    const end = el ? el.selectionEnd : cur.length;
    const nextBody = cur.slice(0, start) + snippet + cur.slice(end);
    setField('body', nextBody);
    requestAnimationFrame(() => { if (el) { const pos = start + snippet.length; el.focus(); el.setSelectionRange(pos, pos); } });
  };

  // ── List view ──
  if (editKey === null) {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '30px 28px 80px' }} className="adm-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontSize: 30, color: T.ink, margin: '0 0 6px' }}>Blog</h2>
            <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>Write Markdown posts with live preview and cross-links to posts, products and pages.</p>
          </div>
          <button onClick={newPost} style={{ background: T.ink, color: T.panel, border: 'none', padding: '12px 20px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>New post</button>
        </div>
        {!FIREBASE_ENABLED && (
          <div style={{ ...card, background: T.card, borderColor: T.danger, color: T.danger, fontSize: 13, marginTop: 16 }}>
            Firebase is not configured — posts save locally to this browser only and image uploads are disabled.
          </div>
        )}
        <div style={{ ...card, marginTop: 16, padding: 0 }}>
          {list.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20 }}>No posts yet.</div>}
          {list.map((p) => (
            <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ width: 54, height: 40, flexShrink: 0, background: T.card, border: `1px solid ${T.line2}`, overflow: 'hidden' }}>
                {p.cover ? <img src={p.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} /> : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.serif, fontSize: 17, color: T.ink, lineHeight: 1.2 }}>{p.title}</div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{p.date || '—'}</span>
                  <span style={{ color: p.published ? T.good : T.faint }}>{p.published ? '● published' : '○ draft'}</span>
                  <span>/blog/{p.slug}</span>
                </div>
              </div>
              <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn(), padding: '7px 14px', fontSize: 10, textDecoration: 'none' }}>View ↗</a>
              <button onClick={() => openPost(p.slug)} style={{ ...ghostBtn(), padding: '7px 14px', fontSize: 10 }}>Edit</button>
              <button onClick={() => removePost(p.slug)} title="Delete" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '7px 9px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans }}>🗑</button>
            </div>
          ))}
        </div>
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  // ── Editor view ──
  const d = draft || blankPost();
  const slugPreview = slugify(d.slug || d.title) || 'post';

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 80px' }} className="adm-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <button onClick={closeEditor} style={{ ...ghostBtn(), padding: '8px 14px' }}>← All posts</button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.ink, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!d.published} onChange={(e) => persist({ ...d, published: e.target.checked })} style={{ accentColor: T.accent }} />
            Published
          </label>
          <button onClick={() => setShowPreview((s) => !s)} style={{ ...ghostBtn(), padding: '8px 14px' }}>{showPreview ? 'Hide preview' : 'Show preview'}</button>
          <button onClick={() => persist(d)} style={{ background: T.ink, color: T.panel, border: 'none', padding: '10px 22px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Save</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input value={d.title} placeholder="Post title" onChange={(e) => setField('title', e.target.value)} onBlur={() => persist(d, { silent: true })} style={{ ...fieldStyle, fontSize: 15 }} />
          </div>
          <div>
            <label style={labelStyle}>Slug (URL)</label>
            <input value={d.slug} placeholder={slugPreview} onChange={(e) => setField('slug', e.target.value)} onBlur={() => persist(d, { silent: true })} style={fieldStyle} />
            <div style={{ fontSize: 10.5, color: T.faint, marginTop: 5 }}>/blog/{slugPreview}</div>
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={d.date} onChange={(e) => setField('date', e.target.value)} onBlur={() => persist(d, { silent: true })} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Tags (comma separated)</label>
            <input value={(d.tags || []).join(', ')} placeholder="Dorje, Ritual, Craft" onChange={(e) => setField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} onBlur={() => persist(d, { silent: true })} style={fieldStyle} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Excerpt (shown on the blog index)</label>
          <textarea value={d.excerpt} rows={2} placeholder="One or two lines summarising the post." onChange={(e) => setField('excerpt', e.target.value)} onBlur={() => persist(d, { silent: true })} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 120, height: 80, flexShrink: 0, background: T.card, border: `1px solid ${T.line2}`, overflow: 'hidden' }}>
            {d.cover ? <img src={d.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} /> : null}
          </div>
          <div>
            <label style={labelStyle}>Cover image</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" disabled={busy === 'cover'} onClick={() => coverInput.current && coverInput.current.click()} style={ghostBtn(busy === 'cover')}>{busy === 'cover' ? 'Uploading…' : (d.cover ? 'Replace' : 'Upload')}</button>
              {d.cover && <button onClick={() => persist({ ...d, cover: '' })} style={linkBtn}>Remove</button>}
            </div>
            <input ref={coverInput} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) uploadTo('cover', f, (url) => persist({ ...(draftRef.current || d), cover: url })); }} />
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <h3 style={{ ...headStyle, margin: 0 }}>Content — Markdown</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy === 'img'} onClick={() => imgInput.current && imgInput.current.click()} style={ghostBtn(busy === 'img')}>{busy === 'img' ? 'Uploading…' : 'Insert image'}</button>
            <input ref={imgInput} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) uploadTo('img', f, (url) => insertAtCursor(`\n![](${url})\n`)); }} />
            <LinkPicker posts={postsArr} products={products} currentSlug={editKey} onPick={(snippet) => insertAtCursor(snippet)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr', gap: 16 }}>
          <textarea ref={bodyRef} value={d.body} rows={22}
            placeholder={'Write in Markdown.\n\n## A heading\n\nUse **bold**, *italic*, lists, and links.\n\nCross-link with [[Another Post]], [[product: P045-YGP]] or [[page: about]].'}
            onChange={(e) => setField('body', e.target.value)} onBlur={() => persist(d, { silent: true })}
            style={{ ...fieldStyle, resize: 'vertical', minHeight: 360, lineHeight: 1.7, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13 }} />
          {showPreview && (
            <div className="malaya-site" style={{ background: '#fff', border: `1px solid ${T.line2}`, padding: '16px 20px', overflow: 'auto', maxHeight: 560 }}>
              <Markdown source={d.body} posts={postsArr} products={products} topics={topics} />
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 10, lineHeight: 1.7 }}>
          Cross-links: <code>[[Post Title]]</code>, <code>[[product: P045-YGP]]</code>, <code>[[page: about#story]]</code>, alias with <code>[[target|label]]</code>. Embed an image with <code>![alt](url)</code>.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {editKey !== '__new__'
          ? <button onClick={() => removePost(editKey)} style={{ ...ghostBtn(), color: T.danger, borderColor: T.line2 }}>Delete post</button>
          : <span />}
        <button onClick={() => persist(d)} style={{ background: T.ink, color: T.panel, border: 'none', padding: '11px 26px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Save</button>
      </div>
      {toast && <Toast text={toast} />}
    </div>
  );
}

function Toast({ text }) {
  return <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: T.ink, color: T.panel, padding: '12px 22px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{text}</div>;
}

// Dropdown that inserts the right [[wiki link]] for a chosen post, product or page.
function LinkPicker({ posts, products, currentSlug, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const otherPosts = posts.filter((p) => p && p.slug && p.slug !== currentSlug && (!query || p.title.toLowerCase().includes(query)));
  const prod = (query ? products.filter((p) => `${p.name} ${p.salesCode || ''}`.toLowerCase().includes(query)) : products).slice(0, 40);
  const pages = [['Home', 'home'], ['About', 'about'], ['Tashi Mannox', 'tashi'], ['Contact', 'contact'], ['Blog', 'blog']]
    .filter(([label]) => !query || label.toLowerCase().includes(query));
  const pick = (snippet) => { onPick(snippet); setOpen(false); setQ(''); };
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={ghostBtn()}>Insert link ▾</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 320, maxHeight: 380, overflow: 'auto', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 18px 40px rgba(0,0,0,0.2)', zIndex: 41, padding: 10 }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts & products…" style={{ ...fieldStyle, marginBottom: 8 }} />
            {pages.length > 0 && <PickGroup label="Pages" items={pages.map(([label, key]) => ({ label, snippet: `[[page: ${key}]]` }))} onPick={pick} />}
            {otherPosts.length > 0 && <PickGroup label="Posts" items={otherPosts.map((p) => ({ label: p.title, snippet: `[[post: ${p.slug}]]` }))} onPick={pick} />}
            {prod.length > 0 && <PickGroup label="Products" items={prod.map((p) => ({ label: `${p.name}${p.salesCode ? ' · ' + p.salesCode : ''}`, snippet: `[[product: ${p.salesCode || p.id}]]` }))} onPick={pick} />}
            {pages.length + otherPosts.length + prod.length === 0 && <div style={{ padding: 12, fontSize: 12, color: T.muted }}>No matches.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function PickGroup({ label, items, onPick }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.accent, margin: '6px 4px' }}>{label}</div>
      {items.map((it, i) => (
        <button key={it.snippet + i} type="button" onClick={() => onPick(it.snippet)}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '7px 8px', fontSize: 12.5, color: T.ink, cursor: 'pointer', fontFamily: T.sans, borderRadius: 3 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.card; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
