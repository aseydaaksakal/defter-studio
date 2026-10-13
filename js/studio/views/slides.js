// Slayt Sunusu: temalı slaytlar, küçük resimler, konuşmacı notları, tam ekran, PDF (yazdır), yerinde düzenleme
import { h, icon, toast, download, slug, promptBox } from '../../ui.js';
import { synthesize, loadTTS, ENGINE_SHORT } from '../../tts.js';
import { imageSrc, preload, inlineImages, IMAGE_LAYOUTS } from '../../imagegen.js';
import { illustrate, illustrateOne, imagesAvailable } from '../illustrate.js';

export function slideEl(s, i, deck) {
  const L = s.layout || (i === 0 ? 'title' : 'bullets');
  const ul = (arr) => (arr && arr.length ? h('ul', {}, arr.map((b) => h('li', { 'data-f': 'b' }, b))) : null);
  let inner;
  if (L === 'title') {
    inner = [h('div', { class: 's-icon' }, s.icon || ''), h('h1', { 'data-f': 'title' }, s.title || deck.title), h('p', { class: 's-sub', 'data-f': 'body' }, s.body || deck.subtitle || '')];
  } else if (L === 'stat' && s.stat?.value) {
    inner = [h('h2', { 'data-f': 'title' }, s.title), h('div', { class: 's-stat' }, h('div', { class: 's-stat-v' }, s.stat.value), h('div', { class: 's-stat-l' }, s.stat.label)), ul(s.bullets)];
  } else if (L === 'two-col' && (s.left || s.right)) {
    const col = (c) => h('div', { class: 's-col' }, h('h3', {}, c?.heading || ''), ul(c?.bullets));
    inner = [h('h2', { 'data-f': 'title' }, s.title), h('div', { class: 's-cols' }, col(s.left), col(s.right))];
  } else if (L === 'quote' && s.quote) {
    inner = [h('blockquote', {}, s.quote), h('p', { class: 's-sub' }, s.title)];
  } else if ((L === 'timeline' || L === 'process') && s.items?.length) {
    const tag = L === 'process' ? 'ol' : 'div';
    inner = [h('h2', { 'data-f': 'title' }, s.title), h(tag, { class: L === 'process' ? 's-proc' : 's-tl' }, s.items.slice(0, 7).map((it, k) => h(L === 'process' ? 'li' : 'div', { class: 's-step' }, h('b', {}, it.label || (L === 'process' ? `${k + 1}` : '')), h('span', {}, it.text || ''))))];
  } else if (L === 'chart' && s.chart?.values?.length) {
    const vals = s.chart.values.map((v) => parseFloat(String(v).replace(',', '.')) || 0);
    const max = Math.max(...vals.map(Math.abs), 1e-9);
    inner = [h('h2', { 'data-f': 'title' }, s.title), h('div', { class: 's-chart' }, (s.chart.labels || []).slice(0, 8).map((lb, k) => h('div', { class: 's-bar' },
      h('span', { class: 's-bar-l' }, lb), h('span', { class: 's-bar-t' }, h('span', { class: 's-bar-f', style: { width: Math.round((Math.abs(vals[k]) / max) * 100) + '%' } })),
      h('span', { class: 's-bar-v' }, `${s.chart.values[k]}${s.chart.unit ? ' ' + s.chart.unit : ''}`)))), ul(s.bullets)];
  } else if (L === 'table' && s.table?.rows?.length) {
    inner = [h('h2', { 'data-f': 'title' }, s.title), h('table', { class: 's-table' },
      s.table.columns?.length ? h('thead', {}, h('tr', {}, s.table.columns.map((c) => h('th', {}, String(c))))) : null,
      h('tbody', {}, s.table.rows.slice(0, 7).map((r) => h('tr', {}, (Array.isArray(r) ? r : [r]).map((c) => h('td', {}, String(c)))))))];
  } else {
    inner = [h('h2', { 'data-f': 'title' }, h('span', { class: 's-ic' }, s.icon || ''), s.title), s.body ? h('p', { class: 's-body', 'data-f': 'body' }, s.body) : null, ul(s.bullets)];
  }
  // Yapay zeka görseli: kapakta tam arka plan, diğer düzenlerde sağda resim paneli (grafik/tablo/zaman çizelgesi görselsiz kalır)
  const src = s.imgKey && IMAGE_LAYOUTS.has(L) ? imageSrc(s.imgKey) : null;
  const pic = !src ? [] : L === 'title' ? [h('img', { class: 's-bg', src, alt: '' }), h('div', { class: 's-veil' })] : [h('img', { class: 's-pic', src, alt: s.visual || '' })];
  return h('div', { class: `slide L-${L}${src ? ' has-img' : ''}` }, ...pic, h('div', { class: 's-inner' }, inner), h('div', { class: 's-num' }, i + 1));
}

