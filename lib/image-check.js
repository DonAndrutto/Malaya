// Preview-only diagnostics. No device/account/network identifiers or telemetry.
// The three asset URLs already appear in the public storefront.
import { createHash } from 'node:crypto';
import { buildSiteData, resolveHeroSlides } from './data/site-data';

export function imageCheckAllowed(vercelEnv, nodeEnv) {
  return vercelEnv === 'preview' || nodeEnv === 'development';
}

export function imageCheckSamples(overrides, settings) {
  const { SITE_PRODUCTS, SITE_BY_ID } = buildSiteData(overrides || {});
  const catalogue = SITE_PRODUCTS.find((p) => p.category === 'Pendants' && p.img);
  const candidates = [
    ['Hero background', resolveHeroSlides(settings || {})[0]?.src],
    ['Catalogue photo', catalogue?.img],
    ['Product photo', SITE_BY_ID.p009?.img],
  ];
  return candidates.flatMap(([label, src]) => {
    try {
      const url = new URL(src);
      return url.protocol === 'https:' && url.hostname === 'firebasestorage.googleapis.com' ? [{ label, src: url.href }] : [];
    } catch { return []; }
  }).slice(0, 3);
}

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const IMAGE_CHECK_SCRIPT = `(() => {
  const runButton = document.getElementById('run');
  const report = document.getElementById('report');
  const progress = document.getElementById('progress');
  const rows = [...document.querySelectorAll('[data-sample]')];
  const summary = () => {
    report.value = ['Image check — results stay on this page.',
      'Control: ' + document.getElementById('control-state').textContent,
      ...rows.flatMap(row => [...row.querySelectorAll('[data-state]')].map(state =>
        row.dataset.label + ' / ' + state.dataset.state + ': ' + state.textContent))
    ].join('\\n').slice(0, 2500);
  };
  function probe(box, src, policy, state, background) {
    return new Promise(resolve => {
      const img = new Image();
      const start = performance.now();
      let done = false;
      const finish = (message) => {
        if (done) return;
        done = true; clearTimeout(timer);
        img.onload = null; img.onerror = null;
        state.textContent = message + ' (' + ((performance.now() - start) / 1000).toFixed(1) + 's)';
        summary(); resolve();
      };
      const timer = setTimeout(() => { finish('timed out'); img.removeAttribute('src'); }, 8000);
      img.alt = 'Diagnostic sample'; img.loading = 'eager'; img.decoding = 'async';
      if (policy) img.referrerPolicy = policy;
      img.onload = async () => {
        try {
          if (typeof img.decode === 'function') await img.decode();
          if (done) return;
          if (!img.naturalWidth || !img.naturalHeight) { finish('no decoded pixels'); return; }
          if (background) background.style.backgroundImage = 'url(' + JSON.stringify(src) + ')';
          finish('loaded ' + img.naturalWidth + '×' + img.naturalHeight);
        } catch { finish('decode failed'); }
      };
      img.onerror = () => finish('image error — browser exposes no HTTP status');
      box.replaceChildren(img); img.src = src;
    });
  }
  async function corsProbe(row) {
    const state = row.querySelector('[data-state="HTTP/CORS"]');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(row.dataset.src, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
      const type = (response.headers.get('content-type') || 'unknown').split(';')[0];
      state.textContent = 'HTTP ' + response.status + ' / ' + (/^[a-z-]+\\/[a-z0-9.+-]+$/i.test(type) ? type : 'unknown');
      if (response.body) response.body.cancel().catch(() => {});
    } catch { state.textContent = controller.signal.aborted ? 'timed out' : 'blocked or failed — status unavailable'; }
    finally { clearTimeout(timer); summary(); }
  }
  async function run() {
    if (runButton.disabled) return;
    runButton.disabled = true;
    progress.textContent = 'Checking. This finishes within about 25 seconds.';
    rows.forEach(row => {
      row.querySelectorAll('[data-state]').forEach(state => { state.textContent = 'waiting'; });
      row.querySelector('[data-background]').style.backgroundImage = 'none';
    });
    const control = document.getElementById('control');
    await Promise.all([
      probe(control, '/api/image-check?control=1', '', document.getElementById('control-state')),
      ...rows.map(row => probe(row.querySelector('[data-normal]'), row.dataset.src, '', row.querySelector('[data-state="Normal image"]'), row.querySelector('[data-background]'))),
    ]);
    await Promise.all(rows.map(row => probe(row.querySelector('[data-no-referrer]'), row.dataset.src, 'no-referrer', row.querySelector('[data-state="No-referrer image"]'))));
    await Promise.all(rows.map(corsProbe));
    progress.textContent = 'Finished. Do the pictures above appear? Copy results or take a screenshot if you choose.';
    runButton.disabled = false; summary();
  }
  runButton.addEventListener('click', run);
  document.getElementById('copy').addEventListener('click', async () => {
    summary(); report.select();
    try { await navigator.clipboard.writeText(report.value); } catch {}
  });
  summary(); run();
})();`;

