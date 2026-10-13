// İnfografik: tema + yön seçenekli poster; PNG ve PDF indirme
import { h, icon, download, slug, toast, promptBox } from '../../ui.js';
import { imageSrc, preload, dataUrl } from '../../imagegen.js';
import { illustrate, illustrateOne, imagesAvailable } from '../illustrate.js';

export function poster(c) {
  return h('div', { class: `info-poster o-${c.orientation || 'landscape'} t-${c.theme || 'ocean'}` },
    c.heroKey && imageSrc(c.heroKey) ? h('img', { class: 'ip-hero', src: imageSrc(c.heroKey), 'data-k': c.heroKey, alt: '' }) : null,
    h('header', {}, h('h1', {}, c.title), c.subtitle ? h('p', {}, c.subtitle) : null),
    c.stats?.length ? h('div', { class: 'ip-stats' }, c.stats.slice(0, 4).map((s) => h('div', { class: 'ip-stat' }, h('div', { class: 'v' }, s.value), h('div', { class: 'l' }, s.label)))) : null,
    h('div', { class: 'ip-grid' }, (c.highlights || []).map((x) => h('div', { class: 'ip-box' }, h('div', { class: 'ip-ic' + (x.imgKey && imageSrc(x.imgKey) ? ' has-img' : '') }, x.imgKey && imageSrc(x.imgKey) ? h('img', { src: imageSrc(x.imgKey), 'data-k': x.imgKey, alt: '' }) : (x.icon || '•')), h('div', {}, h('h3', {}, x.heading), h('p', {}, x.text))))),
    c.timeline?.length ? h('div', { class: 'ip-tl' }, c.timeline.map((t) => h('div', { class: 'ip-tl-i' }, h('div', { class: 'd' }, t.date), h('div', { class: 't' }, t.text)))) : null,
    c.compare?.rows?.length ? h('table', { class: 'ip-cmp' }, h('thead', {}, h('tr', {}, (c.compare.columns || []).map((x) => h('th', {}, x)))), h('tbody', {}, c.compare.rows.map((r) => h('tr', {}, r.map((x, i) => (i ? h('td', {}, x) : h('th', {}, x))))))) : null,
    c.takeaway ? h('footer', {}, '★ ', c.takeaway) : null);
}

export function render(root, art, api) {
  const c = art.content;
  const wrap = h('div', { class: 'info-wrap' }, poster(c));
  let gone = false;
  const redraw = () => wrap.replaceChildren(poster(c));
  preload([c.heroKey, ...(c.highlights || []).map((x) => x.imgKey)]).then(() => { if (!gone) redraw(); });
  const imgBtn = h('button', { class: 'btn ghost small', title: 'Başlık ve kutular için yapay zeka görselleri ekler' }, icon('infographic', 16), ' Görselleri üret');
  imgBtn.onclick = async () => {
    if (!(await imagesAvailable())) { toast('Görsel sağlayıcısı yok: Ayarlar › Görseller (Gemini/MiniMax anahtarı ya da lokal ComfyUI).', 'error', 7000); return; }
    imgBtn.disabled = true;
    try {
      if (!c.heroVisual) { const v = await promptBox('Başlık görseli tarifi (İngilizce, yazısız bir sahne)', ''); if (v?.trim()) c.heroVisual = v.trim(); }
      const r = await illustrate('infographic', c, { onlyMissing: true });
      if (!r.total) toast('Görsel tarifi olan öğe yok ya da hepsi hazır.', 'info');
      else { await api.save({ ...c }, `${r.made} görsel eklendi`); toast(`${r.made} görsel eklendi${r.failed ? `, ${r.failed} üretilemedi: ${r.errors[0]}` : ''}`, r.failed ? 'error' : 'ok', 6000); }
      redraw();
    } catch (e) { toast('Görseller üretilemedi: ' + e.message, 'error', 7000); } finally { imgBtn.disabled = false; }
  };
  const heroBtn = h('button', { class: 'btn ghost small', title: 'Başlık görselini yeni tarifle yeniden üretir' }, icon('infographic', 16), ' Başlık görselini yenile');
  heroBtn.onclick = async () => {
    const v = await promptBox('Başlık görseli tarifi (İngilizce, yazısız bir sahne)', c.heroVisual || ''); if (v == null || !v.trim()) return;
    if (!(await imagesAvailable())) { toast('Görsel sağlayıcısı yok: Ayarlar › Görseller.', 'error', 7000); return; }
    heroBtn.disabled = true;
    try { c.heroVisual = v.trim(); c.heroKey = await illustrateOne(c.heroVisual, c.orientation === 'portrait' ? '4:3' : '16:9', c.theme); await api.save({ ...c }, 'Başlık görseli yenilendi'); redraw(); }
    catch (e) { toast('Görsel üretilemedi: ' + e.message, 'error', 7000); } finally { heroBtn.disabled = false; }
  };
  const themes = ['ocean', 'sketch', 'kawaii', 'night', 'paper'];
  const or = ['landscape', 'portrait', 'square'];
  const sel = (arr, key, labels) => h('select', { class: 'input small', onchange: async (e) => { c[key] = e.target.value; wrap.replaceChildren(poster(c)); await api.save({ ...c }, null); } },
    arr.map((v, i) => h('option', { value: v, selected: c[key] === v ? true : null }, labels[i])));
  root.append(h('div', { class: 'info-view' },
    h('div', { class: 'row gap wrap' },
      sel(themes, 'theme', ['Okyanus', 'Çizim Notu', 'Kawaii', 'Gece', 'Kâğıt']),
      sel(or, 'orientation', ['Yatay', 'Dikey', 'Kare']),
      h('span', { class: 'grow' }),
      imgBtn, heroBtn,
      h('button', { class: 'btn ghost small', onclick: () => api.editJSON() }, icon('edit', 16), ' Düzenle'),
      h('button', { class: 'btn ghost small', onclick: () => toPNG(wrap.firstChild, art.title) }, icon('download', 16), ' PNG'),
      h('button', { class: 'btn ghost small', onclick: () => { const b = h('div', { id: 'print-root' }, poster(c)); document.body.append(b); document.body.classList.add('printing'); setTimeout(() => { print(); document.body.classList.remove('printing'); b.remove(); }, 100); } }, icon('download', 16), ' PDF')),
    wrap));
}

// DOM → PNG (SVG foreignObject ile, dış kaynak yok)
async function toPNG(node, title) {
  try {
    const css = [...document.styleSheets].map((ss) => { try { return [...ss.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const r = node.getBoundingClientRect();
    const W = Math.ceil(r.width), H = Math.ceil(r.height);
    const clone = node.cloneNode(true);
    for (const im of clone.querySelectorAll('img[data-k]')) { const d = await dataUrl(im.dataset.k); if (d) im.setAttribute('src', d); } // SVG içinde blob: görsel yüklenmez
    const html = `<div xmlns="http://www.w3.org/1999/xhtml" class="${document.documentElement.className}"><style>${css}</style>${new XMLSerializer().serializeToString(clone)}</div>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
    cv.toBlob((b) => download(slug(title) + '.png', b));
  } catch (e) { toast('PNG oluşturulamadı, PDF seçeneğini deneyin.', 'error'); }
}

export function toText(art) {
  const c = art.content;
  return [`# ${c.title}`, c.subtitle, ...(c.stats || []).map((s) => `- ${s.value}: ${s.label}`), ...(c.highlights || []).map((x) => `## ${x.heading}\n${x.text}`), c.takeaway].filter(Boolean).join('\n\n');
}