export function render(root, art, api) {
  const d = art.content;
  const slides = d.slides || [];
  let cur = 0, notes = false, editing = false, gone = false;
  const stage = h('div', { class: `deck theme-${d.theme || 'ocean'}` });
  const thumbs = h('div', { class: 'thumbs', role: 'list' });
  const noteBox = h('div', { class: 'notes card', hidden: true });
  const count = h('span', { class: 'muted' });

  function show(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    stage.replaceChildren(slideEl(slides[cur], cur, d));
    count.textContent = `${cur + 1} / ${slides.length}`;
    noteBox.textContent = slides[cur].notes || 'Bu slayt için konuşmacı notu yok.';
    thumbs.querySelectorAll('.thumb').forEach((t, k) => t.classList.toggle('on', k === cur));
    thumbs.children[cur]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (editing) setEditable(true);
  }
  slides.forEach((s, i) => {
    const t = h('button', { class: `thumb theme-${d.theme || 'ocean'}`, role: 'listitem', 'aria-label': 'Slayt ' + (i + 1), onclick: () => show(i) }, slideEl(s, i, d));
    thumbs.append(t);
  });

  function setEditable(on) {
    stage.querySelectorAll('[data-f]').forEach((n) => (n.contentEditable = on));
    stage.classList.toggle('editing', on);
  }
  async function saveEdit() {
    const s = { ...slides[cur] };
    const t = stage.querySelector('[data-f=title]'); if (t) s.title = t.innerText.trim();
    const b = stage.querySelector('[data-f=body]'); if (b) s.body = b.innerText.trim();
    const lis = [...stage.querySelectorAll('.s-inner > ul [data-f=b]')];
    if (lis.length) s.bullets = lis.map((x) => x.innerText.trim()).filter(Boolean);
    slides[cur] = s;
    await api.save({ ...d, slides }, `Slayt ${cur + 1} düzenlendi`);
    thumbs.children[cur].replaceChildren(slideEl(s, cur, d));
    toast('Slayt kaydedildi');
  }

  // Anlatımlı sunum: konuşmacı notları erkek (ya da seçilen) anlatıcıyla seslendirilir, slaytlar sesle birlikte ilerler
  let narr = null;
  const narrBtn = h('button', { class: 'btn ghost small', title: 'Konuşmacı notlarını seslendirip slaytları otomatik ilerletir' }, icon('play', 16), ' Anlatımlı oynat');
  narrBtn.onclick = async () => {
    if (narr) { narr.pause(); narr = null; narrBtn.replaceChildren(icon('play', 16), ' Anlatımlı oynat'); return; }
    narrBtn.disabled = true;
    try {
      const cfg = await loadTTS();
      const sp = { id: 'A', name: 'Anlatıcı', gender: cfg.narrator === 'f' ? 'f' : 'm', role: 'anlatıcı' };
      const lines = slides.map((x) => ({ speaker: 'A', text: x.notes || [x.title, x.body, ...(x.bullets || [])].filter(Boolean).join('. ') || x.title || '…' }));
      const r = await synthesize(art.id + ':narr', lines, [sp], d.lang || 'Türkçe', { format: 'narration', onProgress: (m) => { count.textContent = m; } });
      narr = new Audio(URL.createObjectURL(r.blob));
      narr.ontimeupdate = () => { const i = r.timings.findLastIndex((t) => narr.currentTime >= t.start - 0.05); if (i >= 0 && i !== cur) show(i); };
      narr.onended = () => { narr = null; narrBtn.replaceChildren(icon('play', 16), ' Anlatımlı oynat'); };
      narr.currentTime = r.timings[cur]?.start || 0;
      await narr.play();
      narrBtn.replaceChildren(icon('pause', 16), ' Durdur');
      toast(`${ENGINE_SHORT[r.engine]} · ${sp.gender === 'm' ? 'erkek' : 'kadın'} anlatıcı`);
    } catch (e) { toast('Anlatım üretilemedi: ' + e.message, 'error', 7000); } finally { narrBtn.disabled = false; show(cur); }
  };

  // Yapay zeka görselleri (Ayarlar › Görseller): eksik görselleri üret / geçerli slaytın görselini yenile
  const redrawAll = () => { slides.forEach((x, k) => thumbs.children[k]?.replaceChildren(slideEl(x, k, d))); show(cur); };
  const layoutOf = (x, k) => x.layout || (k === 0 ? 'title' : 'bullets');
  const needAvail = async () => { if (await imagesAvailable()) return true; toast('Görsel sağlayıcısı yok: Ayarlar › Görseller (Gemini/MiniMax anahtarı ya da lokal ComfyUI).', 'error', 7000); return false; };
  const imgBtn = h('button', { class: 'btn ghost small', title: 'Kaynakla ilgili yapay zeka görselleri ekler' }, icon('infographic', 16), ' Görselleri üret');
  imgBtn.onclick = async () => {
    if (!(await needAvail())) return;
    imgBtn.disabled = true;
    try {
      const r = await illustrate('slides', d, { onProgress: (n, m) => { count.textContent = `Görsel ${n}/${m}`; } });
      if (!r.total) toast(slides.some((x) => x.imgKey) ? 'Tüm slaytların görseli hazır.' : 'Bu sunuda görsel tarifi yok; sunuyu yeniden üretince eklenir ya da slayt başına "Görseli yenile"yi kullanın.', 'info', 6000);
      else { await api.save({ ...d, slides }, `${r.made} görsel eklendi`); toast(`${r.made} görsel eklendi${r.failed ? `, ${r.failed} üretilemedi: ${r.errors[0]}` : ''}`, r.failed ? 'error' : 'ok', 6000); }
      redrawAll();
    } catch (e) { toast('Görseller üretilemedi: ' + e.message, 'error', 7000); } finally { imgBtn.disabled = false; }
  };
  const regenBtn = h('button', { class: 'btn ghost small', title: 'Geçerli slaytın görselini (yeni tarifle) yeniden üretir' }, icon('infographic', 16), ' Görseli yenile');
  regenBtn.onclick = async () => {
    const x = slides[cur], L = layoutOf(x, cur);
    if (!IMAGE_LAYOUTS.has(L)) { toast('Bu düzen (grafik, tablo, zaman çizelgesi, adımlar) görsel almaz.', 'info'); return; }
    const v = await promptBox('Görsel tarifi (İngilizce, yazısız bir sahne)', x.visual || ''); if (v == null || !v.trim()) return;
    if (!(await needAvail())) return;
    regenBtn.disabled = true;
    try { x.visual = v.trim(); x.imgKey = await illustrateOne(x.visual, L === 'title' ? '16:9' : '4:3', d.theme); await api.save({ ...d, slides }, `Slayt ${cur + 1} görseli yenilendi`); redrawAll(); }
    catch (e) { toast('Görsel üretilemedi: ' + e.message, 'error', 7000); } finally { regenBtn.disabled = false; }
  };
  preload(slides.map((x) => x.imgKey)).then(() => { if (!gone) redrawAll(); });

  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Düzenle');
  editBtn.onclick = async () => { if (editing) await saveEdit(); editing = !editing; setEditable(editing); editBtn.replaceChildren(icon(editing ? 'check' : 'edit', 16), editing ? ' Kaydet' : ' Düzenle'); };

  const key = (e) => {
    if (editing || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); show(cur + 1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); show(cur - 1); }
  };
  document.addEventListener('keydown', key);

  root.append(h('div', { class: 'slides-view' },
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'icon-btn', 'aria-label': 'Önceki', onclick: () => show(cur - 1) }, icon('back')), count,
      h('button', { class: 'icon-btn', 'aria-label': 'Sonraki', onclick: () => show(cur + 1) }, icon('next')),
      h('span', { class: 'grow' }),
      narrBtn, imgBtn, regenBtn, editBtn,
      h('button', { class: 'btn ghost small', onclick: () => { notes = !notes; noteBox.hidden = !notes; } }, icon('note', 16), ' Notlar'),
      h('button', { class: 'btn ghost small', onclick: () => stage.requestFullscreen?.() }, icon('expand', 16), ' Sun'),
      h('button', { class: 'btn ghost small', onclick: () => printDeck(d) }, icon('download', 16), ' PDF'),
      h('button', { class: 'btn ghost small', onclick: async () => download(slug(art.title) + '.html', await standaloneHTML(art), 'text/html') }, icon('download', 16), ' HTML')),
    d.note ? h('p', { class: 'muted small' }, d.note) : null,
    h('div', { class: 'stage-wrap' }, stage),
    noteBox, thumbs));
  stage.addEventListener('click', (e) => { if (!editing && !e.target.closest('[contenteditable]')) show(cur + (e.offsetX > stage.clientWidth / 3 ? 1 : -1)); });
  show(0);
  return () => { gone = true; document.removeEventListener('keydown', key); narr?.pause(); };
}

