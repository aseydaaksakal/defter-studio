// Defter Studio — küçük arayüz yardımcıları
import { marked } from './vendor/marked.esm.js';
import DOMPurify from './vendor/purify.es.mjs';

// Koşullu içerikte (cond ? el : null) boş değerlerin "null" yazısı olarak görünmesini engelle
for (const name of ['replaceChildren', 'append']) {
  const orig = Element.prototype[name];
  Element.prototype[name] = function (...k) { return orig.apply(this, k.filter((x) => x !== null && x !== undefined && x !== false)); };
}

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

const P = {
  audio: 'M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2',
  slides: 'M3 5h18v12H3zM8 21h8M12 17v4',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  mindmap: 'M4 12h4M8 12l4-6h4M8 12l4 6h4M12 12h4M16 6h4M16 12h4M16 18h4',
  report: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
  cards: 'M7 4h13v13H7zM4 7v13h13',
  quiz: 'M4 4h16v16H4zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  infographic: 'M5 20V10M10 20V4M15 20v-7M20 20v-4',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
  plus: 'M12 5v14M5 12h14', close: 'M6 6l12 12M18 6L6 18', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', more: 'M12 5h.01M12 12h.01M12 19h.01', play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z', back: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7', send: 'M4 12l16-8-6 16-2-7z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14', history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .2-1.3-1.3.2-2-3-1-1 2h-1.8l-1-2-3 1 .2 2L5 7.2 3 7 2 10l2 1v1.8l-2 1 1 3 2-.2 1.3 1.3-.2 2 3 1 1-2h1.8l1 2 3-1-.2-2 1.3-1.3 2 .2 1-3-2-1z',
  check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18', bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14', copy: 'M8 8h12v12H8zM4 16V4h12', refresh: 'M20 11a8 8 0 1 0-2 6M20 5v6h-6',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5', sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  shuffle: 'M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M18 4l2 3-2 3M18 14l2 3-2 3', speed: 'M12 14l4-4M4 18a8 8 0 1 1 16 0'
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || P.note); s.append(p);
  return s;
}

export function toast(msg, kind = 'info', ms = 3500) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { back.remove(); onClose && onClose(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn round', 'aria-label': 'Kapat', onclick: close }, icon('close'))),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', { class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : 'ghost'), onclick: () => a.run(close) }, a.label))) : null));
  document.body.append(back);
  document.addEventListener('keydown', esc);
  setTimeout(() => back.querySelector('input,textarea,button.primary')?.focus(), 30);
  return close;
}

export function confirmBox(title, text, okLabel = 'Sil') {
  return new Promise((res) => {
    let done = false;
    modal({
      title, body: h('p', {}, text), onClose: () => { if (!done) res(false); },
      actions: [
        { label: 'Vazgeç', run: (c) => { done = true; res(false); c(); } },
        { label: okLabel, danger: true, run: (c) => { done = true; res(true); c(); } }
      ]
    });
  });
}

export function promptBox(title, value = '') {
  return new Promise((res) => {
    const inp = h('input', { class: 'input', value });
    let done = false;
    const ok = (c) => { done = true; res(inp.value.trim()); c(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(close); });
    const close = modal({ title, body: inp, onClose: () => { if (!done) res(null); }, actions: [{ label: 'Vazgeç', run: (c) => { done = true; res(null); c(); } }, { label: 'Kaydet', primary: true, run: ok }] });
  });
}

// Markdown → güvenli HTML; [3] numaralarını tıklanabilir kaynak rozetlerine çevirir
export function renderMarkdown(md, refs = []) {
  const html = DOMPurify.sanitize(marked.parse(md || '', { gfm: true, breaks: false }));
  const div = h('div', { class: 'md', html });
  if (refs.length) linkCitations(div, refs);
  return div;
}

export function linkCitations(root, refs) {
  const byN = Object.fromEntries(refs.map((r) => [r.n, r]));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (/\[\d+\]/.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(/(\[\d+\])/).forEach((part) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (m && byN[m[1]]) frag.append(citeChip(byN[m[1]]));
      else frag.append(part);
    });
    n.replaceWith(frag);
  }
}

export function citeChip(ref) {
  const b = h('button', { class: 'cite', title: ref.title + (ref.page ? ' · s.' + ref.page : ''), 'aria-label': 'Kaynak ' + ref.n }, String(ref.n));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.cite-pop').forEach((p) => p.remove());
    const pop = h('div', { class: 'cite-pop' },
      h('div', { class: 'cite-pop-head' }, h('b', {}, ref.title), ref.page ? ' · sayfa ' + ref.page : ''),
      h('div', { class: 'cite-pop-text' }, ref.text));
    document.body.append(pop);
    const r = b.getBoundingClientRect();
    const top = Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 6);
    pop.style.top = Math.max(8, top) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left - 40)) + 'px';
    setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 0);
  });
  return b;
}

export function download(name, blobOrText, type = 'text/plain') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const slug = (s) => (s || 'defter').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);

export function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'az önce';
  if (s < 3600) return Math.floor(s / 60) + ' dk önce';
  if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
  return Math.floor(s / 86400) + ' gün önce';
}
export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
