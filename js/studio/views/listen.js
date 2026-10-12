// Dinleyerek Öğren: dikte (dinle-yaz), gölgeleme (dinle-tekrar et, kendini kaydet) ve dinleme banyosu (bebeklerin dil
// edinimi gibi kesintisiz, anlaşılır girdi). Cümleler kaynaktan birebir alınır; üretim yapay zeka gerektirmez.
import { h, icon, toast } from '../../ui.js';
import { synthesize, loadTTS, ENGINE_SHORT, recordVoice } from '../../tts.js';
import { award, correctFx, wrongFx } from '../../learn.js';

const words = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
// Kelime hizalama (LCS): doğru yazılan kelimeleri işaretler
export function diffWords(target, typed) {
  const a = words(target), b = words(typed);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Array(a.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) { hit[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return { words: a, hit, score: a.length ? Math.round((hit.filter(Boolean).length / a.length) * 100) : 0 };
}

export function render(root, art) {
  const c = art.content;
  const S = c.sentences || [];
  let mode = c.mode || 'dictation', i = 0, rate = 1, mix = null, timings = null, stopAt = 0, disposed = false, myRec = null, rec = null, hideText = true;
  const pieces = [];
  const status = h('span', { class: 'muted small', role: 'status' }, 'Ses hazırlanıyor…');
  const box = h('div', { class: 'listen' });
  let player = null;

  function playSentence(k) {
    player?.pause();
    if (mix && timings?.[k]) { mix.currentTime = timings[k].start; stopAt = timings[k].end + 0.05; mix.playbackRate = rate; mix.play(); return; }
    if (pieces[k]) { player = new Audio(URL.createObjectURL(pieces[k])); player.playbackRate = rate; player.play(); return; }
    toast('Bu cümlenin sesi henüz hazırlanıyor…');
  }
  const speedSeg = () => h('div', { class: 'seg' }, [0.6, 0.8, 1, 1.25].map((r) => h('button', { class: r === rate ? 'on' : '', onclick: () => { rate = r; draw(); } }, r.toLocaleString('tr') + '×')));
  const modeSeg = () => h('div', { class: 'seg' }, [['dictation', 'Dikte'], ['shadow', 'Gölgeleme'], ['immersion', 'Dinleme banyosu']].map(([v, t]) => h('button', { class: v === mode ? 'on' : '', onclick: () => { mode = v; draw(); } }, t)));

  function draw() {
    const s = S[i];
    if (!s) { box.replaceChildren(h('p', {}, 'Cümle yok.')); return; }
    const head = h('div', { class: 'row gap wrap' }, modeSeg(), h('span', { class: 'grow' }), speedSeg(), status);
    if (mode === 'immersion') {
      const list = h('div', { class: 'transcript' + (hideText ? ' blurred' : '') }, S.map((x, k) => h('div', { class: 'tline', 'data-i': k, onclick: () => playSentence(k) }, h('div', { class: 'tline-text' }, x.text))));
      box.replaceChildren(head,
        h('p', { class: 'muted small' }, 'Bebekler dili, anladıkları bağlamda binlerce saat dinleyerek edinir. Önce metne bakmadan dinleyin; anlamadığınız cümleye tıklayıp tekrar dinleyin, sonra metni açın.'),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn primary', onclick: () => { if (!mix) return toast('Tüm akış hazırlanınca başlar'); stopAt = 0; mix.playbackRate = rate; mix.currentTime = timings?.[i]?.start || 0; mix.play(); } }, icon('play', 16), ' Akışı dinle'),
          h('button', { class: 'btn ghost', onclick: () => mix?.pause() }, '⏸ Durdur'),
          h('button', { class: 'btn ghost', onclick: () => { hideText = !hideText; draw(); } }, hideText ? 'Metni göster' : 'Metni gizle')),
        list);
      return;
    }
    const nav = h('div', { class: 'row gap' },
      h('button', { class: 'btn ghost', disabled: i === 0 ? true : null, onclick: () => { i--; myRec = null; draw(); } }, 'Önceki'),
      h('span', { class: 'muted' }, `${i + 1} / ${S.length}`),
      h('button', { class: 'btn ghost', onclick: () => { i = (i + 1) % S.length; myRec = null; draw(); } }, 'Sonraki'));
    const listenBtn = h('button', { class: 'btn primary', onclick: () => playSentence(i) }, icon('play', 16), ' Dinle');
    const src = h('div', { class: 'muted small' }, `📖 ${s.title || ''}${s.page ? ', s. ' + s.page : ''}`);
    if (mode === 'dictation') {
      const ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Duyduğunuzu yazın… (Enter: kontrol et)', spellcheck: 'false' });
      const out = h('div', {});
      const check = (e) => {
        const d = diffWords(s.text, ta.value);
        out.replaceChildren(h('div', { class: 'card dict-res ' + (d.score >= 90 ? 'ok' : 'no') },
          h('b', {}, `%${d.score} doğru · `), h('span', {}, d.words.map((w, k) => h('span', { class: d.hit[k] ? 'w-ok' : 'w-miss' }, w + ' '))),
          h('div', { class: 'muted small' }, 'Doğru metin: ', s.text)));
        if (d.score >= 90) { correctFx(e?.target || ta); award(3, 'dikte'); } else wrongFx(ta);
      };
      ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); check(e); } };
      box.replaceChildren(head, h('div', { class: 'card stack' }, h('div', { class: 'row gap wrap' }, listenBtn, h('span', { class: 'muted small' }, 'İstediğiniz kadar tekrar dinleyin; zorlanırsanız hızı 0,6×’e düşürün.')), ta,
        h('div', { class: 'row gap' }, h('button', { class: 'btn', onclick: check }, 'Kontrol et'), h('span', { class: 'grow' }), nav), out, src));
    } else {
      const recBtn = h('button', { class: 'btn ghost' }, rec ? '■ Kaydı bitir' : '● Kendimi kaydet');
      recBtn.onclick = async () => {
        if (!rec) { try { rec = await recordVoice(); draw(); } catch (e) { toast('Mikrofon açılamadı: ' + e.message, 'error'); } }
        else { const r = rec; rec = null; myRec = (await r.stop()).blob; award(2, 'gölgeleme'); draw(); }
      };
      box.replaceChildren(head, h('div', { class: 'card stack' },
        h('p', { class: 'big-label' }, s.text),
        h('p', { class: 'muted small' }, 'Dinleyin, sonra aynı tonlama ve hızla sesli tekrar edin. Kendinizi kaydedip orijinalle karşılaştırın; 3-5 tekrar sonra hızı artırın.'),
        h('div', { class: 'row gap wrap' }, listenBtn, recBtn, myRec ? h('audio', { controls: true, src: URL.createObjectURL(myRec) }) : null),
        h('div', { class: 'row gap' }, h('span', { class: 'grow' }), nav), src));
    }
  }

  async function prepare() {
    const cfg = await loadTTS();
    const sp = { id: 'A', name: 'Okuyucu', gender: cfg.narrator === 'f' ? 'f' : 'm', role: 'okuyucu' };
    try {
      const r = await synthesize(art.id + ':listen', S.map((s) => ({ speaker: 'A', text: s.text })), [sp], c.lang || 'Türkçe', {
        format: 'narration', onPiece: (p) => { pieces[p.idx[0]] = p.blob; }, onProgress: (m) => { status.textContent = m; }
      });
      if (disposed) return;
      timings = r.timings; mix = new Audio(URL.createObjectURL(r.blob));
      mix.ontimeupdate = () => {
        if (stopAt && mix.currentTime >= stopAt) { mix.pause(); stopAt = 0; }
        if (mode === 'immersion') { const k = timings.findLastIndex((t) => mix.currentTime >= t.start); box.querySelectorAll('.tline').forEach((n) => n.classList.toggle('on', +n.dataset.i === k)); }
      };
      status.textContent = ENGINE_SHORT[r.engine] + ' · hazır';
    } catch (e) { if (!disposed) status.textContent = 'Ses üretilemedi: ' + e.message.slice(0, 100); }
  }
  root.append(box);
  draw(); prepare();
  return () => { disposed = true; mix?.pause(); player?.pause(); rec?.cancel(); };
}

export const toText = (art) => (art.content.sentences || []).map((s, i) => `${i + 1}. ${s.text}`).join('\n');
