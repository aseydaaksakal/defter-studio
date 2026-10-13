// Podcast kadrosu (Ses stüdyosunda kurulan karakterler) ve hazır sesler: ortak yükleme, dinletme ve hata gösterimi.
// Kadronun doğruluk kaynağı lokal sunucudur (GET/PUT /cast); sunucu yoksa localStorage yedeği kullanılır (bkz. server.js).
import { h } from './ui.js';
import { loadTTS, saveTTS, syncCast, serverVoices, testVoice } from './tts.js';
import { friendlyError } from './server.js';

export const G = (g) => (g === 'm' ? 'erkek' : 'kadın');

// { cast, voices }: kadro sunucudan eşitlenir, ses kütüphanesi sunucudan okunur (sunucu yoksa boş)
export async function loadRoster() {
  const { cast } = await syncCast();
  const voices = await serverVoices().catch(() => []);
  return { cast, voices };
}
// Kadro değişimini kaydet (yerel + sunucu)
export async function saveRoster(cast) { await saveTTS({ ...(await loadTTS()), cast }); }

// Hata kutusu: ilk satır sade Türkçe, ham ayrıntı 'ayrıntı' açılırında
export function showError(box, e, prefix = '✗ ') {
  const f = e?.detail ? { msg: e.message, detail: e.detail } : friendlyError(e?.message || String(e));
  const kids = [prefix + f.msg];
  if (f.detail && f.detail !== f.msg) kids.push(' ', h('details', { class: 'err-detail', style: { display: 'inline' } }, h('summary', { style: { display: 'inline', cursor: 'pointer' } }, 'ayrıntı'), h('pre', { class: 'small' }, String(f.detail).slice(0, 1200))));
  box.replaceChildren(...kids);
}

let current = null;
export function stopSample() { try { current?.pause(); } catch {} current = null; }
// ▶ düğmesi: örnek cümleyi seçili sesle üretir ve çalar. Üretirken tekrar basmak iptal eder (3 dk zaman aşımı testVoice'ta).
export function sampleButton({ get, onError, cls = 'btn primary small', label = '▶' }) {
  let ctl = null;
  const b = h('button', { class: cls, type: 'button', title: 'Dinle', 'aria-label': 'Dinle' }, label);
  b.onclick = async () => {
    if (ctl) { ctl.abort(); return; }
    const { voice, gender, name } = get();
    ctl = new AbortController(); b.textContent = '■'; b.title = 'İptal et';
    try {
      const blob = await testVoice(voice || (gender === 'm' ? 'm' : 'f'), gender, `Merhaba, ben ${name || 'konuşmacı'}. Bugün sizinle önemli bir konuyu konuşacağız.`, ctl.signal);
      stopSample(); current = new Audio(URL.createObjectURL(blob)); await current.play();
    } catch (e) { if (!/İptal/.test(e.message)) onError?.(e); } finally { ctl = null; b.textContent = label; b.title = 'Dinle'; }
  };
  return b;
}

// Podcast üretim penceresi: 'Karakterlerim' seçilince kadro listesi (kim konuşsun · ses seçici · ▶ dinle · kaç kişilik konuşma).
// vals.castPick = konuşacak karakter adları. Ses değişimi kadroya yazılır (sunucuya da gider).
export function castPicker(vals) {
  const root = h('div', { class: 'cast-pick card stack', hidden: true });
  const err = h('div', { class: 'small', role: 'status' });
  let cast = [], voices = [];
  const picked = () => cast.filter((c) => vals.castPick.includes(c.name));
  async function paint() {
    root.hidden = vals.voices !== 'cast';
    if (root.hidden) return;
    root.replaceChildren(h('p', { class: 'muted small' }, 'Karakterler yükleniyor…'));
    ({ cast, voices } = await loadRoster());
    if (!Array.isArray(vals.castPick)) vals.castPick = cast.slice(0, 6).map((c) => c.name);
    vals.castPick = vals.castPick.filter((n) => cast.some((c) => c.name === n));
    if (!cast.length) {
      root.replaceChildren(h('b', {}, 'Karakterlerim'), h('p', { class: 'muted small' }, 'Henüz karakter yok. Ses stüdyosunda karakter kurun (Ayşe, Fatma, Hasan…); kadro sunucuda saklanır, hangi adresten açarsanız açın görünür.'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { (await import('./voice-studio.js')).openVoiceStudio({ onClose: paint }); } }, 'Ses stüdyosunu aç'));
      return;
    }
    const sum = h('b', { class: 'cast-sum' });
    const upd = () => { const n = vals.castPick.length; sum.textContent = n < 2 ? `${n} kişi seçili (en az 2 gerekir; “Özet” biçimi tek kişiyle çalışır)` : `${n} kişilik konuşma`; };
    const rows = cast.map((c) => {
      const on = h('input', { type: 'checkbox', checked: vals.castPick.includes(c.name) ? true : null, 'aria-label': c.name + ' konuşsun' });
      on.onchange = () => { vals.castPick = on.checked ? [...vals.castPick, c.name] : vals.castPick.filter((n) => n !== c.name); upd(); };
      const pool = voices.filter((v) => v.gender === (c.gender === 'm' ? 'm' : 'f'));
      const sel = h('select', { class: 'input small-in', 'aria-label': c.name + ' sesi' }, h('option', { value: '', selected: !c.voice ? true : null }, 'Otomatik ses'), ...pool.map((v) => h('option', { value: v.name, selected: v.name === c.voice ? true : null }, v.label)));
      sel.onchange = async () => { c.voice = sel.value; await saveRoster(cast); };
      const hear = sampleButton({ get: () => ({ voice: c.voice, gender: c.gender, name: c.name }), onError: (e) => showError(err, e) });
      return h('label', { class: 'row gap wrap cast-pick-row' }, on, h('b', {}, c.name), h('span', { class: 'muted small' }, G(c.gender)), h('span', { class: 'grow' }), sel, hear);
    });
    const setN = (n) => { vals.castPick = cast.slice(0, n).map((c) => c.name); rows.forEach((r, i) => { r.querySelector('input').checked = i < n; }); upd(); };
    upd();
    root.replaceChildren(h('b', {}, `Karakterlerim (${cast.length})`), h('p', { class: 'muted small' }, 'Konuşmaya katılacakları işaretleyin, her birinin sesini seçin ve ▶ ile dinleyin.'),
      ...rows,
      h('div', { class: 'row gap wrap' }, h('span', { class: 'muted small' }, 'Kaç kişilik konuşma:'), ...[2, 3, 4, 5, 6].filter((n) => n <= cast.length).map((n) => h('button', { class: 'chip', type: 'button', onclick: () => setN(n) }, `${n} kişi`)), h('button', { class: 'chip', type: 'button', onclick: () => setN(Math.min(6, cast.length)) }, 'Hepsi'), h('span', { class: 'grow' }), sum), err);
  }
  return { el: root, paint };
}
