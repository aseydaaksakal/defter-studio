// Etkileşimli test: alıştırma (anında geri bildirim) ve deneme sınavı (süreli, sonda karne) modları.
// Yanlışlar hata defterine düşer; doğru cevapta kutlama, puan ve rozetler.
import { h, icon, toast } from '../../ui.js';
import { award, correctFx, wrongFx, celebrate, addMistakes, resolveMistake } from '../../learn.js';

const L = 'ABCDEFGH';

export function render(root, art, api) {
  const c = art.content;
  const all = c.questions || [];
  const exam = c.mode === 'exam';
  const target = c.target || 70;
  let set = all.map((_, i) => i), pos = 0, answers = {}, showHint = false, review = false, timer = 0, left = (c.minutes || 0) * 60, combo = 0;
  const box = h('div', { class: 'quiz' });
  const clock = h('span', { class: 'chip' + (exam ? '' : ' ghosty') });
  root.append(box);

  function tickClock() {
    if (!exam || review) return;
    left--;
    clock.textContent = `⏱ ${String(Math.floor(Math.max(0, left) / 60)).padStart(2, '0')}:${String(Math.max(0, left) % 60).padStart(2, '0')}`;
    clock.classList.toggle('warn', left < 60);
    if (left <= 0) { toast('Süre doldu', 'info'); finish(); }
  }

  function question() {
    const qi = set[pos], q = all[qi], chosen = answers[qi];
    const reveal = chosen !== undefined && (!exam || review);
    box.replaceChildren(
      h('div', { class: 'q-top' }, h('span', { class: 'muted' }, `${pos + 1}/${set.length}`), q.topic ? h('span', { class: 'chip ghosty' }, q.topic) : null,
        h('span', { class: 'grow' }), exam && !review ? clock : null,
        combo >= 3 && !exam ? h('span', { class: 'chip combo' }, `🔥 ${combo} seri`) : null,
        !exam || review ? h('button', { class: 'btn ghost small', onclick: () => api.ask(`Şu test sorusunu kaynaklara dayanarak açıkla: ${q.q}`) }, 'Sohbette sor') : null),
      h('h3', { class: 'q-text' }, q.q),
      h('div', { class: 'q-opts', role: 'radiogroup' }, q.options.map((o, k) => {
        let cls = 'q-opt';
        if (reveal) cls += k === q.answer ? ' right' : k === chosen ? ' wrong' : ' dim';
        else if (chosen === k) cls += ' picked';
        return h('button', { class: cls, role: 'radio', 'aria-checked': String(chosen === k), disabled: reveal ? true : null, onclick: (e) => pick(qi, k, e.currentTarget) },
          h('span', { class: 'q-letter' }, L[k] + '.'), h('span', {}, o),
          reveal && k === q.answer ? h('span', { class: 'q-mark' }, icon('check', 18)) : null,
          reveal && k === chosen && k !== q.answer ? h('span', { class: 'q-mark' }, icon('x', 18)) : null);
      })),
      reveal ? h('div', { class: 'q-explain card ' + (chosen === q.answer ? 'ok' : 'no') },
        h('b', {}, chosen === q.answer ? 'Doğru cevap! ' : 'Tam değil. '), q.explanation || '') : null,
      h('div', { class: 'q-bottom' },
        q.hint && !exam ? h('button', { class: 'btn chip', onclick: () => { showHint = !showHint; question(); } }, 'İpucu ', showHint ? '▴' : '▾') : h('span'),
        h('span', { class: 'grow' }),
        pos > 0 ? h('button', { class: 'btn ghost', onclick: () => { pos--; showHint = false; question(); } }, 'Önceki') : null,
        h('button', { class: 'btn primary', onclick: () => { showHint = false; if (pos < set.length - 1) { pos++; question(); } else finish(); } }, pos < set.length - 1 ? 'Sonraki' : review ? 'Sonuçlar' : 'Bitir')),
      showHint && q.hint ? h('div', { class: 'q-hint card' }, icon('bulb', 18), ' ', q.hint) : null,
      exam && !review ? h('div', { class: 'q-map' }, set.map((i, n) => h('button', { class: 'q-dot' + (answers[i] !== undefined ? ' done' : '') + (n === pos ? ' on' : ''), 'aria-label': 'Soru ' + (n + 1), onclick: () => { pos = n; question(); } }, n + 1))) : null);
  }

  function pick(qi, k, el) {
    if (answers[qi] !== undefined && (!exam || review)) return;
    answers[qi] = k;
    const ok = k === all[qi].answer;
    if (!exam) {
      if (ok) { combo++; correctFx(el); } else { combo = 0; wrongFx(el); }
      api.onAnswer?.(all[qi], ok);
      resolveMistake(all[qi].q, ok);
    }
    question();
    if (exam && pos < set.length - 1) setTimeout(() => { pos++; question(); }, 250);
  }

  async function finish() {
    clearInterval(timer);
    const ok = set.filter((i) => answers[i] === all[i].answer);
    const bad = set.filter((i) => answers[i] !== undefined && answers[i] !== all[i].answer);
    const skip = set.filter((i) => answers[i] === undefined);
    const pct = Math.round((ok.length / set.length) * 100);
    if (!review) {
      c.attempts = [...(c.attempts || []), { at: Date.now(), score: ok.length, total: set.length, mode: c.mode || 'practice' }];
      await api.save({ ...c }, null);
      await addMistakes([...bad, ...skip].map((i) => ({ q: all[i], notebookId: art.notebookId, artifactId: art.id })));
      if (exam) for (const i of set) resolveMistake(all[i].q, answers[i] === all[i].answer);
      const first = (c.attempts || []).length === 1;
      await award(ok.length * 5 + (pct >= target ? 20 : 0), exam ? 'deneme sınavı' : 'test', pct === 100 ? 'perfect' : pct >= target ? 'target' : first ? 'first_quiz' : null);
      if (pct >= target) celebrate();
    }
    review = false;
    // konu bazlı karne
    const topics = {};
    for (const i of set) { const t = all[i].topic || 'Genel'; topics[t] = topics[t] || { ok: 0, n: 0 }; topics[t].n++; if (answers[i] === all[i].answer) topics[t].ok++; }
    let filter = bad.length ? 'bad' : 'ok';
    const listBox = h('div');
    const tabs = h('div', { class: 'row gap wrap' });
    const lists = { ok: ['Doğru yanıtlanan', ok], bad: ['Yanlış yanıtlanan', bad], skip: ['Atlanan', skip] };
    function paintList() {
      tabs.replaceChildren(...Object.entries(lists).map(([k, [t, arr]]) => h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; paintList(); } }, h('span', { class: 'dot ' + k }), ` ${t} (${arr.length})`)));
      const [t, arr] = lists[filter];
      listBox.replaceChildren(h('h4', {}, `${t} (${arr.length})`), h('ol', { class: 'q-list' }, arr.map((i) => h('li', { value: i + 1 }, all[i].q))));
    }
    paintList();
    const passed = pct >= target;
    box.replaceChildren(
      h('div', { class: 'card score' },
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Puanınız'), h('div', { class: 'big-score' }, `${ok.length}/${set.length} `, h('span', { class: 'muted' }, `(${pct}%)`))),
          h('button', { class: 'btn ghost', onclick: () => { review = true; pos = 0; question(); } }, 'İncele')),
        h('div', { class: 'meter' }, h('div', { style: { width: pct + '%' } }), h('i', { class: 'meter-target', style: { left: target + '%' }, title: 'Hedef ' + target })),
        h('p', { class: passed ? 'ok-t' : 'muted' }, passed ? `Hedef puan ${target} geçildi. Harika!` : `Hedef ${target}. ${Math.max(0, Math.ceil((target / 100) * set.length) - ok.length)} doğru daha gerekiyor; yanlışların hata defterine eklendi.`),
        tabs, listBox),
      Object.keys(topics).length > 1 ? h('div', { class: 'card' }, h('h4', {}, 'Konu karnesi'),
        h('div', { class: 'topic-bars' }, Object.entries(topics).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([t, v]) => {
          const p = Math.round((v.ok / v.n) * 100);
          return h('div', { class: 'tb' }, h('span', { class: 'tb-l' }, t), h('div', { class: 'meter thin' }, h('div', { style: { width: p + '%', background: p >= target ? 'var(--ok)' : p >= 40 ? 'var(--warn)' : 'var(--no)' } })), h('span', { class: 'tb-v' }, `${v.ok}/${v.n}`));
        }))) : null,
      h('div', { class: 'card row wrap gap' }, h('span', { class: 'grow big-label' }, 'Tekrar deneyin'),
        h('button', { class: 'btn ghost', onclick: () => restart(all.map((_, i) => i)) }, icon('refresh', 16), ' Testi tekrarla'),
        bad.length || skip.length ? h('button', { class: 'btn ghost', onclick: () => restart([...bad, ...skip]) }, 'Yalnız yanlışlar') : null),
      api.regenerate ? h('div', { class: 'card row wrap gap' }, h('span', { class: 'grow big-label' }, 'Bana ek soru testi oluştur'),
        h('button', { class: 'btn ghost', onclick: () => api.regenerate({ focus: 'Şu konularda yeni ve farklı sorular: ' + [...bad, ...skip].map((i) => all[i].topic || all[i].q).join(' | ') }) }, icon('plus', 16), ' Yeni test oluştur')) : null,
      (c.attempts || []).length > 1 ? h('div', { class: 'card' }, h('h4', {}, 'Deneme geçmişi'),
        h('div', { class: 'attempts' }, c.attempts.slice(-12).map((a) => h('div', { class: 'att', title: new Date(a.at).toLocaleString('tr') }, h('div', { class: 'att-bar' + (a.score / a.total * 100 >= target ? ' pass' : ''), style: { height: Math.max(4, (a.score / a.total) * 60) + 'px' } }), h('small', {}, `${Math.round((a.score / a.total) * 100)}`))))) : null);
  }
  function restart(ids) { set = ids; pos = 0; answers = {}; review = false; combo = 0; left = (c.minutes || 0) * 60; clearInterval(timer); if (exam && left) timer = setInterval(tickClock, 1000); question(); toast('Test yeniden başladı'); }

  if (!all.length) box.append(h('p', {}, 'Bu testte soru yok.'));
  else {
    if (exam) box.append(h('div', { class: 'card' }, h('h3', {}, 'Deneme sınavı'), h('p', {}, `${all.length} soru · ${c.minutes} dakika · hedef ${target} puan. Cevaplar sınav bitince gösterilir.`),
      h('button', { class: 'btn primary', onclick: () => { left++; tickClock(); timer = setInterval(tickClock, 1000); question(); } }, 'Sınava başla')));
    else question();
  }
  return () => clearInterval(timer);
}

export function toText(art) {
  return (art.content.questions || []).map((q, i) => `${i + 1}. ${q.q}\n${q.options.map((o, k) => `   ${L[k]}) ${o}${k === q.answer ? '  ✓' : ''}`).join('\n')}\n   Açıklama: ${q.explanation || ''}`).join('\n\n');
}
