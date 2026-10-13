// Ayarlar › Seslendirme › Lokal modeller: Hugging Face'teki MIT lisanslı Türkçe TTS modellerini listeler (server/modeller.py),
// boyutlarını gösterir, indirir, sunucuda dinletir, "beğendim / beğenmedim" ile ayıklar; beğenilmeyen diskten silinir.
// Hiçbir model sizin onayınız olmadan indirilmez. Yalnız lokal sunucu çalışırken görünür (Pages'ten de aynı sunucuya bağlanır).
import { h } from './ui.js';
import { serverUrl } from './server.js';
import { serverVoices } from './tts.js';
import { normalizeTR } from './textnorm.js';

const TEST_TEXT = "Merhaba, ben bu modelin sesiyim. 1 Şubat 1999'da yürürlüğe giren GMDSS, A1 ve A2 deniz sahalarını tanımlar. Tehlike çağrısı için on altı numaralı kanal sürekli dinlenir.";
const PLATFORM = { cuda: 'NVIDIA GPU', mlx: 'Apple MLX', gguf: 'GGUF' };

async function api(path, opt) {
  const base = await serverUrl();
  if (!base) throw new Error('Lokal sunucu çalışmıyor. server/baslat.bat ile açın.');
  const r = await fetch(base + path, opt);
  if (!r.ok) { let m = await r.text(); try { m = JSON.parse(m).detail || m; } catch {} throw new Error(String(m).slice(0, 400)); }
  return r;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const gb = (n) => (n == null ? '…' : n >= 1e8 ? (n / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(n / 1e6)) + ' MB');

export function modelManager(cfg, { onChange = () => {} } = {}) {
  let models = [], timer = 0;
  const tryBoxes = new Map(); // model kimliği -> 'Dene' paneli: liste yeniden çizilse de açık panel ve yazılan metin korunur
  const info = h('p', { class: 'muted small' });
  const out = h('div', { class: 'small', role: 'status' });
  const list = h('div', { class: 'stack mm-list' });
  const root = h('div', { class: 'stack mm' }, info, h('div', { class: 'row gap wrap' }), out, list);
  const bar = root.children[1];

  const sum = (ms) => ms.reduce((t, m) => t + (m.uzak || 0), 0);
  const unknown = (ms) => ms.filter((m) => m.uzak == null).length;
  async function download(ms, title) {
    ms = ms.filter((m) => !m.hazir && !(m.is && ['kuyrukta', 'iniyor'].includes(m.is.state)));
    if (!ms.length) { out.textContent = 'İndirilecek yeni model yok.'; return; }
    const lines = ms.map((m) => `• ${m.id} — ${gb(m.uzak)}`).join('\n');
    const warn = unknown(ms) ? `\n(${unknown(ms)} modelin boyutu henüz öğrenilemedi; toplam daha büyük olabilir.)` : '';
    if (!confirm(`${title}\n\n${lines}\n\nToplam yaklaşık ${gb(sum(ms))}${warn}\nHugging Face önbelleğine iner; kesilirse kaldığı yerden sürer. Başlansın mı?`)) return;
    try { await post('/models/download', { ids: ms.map((m) => m.id) }); out.textContent = `${ms.length} model indiriliyor…`; await refresh(); } catch (e) { out.textContent = '✗ ' + e.message; }
  }
  const btn = (text, fn, cls = 'btn ghost small') => h('button', { class: cls, type: 'button', onclick: fn }, text);

  async function rate(m, puan) {
    const next = m.puan === puan ? null : puan;
    await post('/models/rate', { id: m.id, puan: next });
    if (next === 'begenme' && m.diskte > 0 && !(m.is && ['kuyrukta', 'iniyor'].includes(m.is.state)) && confirm(`"${m.ad}" diskten silinsin mi? ${gb(m.diskte)} boşalır. (İstersen sonra yeniden indirebilirsin.)`)) await remove(m, false);
    await refresh();
  }
  async function remove(m, ask = true) {
    if (ask && !confirm(`"${m.ad}" diskten silinsin mi? ${gb(m.diskte)} boşalır.`)) return;
    tryBoxes.delete(m.id);
    try { const r = await (await post('/models/delete', { id: m.id })).json(); out.textContent = `✓ ${m.ad} silindi (${gb(r.serbest)} boşaldı).`; if (cfg.serverModel === m.id) { cfg.serverModel = ''; onChange(); } } catch (e) { out.textContent = '✗ ' + e.message; }
    await refresh();
  }

  function tryPanel(m) {
    const text = h('textarea', { class: 'input', rows: 3 }, TEST_TEXT);
    const voice = h('select', { class: 'input' });
    const fill = async () => {
      const lib = ['voxcpm', 'omnivoice', 'pocket'].includes(m.adaptor) ? await serverVoices().catch(() => []) : [];
      voice.replaceChildren(...[
        ...(m.sesler || []).map((s) => h('option', { value: s.id }, s.ad)),
        ...(lib.length ? [] : (m.sesler || []).length ? [] : [h('option', { value: 'f' }, 'Otomatik · kadın'), h('option', { value: 'm' }, 'Otomatik · erkek')]),
        ...lib.map((v) => h('option', { value: v.name, 'data-g': v.gender }, `${v.label} · ${v.gender === 'm' ? 'erkek' : 'kadın'}`)),
        ...(lib.length ? [h('option', { value: 'f' }, 'Otomatik · kadın'), h('option', { value: 'm' }, 'Otomatik · erkek')] : [])
      ]);
    };
    fill();
    const status = h('div', { class: 'small muted' });
    const player = h('audio', { controls: true, hidden: true, class: 'w100' });
    const go = h('button', { class: 'btn primary small', type: 'button' }, 'Konuştur');
    go.onclick = async () => {
      go.disabled = true; status.textContent = 'Üretiliyor… (model ilk seferde GPU belleğine yüklenir, 1-2 dakika sürebilir)';
      const t0 = Date.now();
      try {
        const sel = voice.selectedOptions[0];
        const gender = sel?.dataset.g || (voice.value === 'm' ? 'm' : 'f');
        const r = await post('/tts', { text: normalizeTR(text.value), gender, voice: voice.value, model: m.id, lang: 'tr-TR' });
        const blob = await r.blob();
        player.src = URL.createObjectURL(blob); player.hidden = false; player.play().catch(() => {});
        status.textContent = `✓ ${((Date.now() - t0) / 1000).toFixed(1)} sn · beğendiysen 👍, değilse 👎 ile ayıkla`;
      } catch (e) { status.textContent = '✗ ' + e.message; } finally { go.disabled = false; }
    };
    return h('div', { class: 'stack mm-try' }, text, h('div', { class: 'row gap wrap' }, voice, go), player, status);
  }

  function row(m) {
    const job = m.is && ['kuyrukta', 'iniyor'].includes(m.is.state) ? m.is : null;
    const pct = job && (job.total || m.uzak) ? Math.min(100, Math.round((job.received / (job.total || m.uzak)) * 100)) : 0;
    const chips = [m.param, PLATFORM[m.platform] + (m.platformKesin ? '' : ' (?)'), m.lisans.toUpperCase(), m.tur === 'özgün' ? '' : m.tur].filter(Boolean).map((t) => h('span', { class: 'chip ghosty small' }, t));
    if (m.hazir) chips.unshift(h('span', { class: 'chip ok-chip small' }, `✓ indirildi · ${gb(m.diskte)}`));
    else if (m.diskte > 0 && !job) chips.unshift(h('span', { class: 'chip warn small' }, `yarım · ${gb(m.diskte)}`));
    if (m.calistirilabilir && m.hazir) chips.push(h('span', { class: 'chip on small' }, 'dinlenebilir'));
    if (!tryBoxes.has(m.id)) tryBoxes.set(m.id, h('div', { hidden: true }));
    const tryBox = tryBoxes.get(m.id);
    const tryBtn = m.hazir && m.calistirilabilir ? btn('▶ Dene', () => { tryBox.hidden = !tryBox.hidden; if (!tryBox.hidden && !tryBox.children.length) tryBox.append(tryPanel(m)); }) : null;
    const use = m.hazir && m.calistirilabilir ? btn(cfg.serverModel === m.id ? '✓ Kullanılıyor' : 'Bunu kullan', () => { cfg.serverModel = cfg.serverModel === m.id ? '' : m.id; onChange(); render(); }, cfg.serverModel === m.id ? 'btn primary small' : 'btn ghost small') : null;
    const dl = !m.hazir && !job ? btn(`İndir (${gb(m.uzak)})`, () => {
      if (m.platform === 'mlx' && !confirm('Bu model Apple Silicon (MLX) içindir; RTX/Windows bilgisayarda çalışmaz. Yine de indirilsin mi?')) return;
      download([m], `${m.ad} indirilecek:`);
    }) : null;
    const del = m.diskte > 0 && !job ? btn('Sil', () => remove(m)) : null;
    const like = h('button', { class: 'btn small ' + (m.puan === 'begen' ? 'primary' : 'ghost'), type: 'button', 'aria-label': 'Beğendim', title: 'Beğendim — dursun', onclick: () => rate(m, 'begen') }, '👍');
    const dislike = h('button', { class: 'btn small ' + (m.puan === 'begenme' ? 'primary' : 'ghost'), type: 'button', 'aria-label': 'Beğenmedim', title: 'Beğenmedim — diskten silinsin', onclick: () => rate(m, 'begenme') }, '👎');
    return h('div', { 'data-id': m.id, class: 'card mm-row' + (m.puan === 'begenme' ? ' dim' : '') },
      h('div', { class: 'row gap wrap' }, h('b', {}, m.ad), h('code', { class: 'small' }, m.id), ...chips),
      h('p', { class: 'small' }, m.not),
      m.uyari ? h('p', { class: 'small mm-warn' }, '⚠ ' + m.uyari) : null,
      m.hazir && !m.calistirilabilir && m.adaptor ? h('p', { class: 'small muted' }, m.calistirNot) : null,
      job ? h('div', { class: 'stack' }, h('div', { class: 'meter thin' }, h('div', { style: { width: pct + '%' } })), h('span', { class: 'small muted' }, `İndiriliyor ${gb(job.received)} / ${gb(job.total || m.uzak)} (%${pct})`)) : null,
      m.is?.state === 'hata' ? h('p', { class: 'small mm-warn' }, '✗ İndirme hatası: ' + m.is.msg) : null,
      h('div', { class: 'row gap wrap' }, dl, tryBtn, use, del, h('span', { class: 'grow' }), like, dislike),
      tryBox);
  }

  // Klonlayan modeller referans kayıtla istenen sesi sürdürür (kendi sesiniz, yeni sesler); klonlamayanlar hazır seslerle konuşur.
  const CLONERS = new Set(['voxcpm', 'omnivoice', 'chatterbox', 'xtts', 'moss', 'pocket']);
  const open = new Set(); // liste yeniden çizilince açık gruplar kapanmasın
  function render() {
    const adap = models.filter((m) => m.adaptor);
    const cloners = adap.filter((m) => CLONERS.has(m.adaptor));
    const plain = adap.filter((m) => !CLONERS.has(m.adaptor));
    const onlyDl = models.filter((m) => !m.adaptor && m.platform !== 'mlx');
    const mlx = models.filter((m) => !m.adaptor && m.platform === 'mlx');
    const grp = (id, title, desc, ms) => {
      if (!ms.length) return null;
      const d = h('details', { class: 'vsec', 'data-grp': id, open: open.has(id) ? true : null }, h('summary', {}, `${title} (${ms.length})`), h('div', { class: 'stack vpad' }, h('p', { class: 'muted small' }, desc), ...ms.map(row)));
      d.addEventListener('toggle', () => (d.open ? open.add(id) : open.delete(id)));
      return d;
    };
    list.replaceChildren(...[
      grp('clone', 'Ses klonlayan modeller', 'Kayıttan ses klonlar ve yeni sesler tasarlar. İndir, ▶ Dene ile dinle, beğendiğini "Bunu kullan" yap.', cloners),
      grp('plain', 'Ses klonlamayan modeller', 'Hazır seslerle konuşur (klon yok). Dinlemek ve karşılaştırmak içindir.', plain),
      grp('dl', 'Yalnız indirilebilir', 'Çalıştırıcı henüz yok (GGUF ya da kartı kod vermeyen modeller). İndirebilirsin ama burada dinleyemezsin.', onlyDl),
      grp('mlx', 'Apple MLX', 'Yalnız Apple Silicon bilgisayarlarda çalışır; RTX 5090 dizüstünde işe yaramaz.', mlx)
    ].filter(Boolean));
    const doneSize = models.reduce((t, m) => t + (m.diskte || 0), 0);
    info.textContent = `${models.length} model · diskte ${gb(doneSize)} · beğenilen ${models.filter((m) => m.puan === 'begen').length} · beğenilmeyen ${models.filter((m) => m.puan === 'begenme').length}`;
    const rec = models.filter((m) => m.oneri), runnable = models.filter((m) => m.adaptor && m.platform === 'cuda'), all = models.filter((m) => !m.ek), bad = models.filter((m) => m.puan === 'begenme' && m.diskte > 0);
    bar.replaceChildren(
      btn('Önerilen seti indir', () => download(rec, 'Önerilen set indirilecek:'), 'btn primary small'),
      btn('Çalıştırılabilenleri indir', () => download(runnable, 'Çalıştırılabilen modeller indirilecek:')),
      btn(`Hepsini indir (${all.length} MIT model)`, () => download(all, 'Katalogdaki bütün MIT modeller indirilecek:')),
      btn(`Beğenilmeyenleri sil (${bad.length})`, async () => {
        if (!bad.length || !confirm(`${bad.length} model silinecek (${gb(bad.reduce((t, m) => t + m.diskte, 0))} boşalır):\n${bad.map((m) => '• ' + m.id).join('\n')}`)) return;
        for (const m of bad) await remove(m, false);
      }),
      cfg.serverModel ? btn('Otomatik motora dön', () => { cfg.serverModel = ''; onChange(); render(); }) : h('span', { class: 'muted small' }, 'Şu an: otomatik motor seçimi'));
  }

  async function refresh() {
    clearTimeout(timer);
    try {
      const j = await (await api('/models')).json();
      models = j.models;
      if (!j.hf) out.textContent = 'huggingface_hub kurulu değil: server\\.venv içinde  pip install huggingface_hub';
      render();
      if (root.isConnected && models.some((m) => (m.is && ['kuyrukta', 'iniyor'].includes(m.is.state)) || m.uzak == null)) timer = setTimeout(refresh, 2500);
    } catch (e) { info.textContent = '✗ ' + e.message; }
  }
  return { el: root, refresh };
}
