// Hafıza Teknikleri: ipucu kartları, hafıza sarayı yürüyüşü, bağlayıcı hikâye ve kendini test etme
import { h, icon, toast } from '../../ui.js';
import { award, correctFx, wrongFx, celebrate } from '../../learn.js';
import { speakText, stopSpeaking } from '../../tts.js';

// Sesli dinle / Durdur düğmesi (gerçek ses motoru; ikinci basış durdurur)
function sayBtn(key, text, cls = 'btn ghost') {
  const b = h('button', { class: cls });
  const set = (st, e) => { b.replaceChildren(icon(st === 'playing' || st === 'loading' ? 'pause' : 'play', 16), st === 'loading' ? ' Hazırlanıyor… (durdur)' : st === 'playing' ? ' Durdur' : ' Sesli dinle'); if (st === 'error') toast('Ses üretilemedi: ' + e.message, 'error'); };
  set('idle');
  b.onclick = () => speakText(key, text, { onState: set });
  return b;
}

const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
function similar(a, b) { // kelime örtüşmesi oranı
  const A = new Set(norm(a).split(' ').filter((w) => w.length > 1)), B = new Set(norm(b).split(' ').filter((w) => w.length > 1));
  if (!B.size) return 0;
  let hit = 0; for (const w of B) if ([...A].some((x) => x === w || (w.length > 4 && x.startsWith(w.slice(0, 5))))) hit++;
  return hit / B.size;
}

