// Bilgi kartları: çevirme (Boşluk), gezinme (← →), bildim/bilemedim sayacı, FSRS-6 aralıklı tekrar (js/srs.js), Anki CSV
import { h, icon, download, slug, toast } from '../../ui.js';
import { award, correctFx, wrongFx } from '../../learn.js';
import { tekrar, eskidenDurum, sakla } from '../../srs.js';

const ESKI_GUN = [0, 1 / 1440, 10 / 1440, 1, 3, 7]; // 0.8.2'ye dek Leitner kutularının aralığı (gün): ilerleme FSRS'e taşınır

export function render(root, art, api) {
  const srcOf = (cd) => { const r = (art.content.refs || []).find((x) => x.n === +cd.ref); return r ? ` — ${r.title}${r.page ? ', s. ' + r.page : ''}` : ''; };
  const c = art.content;
  const all = c.cards || [];
  const prog = c.progress || {}; // { index: { box: 1..5 (seviye), due: zaman, fsrs: {s, d, son, sayi, unutma} } }
  let order = all.map((_, i) => i), pos = 0, flipped = false, right = 0, wrong = 0, onlyDue = false;

  const card = h('div', { class: 'fc-card', tabindex: 0, role: 'button', 'aria-label': 'Kartı çevir' });
  const counter = h('span', { class: 'muted' });
  const rBtn = h('button', { class: 'fc-score ok', 'aria-label': 'Bildim' });
  const wBtn = h('button', { class: 'fc-score no', 'aria-label': 'Bilemedim' });

  const due = (i) => !prog[i] || (prog[i].due || 0) <= Date.now();
  function build() {
    order = all.map((_, i) => i).filter((i) => !onlyDue || due(i));
    if (!order.length) { order = all.map((_, i) => i); toast('Tekrar zamanı gelen kart yok, tüm kartlar gösteriliyor.'); }
    pos = Math.min(pos, order.length - 1); flipped = false; paint();
  }
  function paint() {
    const i = order[pos], cd = all[i] || { front: 'Kart yok', back: '' };
    card.classList.toggle('flipped', flipped);
    card.replaceChildren(
      h('div', { class: 'fc-top' }, h('span', {}, `${pos + 1}/${order.length}`), prog[i] ? h('span', { class: 'chip ghosty' }, 'Kutu ' + prog[i].box) : null),
      h('div', { class: 'fc-text' }, flipped ? cd.back : cd.front),
      flipped
        ? h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); api.ask(`Bu bilgi kartını kaynaklara dayanarak ayrıntılı açıkla:\nSoru: ${cd.front}\nCevap: ${cd.back}`); } }, icon('note', 16), ' Açıkla')
        : h('div', { class: 'fc-hint muted' }, 'Yanıtı görüntüleyin'),
      flipped && cd.explain ? h('div', { class: 'fc-explain muted' }, cd.explain) : null,
      flipped && cd.evidence ? h('div', { class: 'fc-src small muted', title: 'Kaynaktaki dayanak' }, '📖 «', cd.evidence, '»', srcOf(cd)) : null);
    rBtn.replaceChildren(String(right), ' ', icon('check', 18));
    wBtn.replaceChildren(icon('x', 18), ' ', String(wrong));
    counter.textContent = `${Object.values(prog).filter((p) => p.box >= 4).length} kart öğrenildi`;
  }
  const flip = () => { flipped = !flipped; paint(); };
  const go = (d) => { pos = (pos + d + order.length) % order.length; flipped = false; paint(); };
  async function grade(ok) {
    const i = order[pos];
    const p = prog[i];
    const st = tekrar(p?.fsrs || (p?.box ? eskidenDurum({ gun: ESKI_GUN[p.box] || 1, due: p.due }) : null), ok);
    prog[i] = { box: st.box, due: st.due, fsrs: sakla(st) };
    ok ? right++ : wrong++;
    ok ? correctFx(rBtn) : wrongFx(wBtn);
    award(ok ? 2 : 1, 'kart', null, { silent: true });
    await api.save({ ...c, progress: prog }, null);
    go(1);
  }
  card.onclick = flip;
  rBtn.onclick = () => grade(true);
  wBtn.onclick = () => grade(false);
  const key = (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); flip(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', key);

  const csv = () => all.map((x) => [x.front, x.back].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
  root.append(h('div', { class: 'fc-view' },
    h('p', { class: 'muted center small' }, 'Döndürmek için "Boşluk" tuşuna, gezinmek için "← / →" tuşlarına basın'),
    h('div', { class: 'row gap wrap center' },
      h('button', { class: 'btn ghost small', onclick: () => { order.sort(() => Math.random() - 0.5); pos = 0; flipped = false; paint(); } }, icon('shuffle', 16), ' Karıştır'),
      h('label', { class: 'chk small' }, h('input', { type: 'checkbox', onchange: (e) => { onlyDue = e.target.checked; build(); } }), ' Yalnız tekrar zamanı gelenler'),
      counter,
      h('button', { class: 'btn ghost small', onclick: () => api.editJSON() }, icon('edit', 16), ' Düzenle'),
      h('button', { class: 'btn ghost small', onclick: () => download(slug(art.title) + '-anki.csv', csv(), 'text/csv') }, icon('download', 16), ' Anki CSV')),
    card,
    h('div', { class: 'fc-ctrl' },
      h('button', { class: 'icon-btn round big', 'aria-label': 'Önceki', onclick: () => go(-1) }, icon('back')),
      wBtn, rBtn,
      h('button', { class: 'icon-btn round big accent', 'aria-label': 'Sonraki', onclick: () => go(1) }, icon('next')))));
  build();
  return () => document.removeEventListener('keydown', key);
}

export function toText(art) { return (art.content.cards || []).map((c, i) => `${i + 1}. ${c.front}\n   → ${c.back}`).join('\n'); }
