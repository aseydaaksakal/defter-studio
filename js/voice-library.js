// Ses stüdyosu (Ayarlar'dan ve podcast'ten açılır): lokal sunucudaki (RTX GPU'nuz) bütün sesler ve modeller tek yerde.
//   Seslerim (hazır + tasarlanmış + klon: dinle, adlandır, sil) · Yeni ses (tek tıkla kadın/erkek) · Kendi sesimi klonla (ücretsiz, bilgisayarda kalır) ·
//   Podcast karakterleri (Ayşe, Fatma, Hasan… adlı kadro, her birine ses) · Modeller (klonlayan / klonlamayan, Hugging Face).
// Kütüphanedeki her ses bir referans kayıttır: OmniVoice, VoxCPM2 ve Chatterbox aynı kayıtla aynı sesi sürdürür; hazır sesler Pocket TR'dir.
import { h, toast } from './ui.js';
import { serverUrl, serverInfo } from './server.js';
import { serverVoices, uploadServerVoice, deleteServerVoice, patchServerVoice, serverVoiceUrl, serverPresets, designServerVoice, testVoice, recordVoice, toWav } from './tts.js';
import { modelManager } from './model-manager.js';

const NAMES = { f: ['Ayşe', 'Fatma', 'Elif', 'Zeynep', 'Selin', 'Defne', 'Deniz'], m: ['Hasan', 'Hüseyin', 'Kaan', 'Emre', 'Murat', 'Can', 'Mert'] };
export const MAX_CAST = 6;
const G = (g) => (g === 'm' ? 'erkek' : 'kadın');
const slug = (s) => (s || '').toLocaleLowerCase('tr').replace(/[^a-z0-9ığüşöç_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const AGES = [['young adult', 'genç', 'A young', 'lively'], ['middle-aged', 'orta yaşlı', 'A middle-aged', 'calm'], ['elderly', 'olgun', 'An elderly', 'wise and gentle']];
const PITCH = [['low pitch', 'tok', 'deep'], ['moderate pitch', 'dengeli', 'clear'], ['high pitch', 'ince', 'bright']];
const READ_TEXT = 'Merhaba, bu kayıt ses klonlama için hazırlanıyor. Sakin ve net bir sesle, her zamanki konuşma hızımla okuyorum. Bugün hava güzel; denizde rüzgâr hafif, dalgalar küçük. Gemiler limana yaklaşırken telsizden kısa ve açık mesajlar duyuluyor. Öğrenmek, tekrar etmek ve anlamak için bu cümleleri doğal bir tonla seslendiriyorum.';

// Kayıt / dosya seçme bileşeni: { el, get(): Promise<{blob, seconds}|null> }
export function voiceInput() {
  let rec = null, data = null, t0 = 0, timer = 0;
  const info = h('span', { class: 'muted small' }, 'Kayıt yok');
  const file = h('input', { type: 'file', accept: 'audio/*,video/*', class: 'input' });
  const recBtn = h('button', { class: 'btn ghost small', type: 'button' }, '● Kayda başla');
  const player = h('audio', { controls: true, hidden: true, class: 'w100' });
  const show = (d) => { data = d; info.textContent = `${d.seconds.toFixed(1)} sn hazır`; player.src = URL.createObjectURL(d.blob); player.hidden = false; };
  recBtn.onclick = async () => {
    if (!rec) {
      try { rec = await recordVoice(); } catch (e) { toast('Mikrofon açılamadı: ' + e.message, 'error'); return; }
      t0 = Date.now(); recBtn.textContent = '■ Kaydı bitir';
      timer = setInterval(() => (info.textContent = `Kaydediliyor ${Math.round((Date.now() - t0) / 1000)} sn — aşağıdaki metni okuyun`), 500);
    } else {
      clearInterval(timer); recBtn.textContent = '● Yeniden kaydet';
      const r = rec; rec = null; show(await r.stop());
    }
  };
  file.onchange = async () => { const f = file.files[0]; if (f) { info.textContent = 'Dönüştürülüyor…'; try { show(await toWav(f)); } catch (e) { info.textContent = 'Okunamadı: ' + e.message; } } };
  return {
    el: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Okunacak metin (≈30 sn): ', h('i', {}, READ_TEXT)),
      h('div', { class: 'row gap wrap' }, recBtn, h('span', {}, 'ya da'), file, info), player),
    get: async () => data
  };
}

export function voiceLibrary({ cfg, onChange = () => {} }) {
  let voices = [], presets = [], motors = [], playing = null;
  const status = h('div', { class: 'small', role: 'status' });
  const btn = (text, fn, cls = 'btn ghost small') => h('button', { class: cls, type: 'button', onclick: fn }, text);
  const opt = (v, t, sel) => h('option', { value: v, selected: sel ? true : null }, t);
  const sec = (title, open, ...body) => h('details', { class: 'vsec', open: open ? true : null }, h('summary', {}, title), h('div', { class: 'stack vpad' }, ...body));
  const head = (t, hint) => h('div', { class: 'stack' }, h('h3', {}, t), hint ? h('p', { class: 'muted small' }, hint) : null);
  const field = (label, ...el) => h('div', { class: 'field' }, h('label', {}, label), ...el);
  const stop = () => { try { playing?.pause(); } catch {} playing = null; };
  const playUrl = async (u) => { stop(); playing = new Audio(u); await playing.play(); };

  // ---------- Durum + motor kurulumu + tanı
  const diag = h('div', { class: 'small stack', role: 'status' });
  const kurOut = h('span', { class: 'muted small' });
  const kurBtn = btn('Pocket TR kur (6 hazır ses)', async () => {
    const base = await serverUrl(true); if (!base) return;
    kurBtn.disabled = true; kurOut.textContent = 'Başlıyor…';
    try {
      await fetch(base + '/kur/pockettr', { method: 'POST' });
      for (let k = 0; k < 600; k++) {
        await new Promise((r) => setTimeout(r, 2000));
        const d = await (await fetch(base + '/kur/durum')).json();
        kurOut.textContent = d.msg;
        if (d.state === 'done') { await refresh(); toast('Pocket TR hazır: 3 kadın + 3 erkek ses', 'info'); break; }
        if (d.state === 'error') { kurOut.textContent = '✗ ' + d.msg; break; }
      }
    } catch (e) { kurOut.textContent = '✗ ' + e.message; } finally { kurBtn.disabled = false; }
  }, 'btn primary small');
  const diagBtn = btn('Motorları sına', async () => {
    const base = await serverUrl(true);
    if (!base) { diag.replaceChildren(h('p', {}, '✗ Lokal sunucu çalışmıyor.')); return; }
    diagBtn.disabled = true; diag.replaceChildren(h('p', { class: 'muted' }, 'Motorlar deneniyor (ilk denemede model yüklenir; birkaç dakika sürebilir)…'));
    try {
      const r = await fetch(base + '/tts/selftest', { signal: AbortSignal.timeout(900000) });
      if (!r.ok) throw new Error((await r.text()).slice(0, 200));
      const j = await r.json(), i = j.info || {};
      const env = [i.gpu ? `${i.gpu} (${i.capability || '?'})` : 'GPU yok/görünmüyor', i.torch ? 'torch ' + i.torch : 'torch kurulu değil', i.vramFreeGb != null ? `boş VRAM ${i.vramFreeGb}/${i.vramTotalGb} GB` : '',
        (i.ollamaLoaded || []).length ? 'Ollama VRAM\'de: ' + i.ollamaLoaded.join(', ') : '', i.edge ? 'edge-tts ' + i.edge : ''].filter(Boolean).join(' · ');
      diag.replaceChildren(h('p', { class: 'muted' }, env),
        ...j.results.map((x) => h('p', {}, x.ok ? `✓ ${x.engine} — kadın + erkek çalışıyor (${x.seconds} sn)` : `✗ ${x.engine} — ${x.error}`, x.hint ? h('br') : '', x.hint ? h('i', {}, '→ ' + x.hint) : '')),
        h('p', { class: 'muted' }, 'Hata varsa bu çıktıyı kopyalayıp Claude\'a gönderin.'));
    } catch (e) { diag.replaceChildren(h('p', {}, '✗ Tanı çalışmadı: ' + e.message)); } finally { diagBtn.disabled = false; }
  });

  // ---------- Seslerim
  const list = h('div', { class: 'stack' });
  const libTitle = h('h3', {}, 'Seslerim');
  function voiceRow(v) {
    const playB = btn('▶', async () => {
      playB.disabled = true; const old = playB.textContent; playB.textContent = '…';
      try {
        const u = await serverVoiceUrl(v.name);
        await playUrl(u);
      } catch (e) { toast('Dinlenemedi: ' + e.message, 'error'); } finally { playB.disabled = false; playB.textContent = old; }
    }, 'btn primary small');
    playB.title = 'Dinle'; playB.setAttribute('aria-label', 'Dinle: ' + v.label);
    const txt = h('textarea', { class: 'input', rows: 3, hidden: true, placeholder: 'Kaydın tam metni. Klonu iyileştirir; boşsa otomatik çıkarılır.' }, v.text || '');
    const save = btn('Metni kaydet', async () => { await patchServerVoice(v.name, { text: txt.value }); await refresh(); }, 'btn primary small');
    save.hidden = true;
    const textBtn = v.builtin ? null : btn('Transkript', () => { txt.hidden = !txt.hidden; save.hidden = txt.hidden; });
    const src = v.builtin ? 'hazır · Pocket TR' : v.source === 'tasarım' ? `tasarım · ${v.engine || ''}` : 'klon';
    return h('div', { class: 'card vl-row', 'data-voice': v.name },
      h('div', { class: 'row gap wrap' },
        playB, h('b', {}, v.label),
        v.builtin ? h('span', { class: 'chip small' }, G(v.gender) + ' sesi') : h('button', { class: 'chip small', type: 'button', title: 'Cinsiyeti değiştirmek için tıklayın', onclick: async () => { await patchServerVoice(v.name, { gender: v.gender === 'm' ? 'f' : 'm' }); await refresh(); } }, G(v.gender) + ' sesi'),
        h('span', { class: 'chip ghosty small' }, src),
        v.seconds ? h('span', { class: 'chip ghosty small' }, v.seconds + ' sn' ) : null,
        h('span', { class: 'grow' }),
        v.builtin ? null : btn('Adı', async () => { const n = prompt('Sesin adı', v.label); if (n && n.trim()) { await patchServerVoice(v.name, { label: n.trim() }); await refresh(); } }),
        textBtn,
        v.builtin ? null : btn('Sil', async () => {
          if (!confirm(`"${v.label}" sesi silinsin mi?`)) return;
          await deleteServerVoice(v.name);
          cfg.cast = (cfg.cast || []).map((c) => (c.voice === v.name ? { ...c, voice: '' } : c));
          if (cfg.narratorVoice?.name === v.name) cfg.narratorVoice = null;
          if (cfg.serverF === v.name) cfg.serverF = ''; if (cfg.serverM === v.name) cfg.serverM = '';
          onChange(); await refresh();
        })),
      txt, save);
  }

  // ---------- Yeni ses (tek tıkla) + tarifle tasarım
  const nOut = h('div', { class: 'small', role: 'status' });
  const used = () => new Set(voices.map((v) => v.label));
  const nextName = (g) => { const u = used(); for (let k = 0; k < 3; k++) for (const n of NAMES[g]) { const l = k ? `${n} ${k + 1}` : n; if (![...u].some((x) => x === l || x.startsWith(l + ' ·'))) return l; } return NAMES[g][0] + ' ' + Date.now().toString(36).slice(-3); };
  async function newVoice(g) {
    if (!motors.length) { nOut.textContent = 'Yeni ses tasarlamak için bir tasarım motoru gerekir (OmniVoice ya da Trendyol-TTS/VoxCPM2). Şimdilik hazır sesleri kullanın ya da kendi sesinizi klonlayın.'; return; }
    const tried = new Set(voices.map((v) => v.instruct).filter(Boolean));
    let a, p, instruct;
    for (let k = 0; k < 12; k++) { a = AGES[Math.floor(Math.random() * AGES.length)]; p = PITCH[Math.floor(Math.random() * PITCH.length)]; instruct = `${g === 'f' ? 'female' : 'male'}, ${a[0]}, ${p[0]}`; if (!tried.has(instruct)) break; }
    const nm = nextName(g);
    const label = `${nm} · ${a[1]}, ${p[1]}`;
    const desc = `${a[2]} ${g === 'f' ? 'woman' : 'man'}, ${a[3]} and ${p[2]} voice`;
    nOut.textContent = `${G(g)} sesi tasarlanıyor… (GPU modeli ilk seferde yükler, 1-2 dakika sürebilir)`;
    for (const b of [bF, bM]) b.disabled = true;
    try {
      const r = await designServerVoice({ gender: g, instruct, desc, name: slug(nm) + '-' + Math.random().toString(36).slice(2, 5), label, motor: mSel.value || undefined });
      await refresh(); playUrl(await serverVoiceUrl(r.name)).catch(() => {});
      nOut.textContent = `✓ "${label}" eklendi ve çalıyor. Beğenmediyseniz Sil'e basıp yeni bir tane üretin: her tasarım farklı çıkar.`;
    } catch (e) { nOut.textContent = '✗ ' + e.message; } finally { for (const b of [bF, bM]) b.disabled = false; }
  }
  const bF = btn('+ Yeni kadın sesi üret', () => newVoice('f'), 'btn primary'), bM = btn('+ Yeni erkek sesi üret', () => newVoice('m'), 'btn primary');
  const pSel = h('select', { class: 'input' }), mSel = h('select', { class: 'input' });
  const dBtn = btn('Bu tarifi tasarla', async () => {
    const p = presets.find((x) => x.id === pSel.value); if (!p) return;
    dBtn.disabled = true; nOut.textContent = 'Tasarlanıyor…';
    try { const r = await designServerVoice({ preset: p.id, motor: mSel.value || undefined }); await refresh(); playUrl(await serverVoiceUrl(r.name)).catch(() => {}); nOut.textContent = `✓ "${r.name}" eklendi (${r.motor}).`; } catch (e) { nOut.textContent = '✗ ' + e.message; } finally { dBtn.disabled = false; }
  });

  // ---------- Kendi sesimi klonla (ücretsiz, bilgisayarda)
  const input = voiceInput();
  const cName = h('input', { class: 'input', placeholder: 'Ses adı, örn. Benim sesim' });
  const cGender = h('select', { class: 'input' }, opt('f', 'Kadın sesi'), opt('m', 'Erkek sesi'));
  const cText = h('textarea', { class: 'input', rows: 2, placeholder: '(İsteğe bağlı) Kaydın tam metni. Boşsa kendiliğinden çıkarılır.' });
  const consent = h('input', { type: 'checkbox' });
  const cOut = h('div', { class: 'small', role: 'status' });
  const cBtn = btn('Klonla ve kütüphaneye ekle', async () => {
    if (!consent.checked) return (cOut.textContent = 'Önce izni onaylayın.');
    const d = await input.get(); if (!d) return (cOut.textContent = 'Önce kayıt yapın ya da dosya seçin.');
    if (d.seconds < 6) return (cOut.textContent = 'Kayıt en az 6–10 saniye olmalı.');
    const label = cName.value.trim() || 'Ses ' + (voices.length + 1);
    const name = slug(label) || 'ses-' + Date.now().toString(36);
    if (voices.some((v) => v.name === name) && !confirm(`"${name}" adlı ses var; üzerine yazılsın mı?`)) return;
    cBtn.disabled = true;
    try { await uploadServerVoice(name, cGender.value, d.blob, { label, text: cText.value.trim() }); cOut.textContent = `✓ "${label}" eklendi (RTX GPU'nuzla çalışır, hiçbir yere gönderilmez). Karakterlere atayabilirsiniz.`; cName.value = ''; cText.value = ''; await refresh(); } catch (e) { cOut.textContent = '✗ ' + e.message; } finally { cBtn.disabled = false; }
  }, 'btn primary');

  // ---------- Podcast karakterleri
  cfg.cast = Array.isArray(cfg.cast) ? cfg.cast : [];
  const castBox = h('div', { class: 'stack' });
  const castNextName = (g) => NAMES[g].find((n) => !cfg.cast.some((c) => c.name === n)) || NAMES[g][0];
  function renderCast() {
    castBox.replaceChildren(...cfg.cast.map((c, i) => {
      const name = h('input', { class: 'input small-in', value: c.name || '', placeholder: 'Karakter adı' });
      name.oninput = () => { c.name = name.value.trim(); onChange(); };
      const pool = voices.filter((v) => v.gender === (c.gender === 'm' ? 'm' : 'f'));
      const voice = h('select', { class: 'input small-in' }, opt('', 'Otomatik ses', !c.voice), ...pool.map((v) => opt(v.name, v.label, v.name === c.voice)));
      const gender = h('select', { class: 'input small-in' }, opt('f', 'Kadın', c.gender !== 'm'), opt('m', 'Erkek', c.gender === 'm'));
      voice.onchange = () => { c.voice = voice.value; onChange(); };
      gender.onchange = () => { c.gender = gender.value; if (c.voice && !voices.some((v) => v.name === c.voice && v.gender === c.gender)) c.voice = ''; onChange(); renderCast(); };
      const hear = btn('▶', async () => {
        hear.disabled = true;
        try { const b = await testVoice(c.voice || (c.gender === 'm' ? 'm' : 'f'), c.gender, `Merhaba, ben ${c.name || 'konuşmacı'}. Bugün sizinle önemli bir konuyu konuşacağız.`); await playUrl(URL.createObjectURL(b)); } catch (e) { toast('Dinlenemedi: ' + e.message, 'error'); } finally { hear.disabled = false; }
      }, 'btn primary small');
      hear.title = 'Bu karakterin sesini dinle';
      return h('div', { class: 'row gap wrap cast-row' }, h('b', { class: 'cast-i' }, 'ABCDEF'[i]), name, gender, voice, hear, btn('Çıkar', () => { cfg.cast.splice(i, 1); onChange(); renderCast(); }));
    }));
  }
  const addCast = btn('+ Karakter ekle', () => { if (cfg.cast.length >= MAX_CAST) return; const g = cfg.cast.length % 2 ? 'm' : 'f'; cfg.cast.push({ name: castNextName(g), gender: g, voice: '' }); onChange(); renderCast(); });
  const fillCast = btn('Hazır kadro: Ayşe, Fatma, Hasan, Hüseyin', () => {
    if (!voices.length) return (status.textContent = 'Önce ses ekleyin: Pocket TR kurun ya da yeni ses üretin.');
    const plan = [['Ayşe', 'f'], ['Fatma', 'f'], ['Hasan', 'm'], ['Hüseyin', 'm']];
    const idx = { f: 0, m: 0 };
    cfg.cast = plan.map(([name, g]) => { const pool = voices.filter((v) => v.gender === g); const v = pool.length ? pool[idx[g]++ % pool.length] : null; return { name, gender: g, voice: v ? v.name : '' }; });
    onChange(); renderCast();
  });
  const narr = h('select', { class: 'input' });
  narr.onchange = () => { const v = voices.find((x) => x.name === narr.value); cfg.narratorVoice = v ? { name: v.name, gender: v.gender } : null; onChange(); };

  // ---------- Modeller (Hugging Face): klonlayan / klonlamayan
  const mm = modelManager(cfg, { onChange });
  const mmSec = sec('Modeller (Hugging Face) — indir, dene, beğen / sil', false, mm.el);
  mmSec.addEventListener('toggle', () => mmSec.open && mm.refresh());

  const el = h('div', { class: 'stack studio' },
    status,
    h('div', { class: 'row gap wrap' }, kurBtn, diagBtn, kurOut), diag,
    h('div', { class: 'stack' }, libTitle, list),
    h('div', { class: 'stack' }, head('Yeni ses', 'Tek tıkla yeni bir kadın ya da erkek sesi tasarlanır (RTX GPU\'nuzda, ücretsiz). Hazır sesler Pocket TR\'dir.'),
      h('div', { class: 'row gap wrap' }, bF, bM), nOut,
      sec('Tarifle tasarla (gelişmiş)', false, h('div', { class: 'row gap wrap' }, pSel, mSel, dBtn))),
    h('div', { class: 'stack' }, head('Kendi sesimi klonla', 'Ücretsiz ve sınırsız: kayıt yalnız bilgisayarınızda, GPU\'nuzla işlenir; hiçbir buluta gitmez. Klonlanan ses kütüphaneye girer ve her yerde seçilebilir.'),
      input.el, h('div', { class: 'row gap wrap' }, cName, cGender), cText,
      h('label', { class: 'row gap small' }, consent, 'Bu ses benim ya da sahibinden açık izin aldım.'), h('div', { class: 'row gap' }, cBtn), cOut),
    h('div', { class: 'stack' }, head('Podcast karakterleri', 'Karakterleri adlandırın ve her birine bir ses seçin. Podcast üretirken “Karakterlerim (Ses stüdyosu)” seçin; üretilmiş podcast’te de karakter sesi ve satır konuşmacısı değiştirilebilir.'),
      castBox, h('div', { class: 'row gap wrap' }, addCast, fillCast), field('Video anlatıcısı', narr)),
    mmSec);

  function fillSelects() {
    narr.replaceChildren(opt('', 'Otomatik', !cfg.narratorVoice), ...voices.map((v) => opt(v.name, `${v.label} · ${G(v.gender)}`, v.name === cfg.narratorVoice?.name)));
    pSel.replaceChildren(...presets.map((p) => opt(p.id, (p.created ? '✓ ' : '') + p.label)));
    mSel.replaceChildren(...(motors.length > 1 ? motors.map((m) => opt(m, { omnivoice: 'OmniVoice ile', voxcpm: 'VoxCPM2 ile' }[m] || m)) : motors.length ? [opt(motors[0], motors[0])] : [opt('', 'Tasarım motoru yok')]));
    dBtn.disabled = bF.disabled = bM.disabled = !motors.length;
  }

  async function refresh() {
    const u = await serverUrl(true);
    if (!u) {
      status.textContent = 'Bilgisayarınızdaki sunucuya bağlanılamadı. Ayarlar › Bilgisayarım bölümünden bağlanın (kurulum: tek seferlik kur.bat).';
      list.replaceChildren(h('p', { class: 'muted small' }, 'Sunucu açıkken sesleriniz burada görünür.')); kurBtn.hidden = true; return;
    }
    const i = serverInfo(), t = i?.tts || {};
    kurBtn.hidden = !!t.pocketTr;
    status.textContent = `✓ Sunucu çalışıyor · motorlar: ${(t.engines || []).filter((e) => e !== 'piper').join(', ') || '—'}${t.design?.length ? '' : ' · yeni ses tasarlamak için OmniVoice kurun'}`;
    try {
      voices = await serverVoices();
      const p = await serverPresets(); presets = p.presets; motors = p.motors;
    } catch (e) { status.textContent += ' · ' + e.message; }
    libTitle.textContent = `Seslerim (${voices.length})`;
    list.replaceChildren(...(voices.length ? voices.map(voiceRow) : [h('p', { class: 'muted small' }, 'Henüz ses yok. “Pocket TR kur” ile 6 hazır ses ekleyin, “Yeni ses” ile tasarlayın ya da kendi sesinizi klonlayın.')]));
    fillSelects(); renderCast();
    if (voices.some((v) => v.textState === 'bekliyor')) setTimeout(() => el.isConnected && refresh(), 4000);
  }
  return { el, refresh, stop };
}
