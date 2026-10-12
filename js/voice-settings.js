// Ayarlar › Seslendirme bölümü: motor seçimi, anahtarlar, kadın/erkek ses seçimi, MiniMax ses klonlama ve tasarımı,
// lokal sunucuda ücretsiz ses klonlama (Chatterbox/XTTS), "Sesi dene".
import { h, icon, toast } from './ui.js';
import {
  ENGINES, ENGINE_SHORT, VOICES, loadTTS, saveTTS, synthesize, listElevenVoices, listGoogleVoices, minimaxUpload, minimaxClone,
  minimaxDesign, newVoiceId, recordVoice, toWav, serverVoices, uploadServerVoice, deleteServerVoice, resolveEngine, femaleOK
} from './tts.js';
import { serverUrl, serverInfo } from './server.js';

const READ_TEXT = 'Merhaba, bu kayıt ses klonlama için hazırlanıyor. Sakin ve net bir sesle, her zamanki konuşma hızımla okuyorum. Bugün hava güzel; denizde rüzgâr hafif, dalgalar küçük. Gemiler limana yaklaşırken telsizden kısa ve açık mesajlar duyuluyor. Öğrenmek, tekrar etmek ve anlamak için bu cümleleri doğal bir tonla seslendiriyorum.';
const GEMINI_DESC = { Kore: 'kararlı', Aoede: 'ferah', Leda: 'genç', Zephyr: 'parlak', Sulafat: 'sıcak', Despina: 'yumuşak', Achernar: 'yumuşak', Vindemiatrix: 'nazik', Charon: 'bilgilendirici', Puck: 'neşeli', Orus: 'kararlı', Iapetus: 'net', Algenib: 'pürüzlü', Sadaltager: 'bilgili', Alnilam: 'kararlı', Schedar: 'dengeli' };

