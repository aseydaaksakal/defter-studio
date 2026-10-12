// Zihin Haritası: katlanır dallar, yakınlaştırma, sürükleme, düğüm notu, sohbette sor, SVG/PNG indirme
import { h, icon, download, slug } from '../../ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#bb9af7', '#7dcfff', '#ff9e64'];

export function render(root, art, api) {
  const data = art.content.root || { label: art.title, children: [] };
  let id = 0;
  (function tag(n, d, color) { n._id = id++; n._d = d; n._c = color; n._open = n._open ?? d < 1; (n.children || []).forEach((c, i) => tag(c, d + 1, d === 0 ? COLORS[i % COLORS.length] : color)); })(data, 0, '#a9b1d6');
  data._open = true;

  const svg = s('svg', { class: 'mm-svg', role: 'img', 'aria-label': 'Zihin haritası' });
  const g = s('g');
  svg.append(g);
  const info = h('div', { class: 'mm-info card', hidden: true });
  let scale = 1, tx = 40, ty = 0;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '500 14px system-ui, sans-serif';

  function layout() {
    const nodes = []; let leafY = 0;
    const colX = [0];
    (function walk(n) {
      n._w = Math.min(260, measure.measureText(n.label).width + 34);
      nodes.push(n);
      const kids = n._open ? n.children || [] : [];
      if (!kids.length) { n._y = leafY; leafY += 46; }
      else { kids.forEach(walk); n._y = (kids[0]._y + kids[kids.length - 1]._y) / 2; }
      colX[n._d + 1] = Math.max(colX[n._d + 1] || 0, n._w);
    })(data);
    const xs = [0]; for (let i = 1; i < colX.length; i++) xs[i] = xs[i - 1] + (colX[i] || 0) + 70;
    nodes.forEach((n) => (n._x = xs[n._d]));
    return nodes;
  }

  function draw() {
    g.replaceChildren();
    const nodes = layout();
    for (const n of nodes) {
      if (!n._open) continue;
      for (const c of n.children || []) {
        const x1 = n._x + n._w, y1 = n._y + 17, x2 = c._x, y2 = c._y + 17, mx = (x1 + x2) / 2;
        g.append(s('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, fill: 'none', stroke: c._c, 'stroke-width': 1.6, opacity: 0.8 }));
      }
    }
    for (const n of nodes) {
      const grp = s('g', { transform: `translate(${n._x},${n._y})`, class: 'mm-node', tabindex: 0, role: 'button', 'aria-label': n.label });
      grp.append(s('rect', { width: n._w, height: 34, rx: 9, fill: n._d === 0 ? 'var(--mm-root)' : 'var(--mm-node)', stroke: n._c, 'stroke-width': n._d === 0 ? 0 : 1.2 }));
      const t = s('text', { x: 14, y: 22, fill: 'var(--fg)', 'font-size': 14, 'font-weight': n._d === 0 ? 650 : 500 });
      let label = n.label; while (measure.measureText(label).width > n._w - 30 && label.length > 4) label = label.slice(0, -2);
      t.textContent = label === n.label ? label : label + '…';
      grp.append(t);
      if (n.children?.length) {
        const tog = s('g', { transform: `translate(${n._w + 2},7)`, class: 'mm-tog' });
        tog.append(s('circle', { cx: 10, cy: 10, r: 10, fill: 'var(--chip)' }));
        const tt = s('text', { x: 10, y: 14.5, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--fg)' }); tt.textContent = n._open ? '‹' : '›';
        tog.append(tt);
        tog.addEventListener('click', (e) => { e.stopPropagation(); n._open = !n._open; draw(); });
        grp.append(tog);
      }
      grp.addEventListener('click', () => showInfo(n));
      grp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { n._open = !n._open; draw(); } });
      g.append(grp);
    }
    apply();
  }
  function apply() { g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`); }
  function fit() {
    const b = g.getBBox(), W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    scale = Math.min(1.3, Math.max(0.3, Math.min((W - 60) / (b.width + 40), (H - 40) / (b.height + 20))));
    tx = 30 - b.x * scale; ty = (H - b.height * scale) / 2 - b.y * scale; apply();
  }
  function showInfo(n) {
    info.hidden = false;
    info.replaceChildren(h('b', {}, n.label), n.note ? h('p', {}, n.note) : null,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn small primary', onclick: () => api.ask(`"${n.label}" konusunu kaynaklara dayanarak açıkla.`) }, 'Sohbette sor'),
        h('button', { class: 'btn small ghost', onclick: () => (info.hidden = true) }, 'Kapat')));
  }
  // sürükle & yakınlaştır
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.mm-node')) return; drag = { x: e.clientX - tx, y: e.clientY - ty }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => { if (drag) { tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); } });
  svg.addEventListener('pointerup', () => (drag = null));
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const f = e.deltaY < 0 ? 1.1 : 0.9; const r = svg.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; scale *= f; apply(); }, { passive: false });
  const zoom = (f) => { scale *= f; apply(); };
  const setAll = (open) => { (function w(n) { n._open = open; (n.children || []).forEach(w); })(data); data._open = true; draw(); fit(); };

  const exportSVG = () => {
    const c = svg.cloneNode(true);
    c.setAttribute('xmlns', NS);
    const b = g.getBBox();
    c.querySelector('g').setAttribute('transform', `translate(${20 - b.x},${20 - b.y})`);
    c.setAttribute('width', b.width + 60); c.setAttribute('height', b.height + 40);
    const cs = getComputedStyle(document.body);
    c.setAttribute('style', `background:${cs.getPropertyValue('--bg')};--fg:${cs.getPropertyValue('--fg')};--mm-node:${cs.getPropertyValue('--mm-node')};--mm-root:${cs.getPropertyValue('--mm-root')};--chip:${cs.getPropertyValue('--chip')};font-family:system-ui,sans-serif`);
    return new XMLSerializer().serializeToString(c);
  };
  const png = async () => {
    const str = exportSVG(); const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width * 2; cv.height = img.height * 2;
    const cx = cv.getContext('2d'); cx.scale(2, 2); cx.drawImage(img, 0, 0);
    cv.toBlob((b) => download(slug(art.title) + '.png', b));
  };

  root.append(h('div', { class: 'mm-view' },
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn ghost small', onclick: () => setAll(true) }, 'Tümünü aç'),
      h('button', { class: 'btn ghost small', onclick: () => setAll(false) }, 'Tümünü kapat'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost small', onclick: () => api.editJSON() }, icon('edit', 16), ' Düzenle'),
      h('button', { class: 'btn ghost small', onclick: () => download(slug(art.title) + '.svg', exportSVG(), 'image/svg+xml') }, icon('download', 16), ' SVG'),
      h('button', { class: 'btn ghost small', onclick: png }, icon('download', 16), ' PNG')),
    h('div', { class: 'mm-stage' }, svg,
      h('div', { class: 'mm-zoom' },
        h('button', { class: 'icon-btn round', 'aria-label': 'Sığdır', onclick: fit }, icon('expand', 18)),
        h('button', { class: 'icon-btn round', 'aria-label': 'Yakınlaştır', onclick: () => zoom(1.2) }, icon('plus', 18)),
        h('button', { class: 'icon-btn round', 'aria-label': 'Uzaklaştır', onclick: () => zoom(0.83) }, h('span', { style: 'font-size:20px;line-height:1' }, '−'))),
      info)));
  draw(); requestAnimationFrame(fit);
}

export function toText(art) {
  const out = [];
  (function w(n, d) { out.push('  '.repeat(d) + '- ' + n.label); (n.children || []).forEach((c) => w(c, d + 1)); })(art.content.root || { label: art.title }, 0);
  return out.join('\n');
}
