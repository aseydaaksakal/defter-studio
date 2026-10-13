// Ayarlar › Seslendirme (0.8.0 sade): ses motoru + "Ses stüdyosu" düğmesi + "Sesi dene" + tek açılır "Bulut API anahtarları" grubu
// (her sağlayıcı tek satır: ad · anahtar · ⚙). Ses kütüphanesi, tasarım, klonlama, kadro ve modeller artık Ses stüdyosunda (voice-library.js).
import { h, toast } from './ui.js';
import {
  ENGINES, ENGINE_CHOICES, ENGINE_SHORT, VOICES, loadTTS, saveTTS, synthesize, listElevenVoices, listGoogleVoices, minimaxUpload, minimaxClone,
  minimaxDesign, newVoiceId, resolveEngine, femaleOK, listFishVoices
} from './tts.js';
import { voiceInput } from './voice-library.js';
import { openVoiceStudio } from './voice-studio.js';

const GEMINI_DESC = { Kore: 'kararlı', Aoede: 'ferah', Leda: 'genç', Zephyr: 'parlak', Sulafat: 'sıcak', Despina: 'yumuşak', Achernar: 'yumuşak', Vindemiatrix: 'nazik', Charon: 'bilgilendirici', Puck: 'neşeli', Orus: 'kararlı', Iapetus: 'net', Algenib: 'pürüzlü', Sadaltager: 'bilgili', Alnilam: 'kararlı', Schedar: 'dengeli' };