// Yazdırma: tüm slaytları sayfa sayfa basar → tarayıcıdan "PDF olarak kaydet"
function printDeck(d) {
  const box = h('div', { id: 'print-root', class: `print-deck theme-${d.theme || 'ocean'}` }, (d.slides || []).map((s, i) => slideEl(s, i, d)));
  document.body.append(box);
  document.body.classList.add('printing');
  setTimeout(() => { window.print(); document.body.classList.remove('printing'); box.remove(); }, 100);
}

async function standaloneHTML(art) {
  const css = [...document.styleSheets].map((ss) => { try { return [...ss.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  const d = art.content;
  const body = h('div', {}, (d.slides || []).map((s, i) => h('section', { class: `deck theme-${d.theme || 'ocean'}` }, slideEl(s, i, d))));
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${art.title}</title><style>${css}
body{background:#111;padding:24px;display:grid;gap:24px;justify-items:center} section.deck{width:min(1100px,100%)}</style></head><body>${body.innerHTML}</body></html>`;
  return inlineImages(html, (d.slides || []).map((x) => x.imgKey)); // blob: adresleri → gömülü data: (tek dosyada görünsün)
}

export function toText(art) {
  return (art.content.slides || []).map((s, i) => `## ${i + 1}. ${s.title}\n${(s.bullets || []).map((b) => '- ' + b).join('\n')}${s.notes ? '\n> ' + s.notes : ''}`).join('\n\n');
}
