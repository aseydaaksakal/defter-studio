// Lokal sunucudaki ses kütüphanesi arayüzü (Ayarlar › Seslendirme › Lokal sunucu):
//   ses kütüphanem (dinle, adlandır, cinsiyet, transkript, sil) · ses tasarla (hazır tasarımlar + yeniden dene) ·
//   kendi sesimi klonla (sınırsız) · ses kadrosu (podcast için 2-6 konuşmacı, video anlatıcısı) · lokal modeller.
// Kütüphanedeki her ses bir referans kayıttır: OmniVoice, VoxCPM2, Pocket ve Chatterbox aynı kayıtla aynı sesi sürdürür.
import { h } from './ui.js';
import { serverUrl, serverInfo } from './server.js';
import { serverVoices, uploadServerVoice, deleteServerVoice, patchServerVoice, serverVoiceUrl, serverPresets, designServerVoice } from './tts.js';
import { modelManager } from './model-manager.js';

const NAMES = { f: ['Deniz', 'Elif', 'Zeynep', 'Ayşe', 'Selin', 'Defne'], m: ['Kaan', 'Emre', 'Murat', 'Can', 'Mert', 'Berk'] };
export const MAX_CAST = 6;
const G = (g) => (g === 'm' ? 'erkek' : 'kadın');
const slug = (s) => (s || '').toLocaleLowerCase('tr').replace(/[^a-z0-9ığüşöç_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

export function voiceLibrary({ cfg, voiceInput, onChange = () => {} }) {
  let voices = [], presets = [], motors = [];
  const status = h('div', { class: 'small', role: 'status' });
  const btn = (text, fn, cls = 'btn ghost small') => h('button', { class: cls, type: 'button', onclick: fn }, text);
  const opt = (v, t, sel) => h('option', { value: v, selected: sel ? true : null }, t);
  const sec = (title, open, ...body) => h('details', { class: 'vsec', open: open ? true : null }, h('summary', {}, title), h('div', { class: 'stack vpad' }, ...body));
  const field = (label, ...el) => h('div', { class: 'field' }, h('label', {}, label), ...el);

  // ---------- Varsayılan sesler
  const sF = h('select', { class: 'input' }), sM = h('select', { class: 'input' });
  sF.onchange = () => { cfg.serverF = sF.value; onChange(); }; sM.onchange = () => { cfg.serverM = sM.value; onChange(); };

  // ---------- Ses kütüphanem
  const list = h('div', { class: 'stack' });
  const libTitle = h('summary', {}, 'Ses kütüphanem');
  function voiceRow(v) {
    const audio = h('audio', { controls: true, preload: 'none', class: 'vl-audio' });
    serverVoiceUrl(v.name).then((u) => { audio.src = u; });
    const txt = h('textarea', { class: 'input', rows: 3, hidden: true, placeholder: 'Kaydın tam metni. Klonu iyileştirir; boşsa otomatik çıkarılır.' }, v.text || '');
    const save = btn('Metni kaydet', async () => { await patchServerVoice(v.name, { text: txt.value }); await refresh(); }, 'btn primary small');
    save.hidden = true;
    const textBtn = btn('Transkript', () => { txt.hidden = !txt.hidden; save.hidden = txt.hidden; });
    const state = { var: 'transkript var', bekliyor: 'transkript çıkarılıyor…', otomatik: 'transkript otomatik' }[v.textState] || '';
    return h('div', { class: 'card vl-row' },
      h('div', { class: 'row gap wrap' },
        h('b', {}, v.label),
        h('button', { class: 'chip small', type: 'button', title: 'Cinsiyeti değiştirmek için tıklayın', onclick: async () => { await patchServerVoice(v.name, { gender: v.gender === 'm' ? 'f' : 'm' }); await refresh(); } }, G(v.gender) + ' sesi'),
        h('span', { class: 'chip ghosty small' }, v.source === 'tasarım' ? `tasarım · ${v.engine || ''}` : 'klon'),
        v.seconds ? h('span', { class: 'chip ghosty small' }, v.seconds + ' sn') : null,
        h('span', { class: 'muted small' }, state)),
      audio,
      h('div', { class: 'row gap wrap' },
        btn('Adı değiştir', async () => { const n = prompt('Sesin adı', v.label); if (n && n.trim()) { await patchServerVoice(v.name, { label: n.trim() }); await refresh(); } }),
        textBtn,
        btn('Sil', async () => {
          if (!confirm(`"${v.label}" sesi silinsin mi?`)) return;
          await deleteServerVoice(v.name);
          cfg.cast = (cfg.cast || []).map((c) => (c.voice === v.name ? { ...c, voice: '' } : c));
          if (cfg.narratorVoice?.name === v.name) cfg.narratorVoice = null;
          if (cfg.serverF === v.name) cfg.serverF = ''; if (cfg.serverM === v.name) cfg.serverM = '';
          onChange(); await refresh();
        })),
      txt, save);
  }

  // ---------- Ses tasarla
  const pSel = h('select', { class: 'input' }), mSel = h('select', { class: 'input' });
  const dOut = h('div', { class: 'small', role: 'status' });
  const play = async (name) => { const u = await serverVoiceUrl(name); if (u) new Audio(u).play().catch(() => {}); };
  const design = async (p, label) => {
    const r = await designServerVoice({ preset: p.id, motor: mSel.value || undefined });
    await refresh(); play(r.name); return r;
  };
  const dBtn = btn('Bu sesi tasarla', async () => {
    const p = presets.find((x) => x.id === pSel.value); if (!p) return;
    dBtn.disabled = true; dOut.textContent = 'Tasarlanıyor… (GPU modeli ilk seferde yükler, 1-2 dakika sürebilir)';
    try { const r = await design(p); dOut.textContent = `✓ "${r.name}" kütüphaneye eklendi (${r.motor}). Beğenmediyseniz silip yeniden tasarlayın: her tasarım farklı çıkar.`; } catch (e) { dOut.textContent = '✗ ' + e.message; } finally { dBtn.disabled = false; }
  }, 'btn primary small');
  const dAll = btn('Hazır 8 sesin hepsini oluştur', async () => {
    dAll.disabled = dBtn.disabled = true;
    try {
      for (const [i, p] of presets.filter((x) => !x.created).entries()) {
        dOut.textContent = `Tasarlanıyor ${i + 1}… ${p.label}`;
        await designServerVoice({ preset: p.id, motor: mSel.value || undefined }); await refresh();
      }
      dOut.textContent = '✓ Hazır sesler kütüphanede. Dinleyip beğenmediğinizi silin.';
    } catch (e) { dOut.textContent = '✗ ' + e.message; } finally { dAll.disabled = dBtn.disabled = false; }
  });

  // ---------- Kendi sesimi klonla
  const input = voiceInput();
  const cName = h('input', { class: 'input', placeholder: 'Ses adı, örn. Benim sesim' });
  const cGender = h('select', { class: 'input' }, opt('f', 'Kadın sesi'), opt('m', 'Erkek sesi'));
  const cText = h('textarea', { class: 'input', rows: 2, placeholder: '(İsteğe bağlı) Kaydın tam metni. Boşsa kendiliğinden çıkarılır.' });
  const consent = h('input', { type: 'checkbox' });
  const cOut = h('div', { class: 'small', role: 'status' });
  const cBtn = btn('Kütüphaneye ekle', async () => {
    if (!consent.checked) return (cOut.textContent = 'Önce izni onaylayın.');
    const d = await input.get(); if (!d) return (cOut.textContent = 'Önce kayıt yapın ya da dosya seçin.');
    if (d.seconds < 6) return (cOut.textContent = 'Kayıt en az 6–10 saniye olmalı.');
    const label = cName.value.trim() || 'Ses ' + (voices.length + 1);
    const name = slug(label) || 'ses-' + Date.now().toString(36);
    if (voices.some((v) => v.name === name) && !confirm(`"${name}" adlı ses var; üzerine yazılsın mı?`)) return;
    cBtn.disabled = true;
    try { await uploadServerVoice(name, cGender.value, d.blob, { label, text: cText.value.trim() }); cOut.textContent = `✓ "${label}" eklendi. Artık podcast ve videolarda seçebilirsiniz.`; cName.value = ''; cText.value = ''; await refresh(); } catch (e) { cOut.textContent = '✗ ' + e.message; } finally { cBtn.disabled = false; }
  }, 'btn primary small');

  // ---------- Ses kadrosu
  cfg.cast = Array.isArray(cfg.cast) ? cfg.cast : [];
  const castBox = h('div', { class: 'stack' });
  const nextName = (g) => NAMES[g].find((n) => !cfg.cast.some((c) => c.name === n)) || NAMES[g][0];
  function renderCast() {
    castBox.replaceChildren(...cfg.cast.map((c, i) => {
      const name = h('input', { class: 'input small-in', value: c.name || '', placeholder: 'Konuşmacı adı' });
      name.oninput = () => { c.name = name.value.trim(); onChange(); };
      const voice = h('select', { class: 'input small-in' }, opt('', 'Otomatik ses', !c.voice), ...voices.map((v) => opt(v.name, `${v.label} · ${G(v.gender)}`, v.name === c.voice)));
      const gender = h('select', { class: 'input small-in', disabled: c.voice ? true : null }, opt('f', 'Kadın', c.gender !== 'm'), opt('m', 'Erkek', c.gender === 'm'));
      voice.onchange = () => { c.voice = voice.value; const v = voices.find((x) => x.name === c.voice); if (v) c.gender = v.gender; onChange(); renderCast(); };
      gender.onchange = () => { c.gender = gender.value; onChange(); };
      return h('div', { class: 'row gap wrap' }, h('b', { class: 'cast-i' }, 'ABCDEF'[i]), name, voice, gender, btn('Çıkar', () => { cfg.cast.splice(i, 1); onChange(); renderCast(); }));
    }));
  }
  const addCast = btn('+ Konuşmacı ekle', () => { if (cfg.cast.length >= MAX_CAST) return; const g = cfg.cast.length % 2 ? 'm' : 'f'; cfg.cast.push({ name: nextName(g), gender: g, voice: '' }); onChange(); renderCast(); });
  const fillCast = btn('Kütüphaneden doldur', () => {
    if (!voices.length) return (status.textContent = 'Kütüphane boş: önce ses tasarlayın ya da klonlayın.');
    const used = { f: 0, m: 0 };
    cfg.cast = voices.slice(0, 5).map((v) => ({ name: NAMES[v.gender][used[v.gender]++ % 6], gender: v.gender, voice: v.name }));
    onChange(); renderCast();
  });
  const narr = h('select', { class: 'input' });
  narr.onchange = () => { const v = voices.find((x) => x.name === narr.value); cfg.narratorVoice = v ? { name: v.name, gender: v.gender } : null; onChange(); };

  // ---------- Lokal modeller
  const mm = modelManager(cfg, { onChange });
  const mmSec = sec('Lokal modeller (Hugging Face) — indir, dene, beğen / sil', false, mm.el);
  mmSec.addEventListener('toggle', () => mmSec.open && mm.refresh());

  const el = h('div', { class: 'stack' },
    status,
    h('div', { class: 'grid2' }, field('Başlangıç kadın sesi', sF), field('Başlangıç erkek sesi', sM)),
    h('p', { class: 'muted small' }, 'Bir konuşmacıya ses seçilmediyse kütüphanedeki sesler cinsiyete göre sırayla dağıtılır. Ayarlar Kaydet’e basınca geçerli olur.'),
    h('details', { class: 'vsec', open: true }, libTitle, h('div', { class: 'stack vpad' }, list)),
    sec('Ses tasarla — tarifle yeni ses (kadın / erkek, yaş, perde)', false,
      h('p', { class: 'muted small' }, 'Tarif bir kez örnek kayda çevrilir ve kütüphaneye klon referansı olarak girer; böylece her motor aynı sesi sürdürür. Her tasarım farklı çıkar: beğenmediğinizi silip yeniden deneyin.'),
      h('div', { class: 'row gap wrap' }, pSel, mSel, dBtn, dAll), dOut),
    sec('Kendi sesimi klonla (sınırsız, bilgisayarınızda kalır)', false, input.el,
      h('div', { class: 'row gap wrap' }, cName, cGender), cText,
      h('label', { class: 'row gap small' }, consent, 'Bu ses benim ya da sahibinden açık izin aldım.'), h('div', { class: 'row gap' }, cBtn), cOut),
    sec('Ses kadrosu — podcast (2–6 konuşmacı) ve video anlatıcısı', false,
      h('p', { class: 'muted small' }, 'Konuşmacıları adlandırın ve kütüphaneden ses seçin. Podcast oluştururken “Sesler › Ses kadrom” ve “Konuşmacı sayısı”nı seçin.'),
      castBox, h('div', { class: 'row gap wrap' }, addCast, fillCast),
      field('Video anlatıcısı', narr)),
    mmSec);

  function fillSelects() {
    const o = (g, cur) => [opt('', 'Otomatik', !cur), ...voices.filter((v) => v.gender === g).map((v) => opt(v.name, v.label, v.name === cur))];
    sF.replaceChildren(...o('f', cfg.serverF)); sM.replaceChildren(...o('m', cfg.serverM));
    narr.replaceChildren(opt('', 'Otomatik (ayarlardaki erkek / kadın anlatıcı)', !cfg.narratorVoice), ...voices.map((v) => opt(v.name, `${v.label} · ${G(v.gender)}`, v.name === cfg.narratorVoice?.name)));
    pSel.replaceChildren(...presets.map((p) => opt(p.id, (p.created ? '✓ ' : '') + p.label)));
    mSel.replaceChildren(...(motors.length > 1 ? motors.map((m) => opt(m, { omnivoice: 'OmniVoice ile', voxcpm: 'VoxCPM2 ile' }[m] || m)) : motors.length ? [opt(motors[0], motors[0])] : [opt('', 'Tasarım motoru yok')]));
    dBtn.disabled = dAll.disabled = !motors.length;
  }

  async function refresh() {
    const u = await serverUrl(true);
    if (!u) { status.textContent = 'Lokal sunucu kapalı. server/baslat.bat ile açın (docs/KURULUM.md).'; list.replaceChildren(h('p', { class: 'muted small' }, 'Sunucu açıkken ses kütüphanesi burada görünür.')); return; }
    const i = serverInfo();
    status.textContent = `✓ Sunucu çalışıyor · seslendirme: ${i?.tts?.engines?.join(', ') || '—'}${i?.tts?.design?.length ? '' : ' · ses tasarlamak için OmniVoice kurun ya da Trendyol-TTS / VoxCPM2 indirin'}${i?.tts?.female === false ? ' · kadın sesi için bir kadın ses ekleyin' : ''}`;
    try {
      voices = await serverVoices();
      const p = await serverPresets(); presets = p.presets; motors = p.motors;
    } catch (e) { status.textContent += ' · ' + e.message; }
    libTitle.textContent = `Ses kütüphanem (${voices.length})`;
    list.replaceChildren(...(voices.length ? voices.map(voiceRow) : [h('p', { class: 'muted small' }, 'Henüz ses yok. “Ses tasarla” ile hazır seslerden oluşturun ya da kendi sesinizi klonlayın.')]));
    fillSelects(); renderCast();
    if (voices.some((v) => v.textState === 'bekliyor')) setTimeout(() => el.isConnected && refresh(), 4000);
  }
  return { el, refresh };
}
