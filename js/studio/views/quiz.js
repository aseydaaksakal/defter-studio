// Etkileşimli test: tek tek sorular, ipucu, anında geri bildirim, puan ekranı, yanlışları tekrar, deneme geçmişi
import { h, icon, toast } from '../../ui.js';

const L = 'ABCDEFGH';

export function render(root, art, api) {
  const c = art.content;
  const all = c.questions || [];
  let set = all.map((_, i) => i), pos = 0, answers = {}, showHint = false, review = false;
  const box = h('div', { class: 'quiz' });
  root.append(box);

  function question() {
    const qi = set[pos], q = all[qi], chosen = answers[qi];
    const done = chosen !== undefined;
    box.replaceChildren(
      h('div', { class: 'q-top' }, h('span', { class: 'muted' }, `${pos + 1}/${set.length}`), h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost small', onclick: () => api.ask(`Şu test sorusunu kaynaklara dayanarak açıkla: ${q.q}`) }, 'Sohbette sor')),
      h('h3', { class: 'q-text' }, q.q),
      h('div', { class: 'q-opts', role: 'radiogroup' }, q.options.map((o, k) => {
        let cls = 'q-opt';
        if (done) cls += k === q.answer ? ' right' : k === chosen ? ' wrong' : ' dim';
        return h('button', { class: cls, role: 'radio', 'aria-checked': String(chosen === k), disabled: done && !review ? true : null, onclick: () => { if (done) return; answers[qi] = k; question(); } },
          h('span', { class: 'q-letter' }, L[k] + '.'), h('span', {}, o),
          done && k === q.answer ? h('span', { class: 'q-mark' }, icon('check', 18)) : null,
          done && k === chosen && k !== q.answer ? h('span', { class: 'q-mark' }, icon('x', 18)) : null);
      })),
      done ? h('div', { class: 'q-explain card ' + (chosen === q.answer ? 'ok' : 'no') },
        h('b', {}, chosen === q.answer ? 'Doğru cevap! ' : 'Tam değil. '), q.explanation || '') : null,
      h('div', { class: 'q-bottom' },
        q.hint ? h('button', { class: 'btn chip', onclick: () => { showHint = !showHint; question(); } }, 'İpucu ', showHint ? '▴' : '▾') : h('span'),
        h('span', { class: 'grow' }),
        pos > 0 ? h('button', { class: 'btn ghost', onclick: () => { pos--; showHint = false; question(); } }, 'Önceki') : null,
        h('button', { class: 'btn primary', onclick: () => { showHint = false; if (pos < set.length - 1) { pos++; question(); } else finish(); } }, pos < set.length - 1 ? 'Sonraki' : 'Bitir')),
      showHint && q.hint ? h('div', { class: 'q-hint card' }, icon('bulb', 18), ' ', q.hint) : null);
  }

  async function finish() {
    const ok = set.filter((i) => answers[i] === all[i].answer);
    const bad = set.filter((i) => answers[i] !== undefined && answers[i] !== all[i].answer);
    const skip = set.filter((i) => answers[i] === undefined);
    const pct = Math.round((ok.length / set.length) * 100);
    const attempts = [...(c.attempts || []), { at: Date.now(), score: ok.length, total: set.length }];
    c.attempts = attempts;
    await api.save({ ...c }, null);
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
    box.replaceChildren(
      h('div', { class: 'card score' },
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Puanınız'), h('div', { class: 'big-score' }, `${ok.length}/${set.length} `, h('span', { class: 'muted' }, `(${pct}%)`))),
          h('button', { class: 'btn ghost', onclick: () => { review = true; pos = 0; question(); } }, 'İncele')),
        h('div', { class: 'meter' }, h('div', { style: { width: pct + '%' } })),
        tabs, listBox),
      h('div', { class: 'card row' }, h('span', { class: 'grow big-label' }, 'Tekrar deneyin'),
        h('button', { class: 'btn ghost', onclick: () => restart(all.map((_, i) => i)) }, icon('refresh', 16), ' Testi tekrarla'),
        bad.length ? h('button', { class: 'btn ghost', onclick: () => restart(bad) }, 'Yalnız yanlışlar') : null),
      h('div', { class: 'card row' }, h('span', { class: 'grow big-label' }, 'Bana ek soru testi oluştur'),
        h('button', { class: 'btn ghost', onclick: () => api.regenerate({ focus: 'Şu konularda yeni sorular: ' + bad.map((i) => all[i].q).join(' | ') }) }, icon('plus', 16), ' Yeni test oluştur')),
      attempts.length > 1 ? h('div', { class: 'card' }, h('h4', {}, 'Deneme geçmişi'),
        h('div', { class: 'attempts' }, attempts.slice(-10).map((a) => h('div', { class: 'att', title: new Date(a.at).toLocaleString('tr') }, h('div', { class: 'att-bar', style: { height: Math.max(4, (a.score / a.total) * 60) + 'px' } }), h('small', {}, `${a.score}/${a.total}`))))) : null);
  }
  function restart(ids) { set = ids; pos = 0; answers = {}; review = false; question(); toast('Test yeniden başladı'); }
  if (!all.length) box.append(h('p', {}, 'Bu testte soru yok.'));
  else question();
}

export function toText(art) {
  return (art.content.questions || []).map((q, i) => `${i + 1}. ${q.q}\n${q.options.map((o, k) => `   ${L[k]}) ${o}${k === q.answer ? '  ✓' : ''}`).join('\n')}\n   Açıklama: ${q.explanation || ''}`).join('\n\n');
}
