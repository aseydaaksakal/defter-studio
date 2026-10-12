// Hızlı okuma: kelime akışı (RSVP), satır kılavuzu, serbest süreli okuma, Schulte göz ısınması ve anlama testi.
// Etkin okuma hızı = kelime/dk × anlama oranı
import { h, icon, toast } from '../../ui.js';
import { award, correctFx, wrongFx, celebrate } from '../../learn.js';

export function render(root, art, api) {
  const c = art.content;
  const words = (c.text || '').split(/\s+/).filter(Boolean);
  let wpm = c.lastWpm || 300, chunk = 1, mode = 'rsvp', timer = 0, raf = 0, i = 0, startT = 0, readSecs = 0;
  const stage = h('div', { class: 'sr-stage' });
  const ctl = h('div', { class: 'row gap wrap sr-ctl' });
  const out = h('div');

  // Odak harfi (ORP): kelimenin ~%35'i
  const orp = (w) => { const p = Math.max(0, Math.min(w.length - 1, Math.floor(w.length * 0.35))); return h('span', {}, w.slice(0, p), h('b', { class: 'orp' }, w[p] || ''), w.slice(p + 1)); };
  function stop() { clearTimeout(timer); cancelAnimationFrame(raf); }

  function rsvp() {
    stop(); i = 0; startT = performance.now();
    const word = h('div', { class: 'sr-word' });
    const bar = h('div', { class: 'meter thin' }, h('div'));
    stage.replaceChildren(h('div', { class: 'sr-frame' }, h('div', { class: 'sr-guide' }), word), bar);
    const step = () => {
      if (i >= words.length) return done((performance.now() - startT) / 1000);
      const part = words.slice(i, i + chunk).join(' ');
      word.replaceChildren(chunk === 1 ? orp(part) : h('span', {}, part));
      bar.firstChild.style.width = Math.round((i / words.length) * 100) + '%';
      const pause = /[.!?]$/.test(part) ? 2 : /[,;:]$/.test(part) ? 1.4 : 1;
      i += chunk;
      timer = setTimeout(step, (60000 / wpm) * chunk * pause);
    };
    step();
  }
  function pacer() {
    stop(); startT = performance.now();
    const spans = words.map((w) => h('span', { class: 'pw' }, w + ' '));
    const txt = h('div', { class: 'sr-text' }, spans);
    stage.replaceChildren(txt);
    let k = 0;
    const step = () => {
      if (k >= spans.length) return done((performance.now() - startT) / 1000);
      spans.forEach((s, n) => s.classList.toggle('lit', n >= k && n < k + 6));
      if (k % 12 === 0) spans[k].scrollIntoView({ block: 'center', behavior: 'smooth' });
      k += 3;
      timer = setTimeout(step, (60000 / wpm) * 3);
    };
    step();
  }
  function free() {
    stop(); startT = performance.now();
    stage.replaceChildren(h('div', { class: 'sr-text' }, (c.text || '').split(/\n\n+/).map((p) => h('p', {}, p))),
      h('button', { class: 'btn primary', onclick: () => done((performance.now() - startT) / 1000) }, 'Okumayı bitirdim'));
  }
  function schulte() {
    stop();
    const nums = Array.from({ length: 25 }, (_, k) => k + 1).sort(() => Math.random() - 0.5);
    let next = 1; const t0 = performance.now();
    const info = h('div', { class: 'muted' }, 'Gözünü ortadaki hücrede sabit tut, 1’den 25’e sırayla tıkla. Çevresel görüşü genişletir.');
    const grid = h('div', { class: 'schulte' }, nums.map((n) => h('button', { class: 'sc', onclick: (e) => {
      if (n === next) { e.currentTarget.classList.add('done'); next++; if (next > 25) { const s = ((performance.now() - t0) / 1000).toFixed(1); info.textContent = `Süre: ${s} sn. 25 sn altı iyi, 15 sn altı çok iyi.`; award(5, 'Schulte'); } }
      else wrongFx(e.currentTarget);
    } }, n)));
    stage.replaceChildren(info, grid);
  }

  function done(secs) {
    stop(); readSecs = secs;
    const actual = Math.round(words.length / (secs / 60));
    quiz(actual);
  }
  function quiz(actual) {
    const qs = c.questions || [];
    let k = 0, ok = 0;
    const ask = () => {
      if (k >= qs.length) return result(actual, qs.length ? ok / qs.length : 1);
      const q = qs[k];
      stage.replaceChildren(h('div', { class: 'quiz' }, h('div', { class: 'muted' }, `Anlama sorusu ${k + 1}/${qs.length} · metne geri bakmadan cevapla`), h('h3', { class: 'q-text' }, q.q),
        h('div', { class: 'q-opts' }, q.options.map((o, n) => h('button', { class: 'q-opt', onclick: (e) => { if (n === q.answer) { ok++; correctFx(e.currentTarget); } else wrongFx(e.currentTarget); k++; setTimeout(ask, 350); } }, h('span', { class: 'q-letter' }, 'ABCD'[n] + '.'), h('span', {}, o))))));
    };
    ask();
  }
  async function result(actual, comp) {
    const eff = Math.round(actual * comp);
    c.history = [...(c.history || []), { at: Date.now(), wpm: actual, comp: Math.round(comp * 100), eff, mode }];
    c.lastWpm = wpm;
    await api.save({ ...c }, null);
    await award(10 + Math.round(comp * 10), 'hızlı okuma', eff >= 400 ? 'reader' : null);
    if (comp >= 0.8) celebrate();
    const tip = comp < 0.6 ? 'Anlama düşük: hızı %15 azalt. Hız ancak anlama korunuyorsa değerlidir.' : comp >= 0.85 ? 'Anlama çok iyi: hızı 50 kelime/dk artırmayı dene.' : 'Dengeli. Aynı hızda birkaç tur daha yap.';
    stage.replaceChildren(h('div', { class: 'card score' },
      h('div', { class: 'sr-res' },
        h('div', {}, h('div', { class: 'big-score' }, actual), h('div', { class: 'muted' }, 'kelime/dk')),
        h('div', {}, h('div', { class: 'big-score' }, '%' + Math.round(comp * 100)), h('div', { class: 'muted' }, 'anlama')),
        h('div', {}, h('div', { class: 'big-score ok-t' }, eff), h('div', { class: 'muted' }, 'etkin hız'))),
      h('p', {}, tip), h('p', { class: 'muted small' }, 'Türkçe metinlerde ortalama sessiz okuma hızı yaklaşık 200-250 kelime/dk’dır.'),
      h('button', { class: 'btn primary', onclick: start }, 'Yeniden oku')));
    paintHistory();
  }
  const hist = h('div');
  function paintHistory() {
    const H = (c.history || []).slice(-12);
    hist.replaceChildren(H.length ? h('div', { class: 'card' }, h('h4', {}, 'Gelişim'), h('div', { class: 'attempts' }, H.map((x) => h('div', { class: 'att', title: `${x.wpm} k/dk · %${x.comp}` }, h('div', { class: 'att-bar pass', style: { height: Math.max(4, Math.min(80, x.eff / 8)) + 'px' } }), h('small', {}, x.eff))))) : null);
  }
  function start() { ({ rsvp, pacer, free, schulte })[mode](); }

  const wpmIn = h('input', { type: 'range', min: 100, max: 1000, step: 25, value: wpm, 'aria-label': 'Hız' });
  const wpmLbl = h('span', { class: 'chip' }, wpm + ' k/dk');
  wpmIn.oninput = () => { wpm = +wpmIn.value; wpmLbl.textContent = wpm + ' k/dk'; };
  const modeSeg = h('div', { class: 'seg' });
  const MODES = [['rsvp', 'Kelime akışı'], ['pacer', 'Satır kılavuzu'], ['free', 'Serbest okuma'], ['schulte', 'Göz ısınması']];
  const paintModes = () => modeSeg.replaceChildren(...MODES.map(([k, t]) => h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; paintModes(); } }, t)));
  paintModes();
  const chunkSel = h('select', { class: 'input small', 'aria-label': 'Kelime grubu', onchange: (e) => (chunk = +e.target.value) }, [1, 2, 3].map((n) => h('option', { value: n }, n + ' kelime')));
  ctl.append(modeSeg, wpmIn, wpmLbl, chunkSel, h('button', { class: 'btn primary', onclick: start }, icon('play', 16), ' Başla'), h('button', { class: 'btn ghost', onclick: stop }, 'Durdur'));
  stage.append(h('div', { class: 'card' }, h('p', {}, `${words.length} kelimelik metin. Önce "Göz ısınması" ile başlayabilir, sonra bir okuma modu seçip Başla’ya basabilirsin. Okuma bitince anlama testi gelir.`)));
  root.append(h('div', { class: 'speedread' }, ctl, stage, out, hist));
  paintHistory();
  return stop;
}

export function toText(art) { return art.content.text; }