// Kayıt / dosya seçme bileşeni: { el, get(): Promise<{blob, seconds}|null> }
function voiceInput() {
  let rec = null, data = null, t0 = 0, timer = 0;
  const info = h('span', { class: 'muted small' }, 'Kayıt yok');
  const file = h('input', { type: 'file', accept: 'audio/*', class: 'input' });
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

export async function voiceSettings() {
  const tts = await loadTTS();
  const cfg = { ...tts };
  const out = h('div', { class: 'small', role: 'status' });
  const now = h('p', { class: 'small' });
  const inp = (key, attrs = {}) => { const e = h('input', { class: 'input', value: cfg[key] ?? '', autocomplete: 'off', ...attrs }); e.oninput = () => { cfg[key] = e.value.trim(); }; return e; };
  const key = (k, ph) => inp(k, { type: 'password', placeholder: ph || 'API anahtarı' });
  const sel = (k, options) => { const e = h('select', { class: 'input' }, options.map(([v, t]) => h('option', { value: v, selected: v === (cfg[k] || '') ? true : null }, t))); e.onchange = () => { cfg[k] = e.value; }; return e; };
  const fill = (e, k, options) => { e.replaceChildren(...options.map(([v, t]) => h('option', { value: v, selected: v === (cfg[k] || '') ? true : null }, t))); };
  const field = (label, ...el) => h('div', { class: 'field' }, h('label', {}, label), ...el);
  const sec = (title, open, ...body) => h('details', { class: 'vsec', open: open ? true : null }, h('summary', {}, title), h('div', { class: 'grid2' }, ...body));
  const link = (href, t) => h('a', { href, target: '_blank', rel: 'noopener' }, t);

  const engine = sel('engine', Object.entries(ENGINES));
  const narrator = sel('narrator', [['m', 'Erkek anlatıcı'], ['f', 'Kadın anlatıcı']]);

  // ElevenLabs
  const eF = sel('elevenF', [['', cfg.elevenF ? 'Seçili kadın sesi' : 'Varsayılan kadın sesi']]);
  const eM = sel('elevenM', [['', cfg.elevenM ? 'Seçili erkek sesi' : 'Varsayılan erkek sesi']]);
  const eList = h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
    out.textContent = 'ElevenLabs sesleri alınıyor…';
    try {
      const vs = await listElevenVoices(cfg.elevenKey);
      const o = (v) => [v.id, `${v.name}${v.gender ? ' · ' + v.gender : ''}${v.lang ? ' · ' + v.lang : ''}`];
      fill(eF, 'elevenF', [['', 'Varsayılan'], ...vs.filter((v) => !/^male$/i.test(v.gender)).map(o)]);
      fill(eM, 'elevenM', [['', 'Varsayılan'], ...vs.filter((v) => !/female/i.test(v.gender)).map(o)]);
      out.textContent = `${vs.length} ses bulundu. En doğal Türkçe için Ses Kütüphanesi'nden Türkçe anadil sesleri hesabınıza ekleyin.`;
    } catch (e) { out.textContent = '✗ ' + e.message; }
  } }, 'Sesleri listele');
  const elevenSec = sec('ElevenLabs — en gerçekçi (AA Arena 1.)', !!cfg.elevenKey,
    field('API anahtarı', key('elevenKey', 'elevenlabs.io › Developers › API Keys')),
    field('Model', inp('elevenModel', { list: 'dl-eleven' }), h('datalist', { id: 'dl-eleven' }, ['eleven_v4', 'eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5'].map((m) => h('option', { value: m })))),
    field('Kadın sesi', h('div', { class: 'row gap' }, eF, eList)), field('Erkek sesi', eM));

  // Gemini
  const gOpts = (g) => [['', 'Otomatik'], ...VOICES.gemini[g].map((v) => [v, `${v} · ${GEMINI_DESC[v] || ''}`])];
  const geminiSec = sec('Gemini TTS — ücretsiz katman, çok doğal', !cfg.elevenKey,
    field('API anahtarı (ücretsiz)', key('geminiKey', 'Gemini sağlayıcısı seçiliyse onun anahtarı kullanılır'), h('div', { class: 'muted small' }, link('https://aistudio.google.com/apikey', 'aistudio.google.com/apikey'), ' › Create API key')),
    field('Model', inp('geminiModel', { list: 'dl-gemini' }), h('datalist', { id: 'dl-gemini' }, ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'].map((m) => h('option', { value: m })))),
    field('Kadın sesi', sel('geminiF', gOpts('f'))), field('Erkek sesi', sel('geminiM', gOpts('m'))));

  // MiniMax
  const mmMine = () => cfg.minimaxVoices || [];
  const mmOpts = (g) => [['', g === 'f' ? 'Turkish_CalmWoman (hazır)' : 'Turkish_Trustworthyman (hazır)'], ...mmMine().filter((v) => v.gender === g).map((v) => [v.id, `${v.name} · ${v.kind === 'design' ? 'tasarım' : 'klon'}`])];
  const mF = sel('minimaxF', mmOpts('f')), mM = sel('minimaxM', mmOpts('m'));
  const mmRefresh = () => { fill(mF, 'minimaxF', mmOpts('f')); fill(mM, 'minimaxM', mmOpts('m')); };
  const addMine = (v) => { cfg.minimaxVoices = [...mmMine(), v]; cfg[v.gender === 'm' ? 'minimaxM' : 'minimaxF'] = v.id; mmRefresh(); };
  const cloneIn = voiceInput();
  const consent = h('input', { type: 'checkbox' });
  const cName = h('input', { class: 'input', placeholder: 'Ses adı, örn. Benim sesim' });
  const cGender = h('select', { class: 'input' }, h('option', { value: 'f' }, 'Kadın sesi'), h('option', { value: 'm' }, 'Erkek sesi'));
  const cOut = h('div', { class: 'small' });
  const cloneBtn = h('button', { class: 'btn primary small', type: 'button', onclick: async () => {
    if (!cfg.minimaxKey) return (cOut.textContent = 'Önce MiniMax API anahtarını girin.');
    if (!consent.checked) return (cOut.textContent = 'Klonlamadan önce izni onaylayın.');
    const d = await cloneIn.get();
    if (!d) return (cOut.textContent = 'Önce kayıt yapın ya da dosya seçin.');
    if (d.seconds < 10) return (cOut.textContent = 'Kayıt en az 10 saniye olmalı.');
    if (d.seconds > 300) return (cOut.textContent = 'Kayıt en fazla 5 dakika olabilir.');
    cloneBtn.disabled = true;
    try {
      cOut.textContent = 'Kayıt yükleniyor…';
      const fileId = await minimaxUpload(cfg.minimaxKey, d.blob);
      cOut.textContent = 'Ses klonlanıyor…';
      const id = newVoiceId('defter');
      const r = await minimaxClone(cfg.minimaxKey, { fileId, voiceId: id, model: cfg.minimaxModel || 'speech-2.8-hd', previewText: 'Merhaba! Artık podcastlerde ve videolarda bu sesle konuşacağım.' });
      addMine({ id, name: cName.value.trim() || 'Klon ' + new Date().toLocaleDateString('tr'), gender: cGender.value, kind: 'clone', at: Date.now() });
      await saveTTS(cfg);
      cOut.replaceChildren('✓ Klon hazır ve seçildi (7 gün kullanılmazsa MiniMax siler). ', r.demo ? h('audio', { controls: true, src: r.demo, autoplay: true }) : '');
    } catch (e) { cOut.textContent = '✗ ' + e.message; } finally { cloneBtn.disabled = false; }
  } }, 'Klonla');
  const dPrompt = h('textarea', { class: 'input', rows: 2 }, 'Sıcak, tok ve net diksiyonlu, orta yaşlı Türk erkek belgesel anlatıcısı; sakin ama merak uyandıran, kusursuz İstanbul Türkçesi.');
  const dGender = h('select', { class: 'input' }, h('option', { value: 'm' }, 'Erkek sesi'), h('option', { value: 'f' }, 'Kadın sesi'));
  const dOut = h('div', { class: 'small' });
  const designBtn = h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
    if (!cfg.minimaxKey) return (dOut.textContent = 'Önce MiniMax API anahtarını girin.');
    designBtn.disabled = true; dOut.textContent = 'Ses tasarlanıyor…';
    try {
      const r = await minimaxDesign(cfg.minimaxKey, { prompt: dPrompt.value.trim(), previewText: 'Merhaba, ben bu defterin anlatıcısıyım. Bugün sizinle konunun en önemli noktalarını birlikte keşfedeceğiz.' });
      addMine({ id: r.voiceId, name: 'Tasarım ' + new Date().toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' }), gender: dGender.value, kind: 'design', at: Date.now() });
      await saveTTS(cfg);
      dOut.replaceChildren('✓ Ses tasarlandı ve seçildi. ', r.trial ? h('audio', { controls: true, autoplay: true, src: URL.createObjectURL(r.trial) }) : '');
    } catch (e) { dOut.textContent = '✗ ' + e.message; } finally { designBtn.disabled = false; }
  } }, 'Metinden ses tasarla');
  const minimaxSec = sec('MiniMax — Türkçe kadın/erkek, ses klonlama', !!cfg.minimaxKey,
    field('API anahtarı', key('minimaxKey', 'platform.minimax.io › API Keys')),
    field('Model', inp('minimaxModel', { list: 'dl-mm' }), h('datalist', { id: 'dl-mm' }, ['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo'].map((m) => h('option', { value: m })))),
    field('Kadın sesi', mF), field('Erkek sesi', mM),
    h('div', { class: 'field span2 card' },
      h('b', {}, 'Ses klonla'),
      h('p', { class: 'muted small' }, '10 sn – 5 dk temiz kayıt. Klon MiniMax hesabınızda oluşur, 7 gün kullanılmazsa silinir. Hesap doğrulaması gerekebilir.'),
      cloneIn.el,
      h('div', { class: 'row gap wrap' }, cName, cGender),
      h('label', { class: 'row gap small' }, consent, 'Bu ses benim ya da sahibinden açık izin aldım.'),
      h('div', { class: 'row gap' }, cloneBtn), cOut),
    h('div', { class: 'field span2 card' }, h('b', {}, 'Metinle ses tasarla'), dPrompt, h('div', { class: 'row gap' }, dGender, designBtn), dOut));

  // Google Cloud
  const goF = sel('googleF', [['', 'Otomatik (en kaliteli kadın)']]), goM = sel('googleM', [['', 'Otomatik (en kaliteli erkek)']]);
  const goList = h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
    out.textContent = 'Google sesleri alınıyor…';
    try {
      const vs = await listGoogleVoices(cfg.googleKey);
      fill(goF, 'googleF', [['', 'Otomatik'], ...vs.filter((v) => v.gender === 'FEMALE').map((v) => [v.name, v.name])]);
      fill(goM, 'googleM', [['', 'Otomatik'], ...vs.filter((v) => v.gender === 'MALE').map((v) => [v.name, v.name])]);
      out.textContent = `${vs.length} Türkçe ses bulundu.`;
    } catch (e) { out.textContent = '✗ ' + e.message; }
  } }, 'Sesleri listele');
  const googleSec = sec('Google Cloud TTS — Chirp 3 HD (ayda 1M karakter ücretsiz)', !!cfg.googleKey,
    field('API anahtarı', key('googleKey', 'console.cloud.google.com › Text-to-Speech API › Kimlik bilgileri')),
    field('Kadın sesi', h('div', { class: 'row gap' }, goF, goList)), field('Erkek sesi', goM));

  // Azure
  const azureSec = sec('Azure Speech — Emel / Ahmet (ayda 0,5M karakter ücretsiz)', !!cfg.azureKey,
    field('Anahtar', key('azureKey', 'portal.azure.com › Speech kaynağı › Keys')),
    field('Bölge', inp('azureRegion', { placeholder: 'westeurope' })),
    field('Kadın sesi', sel('azureF', [['', 'tr-TR-EmelNeural'], ...VOICES.azure.f.slice(1).map((v) => [v, v])])),
    field('Erkek sesi', sel('azureM', [['', 'tr-TR-AhmetNeural'], ...VOICES.azure.m.slice(1).map((v) => [v, v])])));

  const openaiSec = sec('OpenAI TTS', !!cfg.openaiKey, field('API anahtarı', key('openaiKey')), field('Model', inp('openaiModel')));

  // Lokal sunucu ses klonlama
  const sOut = h('div', { class: 'small' });
  const sF = sel('serverF', [['', 'Otomatik']]), sM = sel('serverM', [['', 'Otomatik']]);
  const sList = h('div', { class: 'row gap wrap' });
  const srvIn = voiceInput();
  const sName = h('input', { class: 'input', placeholder: 'Ses adı (harf/rakam), örn. benim-sesim' });
  const sGender = h('select', { class: 'input' }, h('option', { value: 'f' }, 'Kadın sesi'), h('option', { value: 'm' }, 'Erkek sesi'));
  const sConsent = h('input', { type: 'checkbox' });
  async function refreshServer() {
    const u = await serverUrl(true);
    if (!u) { sOut.textContent = 'Lokal sunucu kapalı. server/baslat.bat ile açın (docs/KURULUM.md).'; return; }
    const i = serverInfo();
    sOut.textContent = `✓ Sunucu çalışıyor · seslendirme: ${i?.tts?.engines?.join(', ') || i?.tts || '—'}${i?.tts?.female === false ? ' · kadın sesi için edge-tts ya da bir kadın klonu ekleyin' : ''}`;
    const vs = await serverVoices();
    const o = (g) => [['', 'Otomatik'], ...vs.filter((v) => v.gender === g).map((v) => [v.name, v.name])];
    fill(sF, 'serverF', o('f')); fill(sM, 'serverM', o('m'));
    sList.replaceChildren(...vs.map((v) => h('span', { class: 'chip' }, `${v.name} · ${v.gender === 'm' ? 'erkek' : 'kadın'}`, h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Sil', onclick: async () => { await deleteServerVoice(v.name); refreshServer(); } }, icon('trash', 13)))));
  }
  const sUp = h('button', { class: 'btn primary small', type: 'button', onclick: async () => {
    if (!sConsent.checked) return (sOut.textContent = 'Önce izni onaylayın.');
    const d = await srvIn.get(); if (!d) return (sOut.textContent = 'Önce kayıt yapın ya da dosya seçin.');
    if (d.seconds < 6) return (sOut.textContent = 'Kayıt en az 6–10 saniye olmalı.');
    const name = (sName.value.trim() || 'ses-' + Date.now().toString(36)).toLocaleLowerCase('tr').replace(/[^a-z0-9ığüşöç_-]+/g, '-');
    try { await uploadServerVoice(name, sGender.value, d.blob); cfg[sGender.value === 'm' ? 'serverM' : 'serverF'] = name; await refreshServer(); sOut.textContent += ' · ✓ ses eklendi ve seçildi'; } catch (e) { sOut.textContent = '✗ ' + e.message; }
  } }, 'Sunucuya yükle');
  const serverSec = sec('Lokal sunucu — ücretsiz ses klonlama (Chatterbox / XTTS)', false,
    field('Kadın sesi', sF), field('Erkek sesi', sM),
    h('div', { class: 'field span2' }, sOut, sList),
    h('div', { class: 'field span2 card' }, h('b', {}, 'Lokal ses klonla (ücretsiz, bilgisayarınızda kalır)'), srvIn.el,
      h('div', { class: 'row gap wrap' }, sName, sGender), h('label', { class: 'row gap small' }, sConsent, 'Bu ses benim ya da sahibinden açık izin aldım.'), h('div', { class: 'row gap' }, sUp)));
  serverSec.addEventListener('toggle', () => serverSec.open && refreshServer());

  const testBtn = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
    await saveTTS(cfg); out.textContent = 'Deneniyor…';
    try {
      const r = await synthesize('test:' + Date.now(), [
        { speaker: 'A', text: 'Merhaba, ben Deniz. GMDSS bir Şubat bin dokuz yüz doksan dokuzda tam olarak yürürlüğe girdi.', tone: 'sıcak' },
        { speaker: 'B', text: 'Ben de Kaan. Bugün deniz sahalarını konuşacağız, hazır mısın?', tone: 'neşeli' }],
        [{ id: 'A', name: 'Deniz', gender: 'f', role: 'sunucu' }, { id: 'B', name: 'Kaan', gender: 'm', role: 'sunucu' }], 'Türkçe', { onProgress: (m) => (out.textContent = m) });
      if (r.blob) { new Audio(URL.createObjectURL(r.blob)).play(); out.textContent = `✓ ${ENGINE_SHORT[r.engine]} çalışıyor (dinliyorsunuz)${femaleOK(r.engine) ? '' : ' · bu motorda Türkçe kadın sesi yok'}`; }
      else out.textContent = 'Tarayıcı sesi seçili: podcast satır satır okunur.';
    } catch (e) { out.textContent = '✗ ' + e.message; }
  } }, 'Sesi dene (kadın + erkek)');

  const el = h('div', { class: 'voice-settings' },
    h('h3', {}, 'Seslendirme (podcast ve video)'),
    now,
    h('div', { class: 'grid2' }, field('Ses motoru', engine), field('Video anlatıcısı', narrator)),
    elevenSec, geminiSec, minimaxSec, googleSec, azureSec, openaiSec, serverSec,
    h('div', { class: 'row gap' }, testBtn, out));
  resolveEngine(cfg).then((e) => { now.textContent = `Şu an kullanılacak motor: ${ENGINE_SHORT[e]}.${femaleOK(e) ? '' : ' Bu motorda Türkçe kadın sesi yok — ücretsiz Gemini anahtarı ekleyin ya da lokal sunucuyu açın.'}`; });
  return { el, read: () => ({ ...cfg }) };
}
