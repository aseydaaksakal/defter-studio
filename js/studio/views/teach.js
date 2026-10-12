// Öğreterek Öğren (Feynman): konuyu yazarak ya da konuşarak anlat, yapay zeka öğrenci gibi dinleyip puanlasın
import { h, icon, toast } from '../../ui.js';
import { evaluateExplanation } from '../gen.js';
import { award, celebrate } from '../../learn.js';
import { langCode } from '../../tts.js';

export function render(root, art, api) {
  const c = art.content;
  const topics = c.topics || [];
  c.attempts = c.attempts || {};
  let cur = 0, rec = null;
  const side = h('div', { class: 'teach-list' });
  const main = h('div', { class: 'teach-main' });

  function paintSide() {
    side.replaceChildren(...topics.map((t, i) => {
      const best = Math.max(0, ...(c.attempts[i] || []).map((a) => a.score));
      return h('button', { class: 'teach-topic' + (i === cur ? ' on' : ''), onclick: () => { cur = i; paint(); } },
        h('span', { class: 'grow' }, t.name), h('span', { class: 'score-dot ' + (best >= 80 ? 'ok' : best >= 50 ? 'mid' : best ? 'low' : '') }, best ? best : '—'));
    }));
  }
  function paint() {
    paintSide();
    const t = topics[cur];
    if (!t) { main.replaceChildren(h('p', {}, 'Konu yok.')); return; }
    const ta = h('textarea', { class: 'input teach-input', rows: 8, placeholder: 'Konuyu kendi cümlelerinle, birine anlatır gibi yaz. Ya da mikrofona basıp sesli anlat.' });
    const res = h('div');
    const mic = h('button', { class: 'btn ghost', title: 'Sesli anlat' }, '🎙️ Sesli anlat');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) mic.hidden = true;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = langCode(c.lang); rec.continuous = true; rec.interimResults = true;
      const base = ta.value;
      rec.onresult = (e) => { let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript + ' '; ta.value = (base ? base + ' ' : '') + s.trim(); };
      rec.onend = () => { rec = null; mic.textContent = '🎙️ Sesli anlat'; mic.classList.remove('on'); };
      rec.onerror = (e) => toast('Mikrofon: ' + e.error, 'error');
      rec.start(); mic.textContent = '⏹ Durdur'; mic.classList.add('on');
    };
    const go = h('button', { class: 'btn primary' }, 'Değerlendir');
    go.onclick = async () => {
      if (ta.value.trim().length < 20) { toast('Biraz daha ayrıntılı anlat.', 'info'); return; }
      rec?.stop();
      go.disabled = true; go.textContent = 'Dinliyorum…';
      try {
        const r = await evaluateExplanation(art.notebookId, t, ta.value, c.level);
        const score = Math.max(0, Math.min(100, Math.round(+r.score || 0)));
        (c.attempts[cur] = c.attempts[cur] || []).push({ at: Date.now(), score, text: ta.value.slice(0, 2000) });
        await api.save({ ...c }, null);
        await award(Math.round(score / 10) + 5, 'öğreterek öğren', score >= 80 ? 'teach80' : null);
        if (score >= 80) celebrate();
        const list = (title, arr, cls) => arr?.length ? h('div', { class: 'teach-res ' + cls }, h('h4', {}, title), h('ul', {}, arr.map((x) => h('li', {}, x)))) : null;
        res.replaceChildren(h('div', { class: 'card' },
          h('div', { class: 'row gap' }, h('div', { class: 'ring', style: { '--p': score } }, h('b', {}, score)), h('div', { class: 'grow' }, h('b', {}, r.praise || ''), h('p', { class: 'muted small' }, score >= 80 ? 'Bu konuyu öğretebilecek kadar biliyorsun.' : 'Eksikleri tamamlayıp yeniden anlat; her deneme hafızanı güçlendirir.'))),
          list('Doğru anlattıkların', r.covered, 'ok'), list('Eksik kalanlar', r.missing, 'mid'), list('Düzeltilmesi gerekenler', r.mistakes, 'no'),
          r.question ? h('div', { class: 'q-hint card' }, '🙋 Öğrencinin sorusu: ', h('b', {}, r.question)) : null,
          h('div', { class: 'row gap' }, h('button', { class: 'btn ghost', onclick: () => { ta.value = ''; res.replaceChildren(); ta.focus(); } }, 'Yeniden anlat'),
            h('button', { class: 'btn ghost', onclick: () => api.ask(`"${t.name}" konusunda şu eksikleri bana açıkla: ${(r.missing || []).concat(r.mistakes || []).join('; ')}`) }, 'Eksikleri sohbette öğren'))));
        paintSide();
      } catch (e) { toast(e.message, 'error'); }
      go.disabled = false; go.textContent = 'Değerlendir';
    };
    const past = (c.attempts[cur] || []).slice(-5);
    main.replaceChildren(h('h3', {}, t.name), h('p', { class: 'teach-q' }, '🙋 ', t.question),
      h('details', {}, h('summary', { class: 'muted small' }, 'Anlatımda olması gereken noktalar (önce kendin dene)'), h('ul', {}, (t.keyPoints || []).map((k) => h('li', {}, k)))),
      ta, h('div', { class: 'row gap' }, mic, h('span', { class: 'grow' }), go), res,
      past.length ? h('div', { class: 'muted small' }, 'Önceki denemeler: ' + past.map((a) => a.score).join(' → ')) : null);
  }
  root.append(h('div', { class: 'teach' }, side, main));
  paint();
  return () => rec?.stop();
}

export function toText(art) { return (art.content.topics || []).map((t, i) => `${i + 1}. ${t.name}\n${(t.keyPoints || []).map((k) => '   - ' + k).join('\n')}`).join('\n'); }