export function render(root, art, api) {
  const c = art.content;
  const items = c.items || [];
  let tab = 'cards', stop = 0;
  const body = h('div', { class: 'mem-body' });
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const T = [['cards', 'İpucu kartları'], ['palace', 'Hafıza sarayı'], ['story', 'Hikâye'], ['test', 'Kendini test et']];
  function paintTabs() { tabs.replaceChildren(...T.map(([k, t]) => h('button', { class: tab === k ? 'on' : '', role: 'tab', onclick: () => { tab = k; paint(); } }, t))); }

  function paint() {
    paintTabs();
    if (tab === 'cards') {
      body.replaceChildren(h('div', { class: 'mem-grid' }, items.map((it, i) => h('div', { class: 'card mem-card' },
        h('div', { class: 'mem-emoji' }, it.emoji || '✨'),
        h('div', { class: 'muted small' }, `#${i + 1} · ${it.cue}`),
        h('div', { class: 'mem-fact' }, it.fact),
        it.mnemonic ? h('div', { class: 'mem-mn' }, h('b', {}, 'Kodlama: '), it.mnemonic) : null,
        it.image ? h('div', { class: 'mem-img' }, h('b', {}, 'Zihinde canlandır: '), it.image) : null))),
      (c.tips || []).length ? h('div', { class: 'card' }, h('h4', {}, 'İpuçları'), h('ul', {}, c.tips.map((t) => h('li', {}, t)))) : null);
    } else if (tab === 'palace') {
      const stops = c.palace?.stops || [];
      const s = stops[stop] || {};
      const it = items[s.item] || {};
      body.replaceChildren(
        h('p', { class: 'muted' }, `Gözlerini kapat ve ${c.palace?.place || 'mekânında'} yürü. Her durakta sahneyi tüm duyularınla canlandır: renk, ses, koku, hareket. Sonra "Kendini test et" sekmesinde durakları sırayla hatırla.`),
        h('div', { class: 'palace' },
          h('div', { class: 'palace-path' }, stops.map((x, i) => h('button', { class: 'pstop' + (i === stop ? ' on' : '') + (i < stop ? ' done' : ''), onclick: () => { stop = i; paint(); } }, i + 1))),
          h('div', { class: 'card palace-stop' },
            h('div', { class: 'muted small' }, `Durak ${stop + 1}/${stops.length}`),
            h('h2', {}, `${items[s.item]?.emoji || '📍'} ${s.loc || ''}`),
            h('p', { class: 'palace-scene' }, s.scene || ''),
            h('div', { class: 'mem-fact' }, it.fact || ''),
            h('div', { class: 'row gap' },
              h('button', { class: 'btn ghost', disabled: stop === 0 ? true : null, onclick: () => { stop--; paint(); } }, 'Önceki durak'),
              sayBtn('stop' + stop, `${s.loc}. ${s.scene}. ${it.fact || ''}`),
              h('span', { class: 'grow' }),
              h('button', { class: 'btn primary', onclick: () => { if (stop < stops.length - 1) { stop++; paint(); } else { tab = 'test'; paint(); } } }, stop < stops.length - 1 ? 'Sonraki durak' : 'Kendini test et')))));
    } else if (tab === 'story') {
      body.replaceChildren(h('div', { class: 'card story' }, h('p', {}, c.story || 'Hikâye yok.'),
        sayBtn('story', c.story || '', 'btn ghost small')));
    } else testMode();
  }

  function testMode() {
    let i = 0, score = 0;
    const order = items.map((_, k) => k);
    const ask = () => {
      if (i >= order.length) {
        const pct = Math.round((score / order.length) * 100);
        c.progress = { ...(c.progress || {}), last: pct, at: Date.now() };
        api.save({ ...c }, null);
        award(score * 3, 'hafıza', pct === 100 ? 'memory' : null);
        if (pct >= 80) celebrate();
        body.replaceChildren(h('div', { class: 'card score' }, h('div', { class: 'big-score' }, `%${pct}`), h('p', {}, `${order.length} bilgiden ${score} tanesini hatırladın.`),
          h('p', { class: 'muted' }, 'Tekrar planı: bugün, 1 gün sonra, 3 gün sonra, 1 hafta sonra ve 3 hafta sonra test et. Her seferinde saray yürüyüşünü zihninde yap.'),
          h('button', { class: 'btn primary', onclick: testMode }, 'Yeniden test et')));
        return;
      }
      const it = items[order[i]];
      const stopFor = (c.palace?.stops || []).find((s) => s.item === order[i]);
      const inp = h('textarea', { class: 'input', rows: 2, placeholder: 'Cevabını yaz…' });
      const fb = h('div');
      const check = (e) => {
        const ok = similar(inp.value, it.fact) >= 0.5;
        if (ok) { score++; correctFx(e.target); } else wrongFx(e.target);
        fb.replaceChildren(h('div', { class: 'q-explain card ' + (ok ? 'ok' : 'no') }, h('b', {}, ok ? 'Hatırladın! ' : 'Doğrusu: '), it.fact, it.mnemonic ? h('div', { class: 'small muted' }, 'Kodlama: ' + it.mnemonic) : null),
          h('button', { class: 'btn primary', onclick: () => { i++; ask(); } }, 'Sonraki'));
        btn.remove();
      };
      const btn = h('button', { class: 'btn primary', onclick: check }, 'Kontrol et');
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (btn.isConnected) btn.click(); } });
      body.replaceChildren(h('div', { class: 'card' },
        h('div', { class: 'muted small' }, `${i + 1}/${order.length}${stopFor ? ' · Durak: ' + stopFor.loc : ''}`),
        h('h3', {}, it.cue), inp, h('div', { class: 'row gap' }, btn), fb));
      inp.focus();
    };
    ask();
  }

  root.append(h('div', { class: 'memory' }, h('div', { class: 'row gap wrap' }, tabs, h('span', { class: 'grow' }), h('button', { class: 'btn ghost small', onclick: () => api.editJSON() }, icon('edit', 16), ' Düzenle')), body));
  paint();
  return () => stopSpeaking();
}

export function toText(art) {
  const c = art.content;
  return [(c.items || []).map((it, i) => `${i + 1}. ${it.cue} → ${it.fact}\n   Kodlama: ${it.mnemonic || ''}\n   İmge: ${it.image || ''}`).join('\n'),
    '\nHafıza sarayı: ' + (c.palace?.place || ''), ...(c.palace?.stops || []).map((s, i) => `${i + 1}. ${s.loc}: ${s.scene}`), '\nHikâye:\n' + (c.story || '')].join('\n');
}