export async function voiceSettings() {
  const tts = await loadTTS();
  const cfg = { ...tts };
  const dirty = {}; // yalnız bu pencerede değiştirilen alanlar kaydedilir (Ses stüdyosunun ayarlarını ezmemek için)
  const persist = async () => saveTTS({ ...(await loadTTS()), ...dirty });
  const out = h('div', { class: 'small', role: 'status' });
  const now = h('p', { class: 'small' });
  const inp = (key, attrs = {}) => { const e = h('input', { class: 'input', value: cfg[key] ?? '', autocomplete: 'off', ...attrs }); e.oninput = () => { cfg[key] = dirty[key] = e.value.trim(); }; return e; };
  const key = (k, ph) => inp(k, { type: 'password', placeholder: ph || 'API anahtarı' });
  const sel = (k, options) => { const e = h('select', { class: 'input' }, options.map(([v, t]) => h('option', { value: v, selected: v === (cfg[k] || '') ? true : null }, t))); e.onchange = () => { cfg[k] = dirty[k] = e.value; }; return e; };
  const fill = (e, k, options) => { e.replaceChildren(...options.map(([v, t]) => h('option', { value: v, selected: v === (cfg[k] || '') ? true : null }, t))); };
  const field = (label, ...el) => h('div', { class: 'field' }, h('label', {}, label), ...el);
  // Bulut sağlayıcı satırı: ad · anahtar · ⚙ (model/ses ayrıntıları açılır). Anahtar girilmişse ayrıntılar açık gelmez; sade kalır.
  const prov = (name, keyEl, ...extras) => {
    const more = h('div', { class: 'grid2 prov-more', hidden: true }, ...extras);
    const tg = h('button', { class: 'btn ghost small', type: 'button', title: 'Model ve ses ayarları', 'aria-label': name + ' ayrıntıları', onclick: () => { more.hidden = !more.hidden; } }, '⚙');
    return h('div', { class: 'prov' }, h('div', { class: 'prov-row' }, h('span', { class: 'prov-name' }, name), keyEl, extras.length ? tg : h('span')), more);
  };
  const link = (href, t) => h('a', { href, target: '_blank', rel: 'noopener' }, t);

  const SHORTLBL = { auto: 'Otomatik (lokal sunucu varsa o)', server: 'Lokal sunucu (RTX GPU\'m)' };
  const engine = sel('engine', ENGINE_CHOICES.map((k) => [k, SHORTLBL[k] || ENGINE_SHORT[k] || ENGINES[k]]));
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
  const elevenSec = prov('ElevenLabs', key('elevenKey', 'elevenlabs.io › Developers › API Keys'),
    field('Model', inp('elevenModel', { list: 'dl-eleven' }), h('datalist', { id: 'dl-eleven' }, ['eleven_v4', 'eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5'].map((m) => h('option', { value: m })))),
    field('Kadın sesi', h('div', { class: 'row gap' }, eF, eList)), field('Erkek sesi', eM));

  // Gemini
  const gOpts = (g) => [['', 'Otomatik'], ...VOICES.gemini[g].map((v) => [v, `${v} · ${GEMINI_DESC[v] || ''}`])];
  const geminiSec = prov('Gemini', key('geminiKey', 'aistudio.google.com/apikey (ücretsiz)'),
    field('Model', inp('geminiModel', { list: 'dl-gemini' }), h('datalist', { id: 'dl-gemini' }, ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'].map((m) => h('option', { value: m })))),
    field('Kadın sesi', sel('geminiF', gOpts('f'))), field('Erkek sesi', sel('geminiM', gOpts('m'))));

  // MiniMax
  const mmMine = () => cfg.minimaxVoices || [];
  const mmOpts = (g) => [['', g === 'f' ? 'Turkish_CalmWoman (hazır)' : 'Turkish_Trustworthyman (hazır)'], ...mmMine().filter((v) => v.gender === g).map((v) => [v.id, `${v.name} · ${v.kind === 'design' ? 'tasarım' : 'klon'}`])];
  const mF = sel('minimaxF', mmOpts('f')), mM = sel('minimaxM', mmOpts('m'));
  const mmRefresh = () => { fill(mF, 'minimaxF', mmOpts('f')); fill(mM, 'minimaxM', mmOpts('m')); };
  const addMine = (v) => { cfg.minimaxVoices = dirty.minimaxVoices = [...mmMine(), v]; cfg[v.gender === 'm' ? 'minimaxM' : 'minimaxF'] = dirty[v.gender === 'm' ? 'minimaxM' : 'minimaxF'] = v.id; mmRefresh(); };
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
      await persist();
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
      await persist();
      dOut.replaceChildren('✓ Ses tasarlandı ve seçildi. ', r.trial ? h('audio', { controls: true, autoplay: true, src: URL.createObjectURL(r.trial) }) : '');
    } catch (e) { dOut.textContent = '✗ ' + e.message; } finally { designBtn.disabled = false; }
  } }, 'Metinden ses tasarla');
  const minimaxSec = prov('MiniMax', key('minimaxKey', 'platform.minimax.io › API Keys'),
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
  const googleSec = prov('Google Cloud TTS', key('googleKey', 'console.cloud.google.com › Text-to-Speech API'),
    field('Kadın sesi', h('div', { class: 'row gap' }, goF, goList)), field('Erkek sesi', goM));

  // Azure
  const azureSec = prov('Azure Speech', key('azureKey', 'portal.azure.com › Speech kaynağı › Keys'),
    field('Bölge', inp('azureRegion', { placeholder: 'westeurope' })),
    field('Kadın sesi', sel('azureF', [['', 'tr-TR-EmelNeural'], ...VOICES.azure.f.slice(1).map((v) => [v, v])])),
    field('Erkek sesi', sel('azureM', [['', 'tr-TR-AhmetNeural'], ...VOICES.azure.m.slice(1).map((v) => [v, v])])));

  // Fish Audio (ses kimliği = reference_id; ses seçilmezse her satırda farklı ses gelir, bu yüzden kadın ve erkek seçimi şart)
  const fF = sel('fishF', [['', cfg.fishF ? 'Seçili kadın sesi (' + cfg.fishF.slice(0, 8) + '…)' : 'Önce “Türkçe sesleri listele”']]);
  const fM = sel('fishM', [['', cfg.fishM ? 'Seçili erkek sesi (' + cfg.fishM.slice(0, 8) + '…)' : 'Önce “Türkçe sesleri listele”']]);
  const fList = h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
    out.textContent = 'Fish Audio sesleri alınıyor…';
    try {
      const vs = await listFishVoices(cfg.fishKey, 'tr');
      const o = (v) => [v.id, `${v.name}${v.gender ? (v.gender === 'f' ? ' · kadın' : ' · erkek') : ''}${v.desc ? ' · ' + v.desc : ''}`];
      fill(fF, 'fishF', [['', 'Seçin…'], ...vs.filter((v) => v.gender !== 'm').map(o)]);
      fill(fM, 'fishM', [['', 'Seçin…'], ...vs.filter((v) => v.gender !== 'f').map(o)]);
      out.textContent = `${vs.length} Türkçe ses bulundu. Bir kadın ve bir erkek seçin; “Sesi dene” ile dinleyin.`;
    } catch (e) { out.textContent = '✗ ' + e.message; }
  } }, 'Türkçe sesleri listele');
  const fishSec = prov('Fish Audio', key('fishKey', 'fish.audio/app/api-keys'),
    field('Model', inp('fishModel', { list: 'dl-fish' }), h('datalist', { id: 'dl-fish' }, ['s2.1-pro-free', 's2.1-pro', 's2-pro', 's1'].map((m) => h('option', { value: m })))),
    field('Kadın sesi', h('div', { class: 'row gap' }, fF, fList)), field('Erkek sesi', fM));

  const openaiSec = prov('OpenAI TTS', key('openaiKey', 'platform.openai.com › API keys'),
    field('Model', inp('openaiModel')));

  const testBtn = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
    await persist(); out.textContent = 'Deneniyor…';
    try {
      const testId = 'test:' + Date.now();
      const r = await synthesize(testId, [
        { speaker: 'A', text: 'Merhaba, ben Deniz. GMDSS bir Şubat bin dokuz yüz doksan dokuzda tam olarak yürürlüğe girdi.', tone: 'sıcak' },
        { speaker: 'B', text: 'Ben de Kaan. Bugün deniz sahalarını konuşacağız, hazır mısın?', tone: 'neşeli' }],
        [{ id: 'A', name: 'Deniz', gender: 'f', role: 'sunucu' }, { id: 'B', name: 'Kaan', gender: 'm', role: 'sunucu' }], 'Türkçe', { onProgress: (m) => (out.textContent = m) });
      try { const { db } = await import('./db.js'); await db.blobs.where('artifactId').equals(testId).delete(); } catch {} // deneme sesi depoda birikmesin
      if (r.blob) { new Audio(URL.createObjectURL(r.blob)).play(); out.textContent = `✓ ${ENGINE_SHORT[r.engine]} çalışıyor (dinliyorsunuz)${femaleOK(r.engine) ? '' : ' · bu motorda Türkçe kadın sesi yok'}`; }
      else out.textContent = 'Tarayıcı sesi seçili: podcast satır satır okunur.';
    } catch (e) { out.textContent = '✗ ' + e.message; }
  } }, 'Sesi dene (kadın + erkek)');

  const studioBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => openVoiceStudio({ onClose: () => resolveEngine(cfg).then(describe) }) }, 'Ses stüdyosunu aç');
  const cloud = h('details', { class: 'vsec cloud' }, h('summary', {}, 'Bulut API anahtarları (isteğe bağlı)'),
    h('div', { class: 'stack vpad' },
      h('p', { class: 'muted small' }, 'Şimdilik tam yerel çalışma esas: sesler RTX GPU\'nuzda üretilir. İleride bulut sesi isterseniz anahtarı tek satıra yapıştırın; anahtarlar yalnız bu tarayıcıda saklanır.'),
      elevenSec, geminiSec, minimaxSec, fishSec, googleSec, azureSec, openaiSec));
  const el = h('div', { class: 'voice-settings' },
    h('h3', {}, 'Seslendirme (podcast ve video)'),
    now,
    h('div', { class: 'grid2' }, field('Ses motoru', engine), field('Video anlatıcısı', narrator)),
    h('div', { class: 'row gap wrap' }, studioBtn, testBtn, out),
    cloud);
  const describe = (e) => { now.textContent = e === 'none' ? 'Şu an ses motoru yok: Ayarlar › Bilgisayarım bölümünden lokal sunucuya bağlanın.' : `Şu an kullanılacak motor: ${ENGINE_SHORT[e]} (bir podcast boyunca değişmez).${femaleOK(e) ? '' : ' Bu motorda Türkçe kadın sesi yok.'}`; };
  resolveEngine(cfg).then(describe);
  return { el, read: () => ({ ...dirty }) };
}