export function renderImageCheck(samples) {
  const policy = `default-src 'none'; script-src 'sha256-${createHash('sha256').update(IMAGE_CHECK_SCRIPT).digest('base64')}'; style-src 'unsafe-inline'; img-src 'self' https://firebasestorage.googleapis.com; connect-src https://firebasestorage.googleapis.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  const cards = samples.map(({ label, src }) => `<section data-sample data-label="${escape(label)}" data-src="${escape(src)}">
    <h2>${escape(label)}</h2><div class="pictures"><div><span>Normal image</span><div class="picture" data-normal></div><p data-state="Normal image">waiting</p></div><div><span>No referrer</span><div class="picture" data-no-referrer></div><p data-state="No-referrer image">waiting</p></div><div><span>CSS background</span><div class="picture background" data-background></div><p>Set after normal image loads</p></div></div>
    <p data-state="HTTP/CORS">waiting</p><a href="${escape(src)}" target="_blank" rel="noopener noreferrer">Open original image</a>
  </section>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Image check · Malaya preview</title><style>
    *{box-sizing:border-box}body{font:15px/1.45 system-ui,sans-serif;color:#222;background:#faf9f6;margin:0;padding:18px;max-width:780px}h1{font-size:25px;margin:0 0 8px}h2{font-size:17px;margin:0 0 8px}p{margin:7px 0}section{background:#fff;border:1px solid #ccc;padding:12px;margin:14px 0}.pictures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.picture{height:86px;display:grid;place-items:center;background:#eee;overflow:hidden;margin-top:5px}.picture img{max-width:100%;max-height:86px;object-fit:contain}.background{background-position:center;background-size:contain;background-repeat:no-repeat}[data-state]{font-size:12px;overflow-wrap:anywhere}.control{display:flex;align-items:center;gap:12px}.control .picture{width:64px;height:46px}.control img{max-height:46px}button{padding:10px 14px;margin:5px 8px 5px 0;font:inherit}textarea{width:100%;min-height:180px;font:12px/1.4 monospace}a{color:#5a3519}small{display:block;color:#555}
  </style></head><body><h1>Preview image check</h1><p>This simple page checks the same public images without the storefront or preview toolbar.</p><small>Results stay on this page. No diagnostic report, device details or network identifiers are collected or sent. Only ordinary requests for these public images are made.</small><div class="control"><div class="picture" id="control"></div><p>Same-site control: <span id="control-state">waiting</span></p></div><button id="run" type="button">Run again</button><p id="progress" role="status">Starting…</p>${cards || '<p>No supported sample image URLs were available.</p>'}<button id="copy" type="button">Copy visible results</button><textarea id="report" readonly aria-label="Visible diagnostic results"></textarea><p><a href="/">Reopen the storefront</a></p><script>${IMAGE_CHECK_SCRIPT}</script></body></html>`;
  return { html, policy };
}
