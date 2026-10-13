// Defter Studio — seslendirme motoru (v3)
// Motorlar (AA TTS Arena kalitesine göre): ElevenLabs v4 · Gemini 3.8 Flash TTS · MiniMax Speech 2.8 · Google Cloud TTS ·
// Azure Speech · OpenAI TTS · lokal sunucu (Chatterbox / edge-tts / Piper) · tarayıcıda Piper (ücretsiz, yalnız erkek) ·
// tarayıcı sesi (yalnız bu tarayıcıda Türkçe ses varsa).
// Çıktı: tek parça, ses seviyesi dengelenmiş WAV + satır zamanlamaları. Parçalar hazır oldukça onPiece ile bildirilir
// (oynatıcı beklemeden çalmaya başlar). Otomatik modda bir motor hata verirse sıradakine geçilir.
import { db, getSetting, setSetting } from './db.js';
import { serverUrl, serverInfo } from './server.js';
import { normalizeTR } from './textnorm.js';
import { loadConfig } from './llm.js';

const LANG_CODES = { 'Türkçe': 'tr-TR', English: 'en-US', Deutsch: 'de-DE', 'Français': 'fr-FR', 'Español': 'es-ES', 'العربية': 'ar-SA', 'Русский': 'ru-RU', Italiano: 'it-IT', Nederlands: 'nl-NL', '日本語': 'ja-JP' };
export const langCode = (l) => LANG_CODES[l] || (/^[a-z]{2}-[A-Z]{2}$/.test(l || '') ? l : 'tr-TR');
const MINIMAX_LANG = { tr: 'Turkish', en: 'English', de: 'German', fr: 'French', es: 'Spanish', ar: 'Arabic', ru: 'Russian', it: 'Italian', nl: 'Dutch', ja: 'Japanese' };

export const ENGINES = {
  auto: 'Otomatik (kotasız lokal sunucu varsa o, yoksa anahtarı olan en iyi motor; bir podcast boyunca motor ve ses değişmez)',
  elevenlabs: 'ElevenLabs v4 — gerçek insan sesi, duygulu',
  gemini: 'Gemini TTS — çok doğal, ücretsiz katman var',
  minimax: 'MiniMax — Türkçe kadın/erkek, ses klonlama ve tasarım',
  fish: 'Fish Audio — çok dilli, ses klonlama (kendi anahtarınız; seçilen kadın/erkek ses sabit kalır)',
  google: 'Google Cloud TTS — Chirp 3 HD (aylık ücretsiz kota)',
  azure: 'Azure Speech — Emel / Ahmet (aylık ücretsiz kota)',
  openai: 'OpenAI TTS',
  server: 'Lokal sunucu (RTX GPU\'nuz) — kota yok, sesler sabit',
  piper: 'Tarayıcıda Piper — robot gibi, yalnız erkek (otomatik sırada yok; yalnız elle seçilirse)',
  browser: 'Tarayıcı sesi (yalnız bu tarayıcıda Türkçe ses varsa)'
};
// Ayarlar'daki motor listesi: Piper ve tarayıcı sesi kaldırıldı (robot/yalnız erkek ya da Türkçe sesi yok); eski kayıtlar otomatiğe taşınır.
export const ENGINE_CHOICES = ['auto', 'server', 'elevenlabs', 'gemini', 'minimax', 'fish', 'google', 'azure', 'openai'];
export const ENGINE_SHORT = { elevenlabs: 'ElevenLabs', gemini: 'Gemini TTS', minimax: 'MiniMax', fish: 'Fish Audio', google: 'Google Cloud TTS', azure: 'Azure Speech', openai: 'OpenAI TTS', server: 'Lokal sunucu', piper: 'Piper (tarayıcı)', browser: 'Tarayıcı sesi', none: 'Ses motoru yok' };
export const NO_ENGINE = 'Ses motoru yok. Lokal sunucu çalışmıyor ya da ses motoru kurulu değil: Ayarlar › Bilgisayarım bölümünden sunucuya bağlanın (kurulum: tek seferlik kur.bat). İsteğe bağlı: Ayarlar › Bulut API anahtarları.';

export const VOICES = {
  gemini: { f: ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Sulafat', 'Despina', 'Achernar', 'Vindemiatrix'], m: ['Charon', 'Puck', 'Orus', 'Iapetus', 'Algenib', 'Sadaltager', 'Alnilam', 'Schedar'] },
  openai: { f: ['nova', 'shimmer', 'coral', 'sage'], m: ['onyx', 'echo', 'ash', 'ballad'] },
  minimax: { f: ['Turkish_CalmWoman'], m: ['Turkish_Trustworthyman'] },
  fish: { f: [], m: [] }, // Fish Audio'da ses kimliği (reference_id) kullanıcıdan gelir; seçilmezse her satırda farklı ses çıkar

  azure: { f: ['tr-TR-EmelNeural', 'en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural'], m: ['tr-TR-AhmetNeural', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural'] },
  google: { f: ['tr-TR-Chirp3-HD-Kore', 'tr-TR-Chirp3-HD-Aoede', 'tr-TR-Chirp3-HD-Leda', 'tr-TR-Wavenet-A'], m: ['tr-TR-Chirp3-HD-Charon', 'tr-TR-Chirp3-HD-Puck', 'tr-TR-Chirp3-HD-Orus', 'tr-TR-Wavenet-B'] },
  // Piper'ın Türkçe seslerinin üçü de erkek; kadın konuşmacıya ayrı bir erkek ses verilir ve kullanıcı uyarılır.
  piper: { f: ['tr_TR-dfki-medium'], m: ['tr_TR-fahrettin-medium', 'tr_TR-fettah-medium'] }
};
// ElevenLabs hazır sesleri (çok dilli modellerle Türkçe konuşur). Ayarlar'dan hesabınızdaki Türkçe anadil sesler seçilebilir.
export const ELEVEN_DEFAULT = { f: ['EXAVITQu4vr4xnSDxMaL', '21m00Tcm4TlvDq8ikWAM'], m: ['nPczCjzI2devNBz1zQrb', 'pNInz6obpgDQGcFmaJgB'] };

const DEFAULTS = {
  engine: 'auto', rate: 1, narrator: 'm',
  elevenKey: '', elevenModel: 'eleven_v4', elevenF: '', elevenM: '',
  geminiKey: '', geminiModel: 'gemini-3.8-flash-tts', geminiF: '', geminiM: '',
  minimaxKey: '', minimaxModel: 'speech-2.8-hd', minimaxF: '', minimaxM: '', minimaxVoices: [],
  fishKey: '', fishModel: 's2.1-pro-free', fishF: '', fishM: '',
  googleKey: '', googleF: '', googleM: '',
  azureKey: '', azureRegion: 'westeurope', azureF: '', azureM: '',
  openaiKey: '', openaiModel: 'gpt-4o-mini-tts',
  serverF: '', serverM: '', serverModel: '',   // serverModel: lokal model kimliği ('' = otomatik)
  cast: [],                                    // Ses kadrosu: [{name, gender, voice}] — podcast "Karakterlerim" seçeneği
  narratorVoice: null                          // Video anlatıcısı için ses kütüphanesinden {name, gender}
};
export async function loadTTS() {
  const s = { ...DEFAULTS, ...(await getSetting('tts', {})) };
  if (!s.schema) { if (s.elevenModel === 'eleven_v3') s.elevenModel = 'eleven_v4'; s.schema = 3; }
  if (s.engine === 'browser') s.engine = 'auto'; // bu tarayıcıda Türkçe ses yok → "Ses motoru yok" hatası veriyordu
  return s;
}
export async function saveTTS(cfg) { await setSetting('tts', { ...cfg, schema: 3 }); }

const geminiKey = async (cfg) => { if (cfg.geminiKey) return cfg.geminiKey; const l = await loadConfig(); return l.provider === 'gemini' ? l.apiKey : ''; };

// Otomatik sıra. Lokal sunucu (kotasız, ses podcast boyunca sabit) bulut motorlarından önce gelir; bulutlarda günlük kota var
// (Gemini ücretsizde ~10-12 satır). Piper otomatikte YOK: yalnız erkek ve robot gibi, podcast ortasında ona düşmek sesi bozuyordu.
export async function availableEngines(cfg) {
  cfg = cfg || await loadTTS();
  const out = [];
  if (await serverUrl()) { const t = serverInfo()?.tts || {}; if ((t.auto || (t.engines || []).filter((e) => e !== 'piper')).length) out.push('server'); }
  if (cfg.elevenKey) out.push('elevenlabs');
  if (await geminiKey(cfg)) out.push('gemini');
  if (cfg.minimaxKey) out.push('minimax');
  if (cfg.fishKey && cfg.fishF && cfg.fishM) out.push('fish');
  if (cfg.googleKey) out.push('google');
  if (cfg.azureKey) out.push('azure');
  if (cfg.openaiKey) out.push('openai');
  return out;
}
export async function resolveEngine(cfg) {
  cfg = cfg || await loadTTS();
  if (cfg.engine === 'browser') return hasBrowserVoice() ? 'browser' : 'none';
  if (cfg.engine && cfg.engine !== 'auto') return cfg.engine;
  return (await availableEngines(cfg))[0] || 'none';
}
// Bu motor Türkçe kadın sesi verebiliyor mu?
export function femaleOK(engine) {
  if (engine === 'piper' || engine === 'none') return false;
  if (engine === 'server') { const t = serverInfo()?.tts; return t?.plan ? !!t.plan.f : t?.female !== false; }
  if (engine === 'browser') return !!pickBrowserVoice('Türkçe', 'f')?.female;
  return true;
}

// Konuşmacılara cinsiyete göre farklı ses ata
export async function voicePool(engine, cfg) {
  const own = (f, m) => ({ f: [f].filter(Boolean), m: [m].filter(Boolean) });
  const merge = (a, b) => ({ f: [...new Set([...a.f, ...b.f])], m: [...new Set([...a.m, ...b.m])] });
  switch (engine) {
    case 'elevenlabs': return merge(own(cfg.elevenF, cfg.elevenM), ELEVEN_DEFAULT);
    case 'minimax': return merge(own(cfg.minimaxF, cfg.minimaxM), VOICES.minimax);
    case 'fish': return own(cfg.fishF, cfg.fishM);
    case 'azure': return merge(own(cfg.azureF, cfg.azureM), VOICES.azure);
    case 'google': {
      let best = VOICES.google;
      try { const vs = await listGoogleVoices(cfg.googleKey); if (vs.length) best = { f: vs.filter((v) => v.gender === 'FEMALE').map((v) => v.name), m: vs.filter((v) => v.gender === 'MALE').map((v) => v.name) }; } catch {}
      if (!best.f.length) best.f = VOICES.google.f; if (!best.m.length) best.m = VOICES.google.m;
      return merge(own(cfg.googleF, cfg.googleM), best);
    }
    case 'gemini': return merge(own(cfg.geminiF, cfg.geminiM), VOICES.gemini);
    case 'server': {
      // Ses kütüphanesindeki bütün kayıtlar cinsiyete göre sırayla dağıtılır: 4-5 konuşmacı aynı sesi paylaşmaz
      const vs = await serverVoices().catch(() => []);
      const pick = (g, own) => { const l = [...new Set([own, ...vs.filter((v) => v.gender === g).map((v) => v.name)].filter(Boolean))]; return l.length ? l : [g]; };
      return { f: pick('f', cfg.serverF), m: pick('m', cfg.serverM) };
    }
    default: return VOICES[engine] || { f: ['f'], m: ['m'] };
  }
}
export async function assignVoices(speakers, engine, cfg = {}) {
  const pool = await voicePool(engine, cfg);
  const used = { f: 0, m: 0 };
  return Object.fromEntries(speakers.map((s) => {
    const g = s.gender === 'm' ? 'm' : 'f';
    // serverVoice: konuşmacıya (Ses kadrosu) özel seçilmiş kütüphane sesi; yalnız lokal sunucuda geçerli
    return [s.id, (engine === 'server' && s.serverVoice) || s.voice || pool[g][used[g]++ % pool[g].length]];
  }));
}

// ---------------- Yardımcılar ----------------
class TTSError extends Error { constructor(msg, status = 0, retry = false, extra = {}) { super(msg); this.status = status; this.retry = retry; Object.assign(this, extra); } }
const httpErr = async (who, r) => {
  const raw = await r.text().catch(() => '');
  const s = r.status;
  // Gemini/Google kota hataları: RESOURCE_EXHAUSTED + retryDelay ("39s") + quotaId (…PerDay… = günlük kota)
  const delay = +(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(raw)?.[1] || r.headers.get('retry-after') || 0);
  const daily = s === 429 && /PerDay|per day|daily/i.test(raw);
  const why = s === 401 || s === 403 ? 'anahtar geçersiz ya da yetkisiz' : daily ? 'günlük ücretsiz kota doldu; yarın sıfırlanır' : s === 429 ? 'dakikalık hız sınırı' : s === 402 ? 'bakiye yetersiz' : '';
  return new TTSError(`${who}: ${s}${why ? ' (' + why + ')' : ''} ${raw.slice(0, 160)}`, s, (s === 429 && !daily) || s >= 500, { retryAfter: delay, daily });
};
// Geçici hatalarda bekleyip yeniden dene. Dakikalık kota (429) için sunucunun söylediği süre kadar beklenir;
// böylece ücretsiz katmanda yarıda başka (erkek) sese düşülmez.
async function withRetry(fn, tries = 6, onWait) {
  for (let k = 0; ; k++) {
    try { return await fn(); } catch (e) {
      const transient = e.retry || e instanceof TypeError; // TypeError: ağ kesintisi
      if (!transient || k >= tries - 1) throw e;
      const ms = e.retryAfter ? (e.retryAfter + 1) * 1000 : e.status === 429 ? 20000 * (k + 1) : [1500, 4000, 9000, 15000, 30000][k] || 30000;
      onWait?.(Math.round(ms / 1000), e);
      await new Promise((r) => setTimeout(r, Math.min(ms, 70000)));
    }
  }
}
// Parça önbelleği: kota ya da hata yüzünden yarıda kalan seslendirme baştan değil kaldığı yerden sürer
async function cachedPiece(artifactId, key, make) {
  const hit = await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'piece' && b.key === key).first();
  if (hit) return hit.blob;
  const blob = await make();
  await db.blobs.add({ artifactId, kind: 'piece', key, blob });
  return blob;
}

function b64ToBlob(b64, type) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
export function hexToBlob(hex, type = 'audio/mpeg') {
  const u = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16);
  return new Blob([u], { type });
}
function pcmToWav(blob, sr = 24000) {
  return blob.arrayBuffer().then((buf) => {
    const pcm = new Int16Array(buf);
    const f = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768;
    return encodeWav([f], sr);
  });
}
const toneHas = (tone, re) => re.test(String(tone || '').toLocaleLowerCase('tr'));

// ---------------- Motorlar ----------------
async function geminiChunk(lines, voices, speakers, cfg, style) {
  const key = await geminiKey(cfg);
  if (!key) throw new TTSError('Gemini TTS için Ayarlar › Seslendirme’ye Gemini API anahtarı girin (aistudio.google.com, ücretsiz).');
  const names = Object.fromEntries(speakers.map((s) => [s.id, s.name]));
  const ids = [...new Set(lines.map((l) => l.speaker))];
  const TR = 'Türkçe konuş: doğal İstanbul Türkçesi telaffuzu, doğru kelime vurgusu ve cümle tonlaması; gerçek bir insan gibi nefes al, duraksa, robotik olma';
  const content = lines.map((l) => ({ type: 'text', text: normalizeTR(l.text, { spellAcronyms: true }), annotations: [{ type: 'speech_metadata', speaker: names[l.speaker], style: `${TR}. ${style}${l.tone ? '; ' + l.tone : ''}` }] }));
  const speech = ids.length > 1
    ? { mode: 'conversational', speakers: ids.map((id) => ({ speaker: names[id], voice: voices[id] })) }
    : [{ voice: voices[ids[0]] }];
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ model: cfg.geminiModel || 'gemini-3.8-flash-tts', input: [{ type: 'user_input', content }], response_format: { type: 'audio' }, generation_config: { speech_config: speech } })
  });
  if (res.ok) {
    const j = await res.json();
    const audio = (j.steps || j.outputs || []).filter((s) => !s.type || s.type === 'model_output').flatMap((s) => s.content || [s]).filter((c) => c.type === 'audio').pop();
    if (audio?.data) return b64ToBlob(audio.data, audio.mime_type || 'audio/wav');
    throw new TTSError('Gemini yanıtında ses yok');
  }
  if (res.status !== 404 && res.status !== 400) throw await httpErr('Gemini TTS', res);
  // Eski uç nokta (generateContent) ile yeniden dene
  const legacy = cfg.geminiLegacyModel || 'gemini-2.5-flash-preview-tts';
  const text = `Aşağıdaki Türkçe konuşmayı doğal İstanbul Türkçesiyle, doğru vurgu ve tonlamayla, gerçek insanlar gibi seslendir. ${style}.\n` + lines.map((l) => `${names[l.speaker]}: ${normalizeTR(l.text)}`).join('\n');
  const speechConfig = ids.length > 1
    ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: ids.slice(0, 2).map((id) => ({ speaker: names[id], voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[id] } } })) } }
    : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[ids[0]] } } };
  const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${legacy}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig } })
  });
  if (!r2.ok) throw await httpErr('Gemini TTS', r2);
  const j2 = await r2.json();
  const part = j2.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new TTSError('Gemini yanıtında ses yok');
  return pcmToWav(b64ToBlob(part.inlineData.data, 'audio/l16'), 24000);
}

const TAG = { meraklı: 'curious', heyecanlı: 'excited', sakin: 'calm', gülerek: 'laughs', neşeli: 'cheerful', şaşkın: 'surprised', ciddi: 'serious', düşünceli: 'thoughtful', sıcak: 'warm', endişeli: 'worried', rahatlamış: 'relieved', kararlı: 'determined', üzgün: 'sad', fısıldayarak: 'whispers', coşkulu: 'excited', sabırlı: 'calm' };
const tagFor = (tone) => { const t = String(tone || '').toLocaleLowerCase('tr'); const k = Object.keys(TAG).find((x) => t.includes(x)); return k ? `[${TAG[k]}] ` : ''; };
const usesTags = (m) => /v3|v4/.test(m || '');

async function elevenChunk(lines, voices, cfg) {
  if (!cfg.elevenKey) throw new TTSError('ElevenLabs için ayarlara API anahtarı girin.');
  let model = cfg.elevenModel || 'eleven_v4';
  const headers = { 'Content-Type': 'application/json', 'xi-api-key': cfg.elevenKey, Accept: 'audio/mpeg' };
  const prep = (l, m) => (usesTags(m) ? tagFor(l.tone) : '') + normalizeTR(l.text);
  const dialogue = (m) => fetch('https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128', {
    method: 'POST', headers, body: JSON.stringify({ model_id: m, language_code: 'tr', inputs: lines.map((l) => ({ text: prep(l, m), voice_id: voices[l.speaker] })) })
  });
  let res = await dialogue(model);
  if (!res.ok && (res.status === 400 || res.status === 422) && model !== 'eleven_v3') { model = 'eleven_v3'; res = await dialogue(model); }
  if (res.ok) return { blob: await res.blob(), whole: true };
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) throw await httpErr('ElevenLabs', res);
  // diyalog uç noktası bu modeli desteklemiyorsa satır satır üret
  const blobs = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voices[l.speaker]}?output_format=mp3_44100_128`, {
      method: 'POST', headers,
      body: JSON.stringify({ text: prep(l, model), model_id: model, language_code: 'tr',
        previous_text: lines[i - 1]?.text?.slice(-100), next_text: lines[i + 1]?.text?.slice(0, 100), voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } })
    });
    if (!r.ok) throw await httpErr('ElevenLabs', r);
    blobs.push(await r.blob());
  }
  return { blobs };
}

export async function listElevenVoices(key) {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
  if (!r.ok) throw await httpErr('ElevenLabs', r);
  return (await r.json()).voices.map((v) => ({ id: v.voice_id, name: v.name, gender: v.labels?.gender || '', lang: v.labels?.language || v.labels?.accent || '' }));
}

// MiniMax: https://platform.minimax.io/docs/api-reference/speech-t2a-http
const MM = 'https://api.minimax.io/v1';
const mmErr = (j, r) => {
  const c = j?.base_resp?.status_code, m = j?.base_resp?.status_msg || '';
  const why = { 1002: 'hız sınırı', 1004: 'anahtar geçersiz', 2049: 'anahtar geçersiz', 1008: 'bakiye yetersiz', 1026: 'içerik filtresi', 2013: 'geçersiz parametre', 2038: 'klonlama izni yok: hesap doğrulamasını tamamlayın', 1043: 'kayıt metniyle eşleşmedi' }[c] || '';
  return new TTSError(`MiniMax: ${c ?? r.status}${why ? ' (' + why + ')' : ''} ${m}`.trim(), c === 1004 || c === 2049 ? 401 : r.status, c === 1002 || c === 1001 || c === 1000 || r.status >= 500);
};
async function mmFetch(path, key, init) {
  const r = await fetch(MM + path, { ...init, headers: { Authorization: 'Bearer ' + key, ...(init.headers || {}) } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || (j.base_resp && j.base_resp.status_code)) throw mmErr(j, r);
  return j;
}
const EMO = [[/üzgün|hüzün/, 'sad'], [/şaşkın|şaşır/, 'surprised'], [/neşeli|coşkulu|heyecanlı|gülerek/, 'happy'], [/sakin|sabırlı|rahat/, 'calm'], [/endişeli|korku/, 'fearful'], [/kızgın|öfke/, 'angry']];
async function minimaxLine(line, voice, cfg, _style, lang) {
  if (!cfg.minimaxKey) throw new TTSError('MiniMax için ayarlara API anahtarı girin.');
  const model = cfg.minimaxModel || 'speech-2.8-hd';
  const emo = EMO.find(([re]) => toneHas(line.tone, re))?.[1];
  const laugh = /2\.8/.test(model) && toneHas(line.tone, /gülerek/) ? '(laughs) ' : '';
  const j = await mmFetch('/t2a_v2', cfg.minimaxKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, text: laugh + normalizeTR(line.text), stream: false, output_format: 'hex', language_boost: MINIMAX_LANG[langCode(lang).slice(0, 2)] || 'auto',
      voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0, ...(emo ? { emotion: emo } : {}) },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 } })
  });
  if (!j.data?.audio) throw new TTSError('MiniMax yanıtında ses yok');
  return hexToBlob(j.data.audio, 'audio/mpeg');
}
// Ses klonlama: kayıt yükle → klonla → voice_id. Yalnız kendi sesiniz ya da izinli bir ses.
export async function minimaxUpload(key, blob, name = 'ses.wav') {
  const fd = new FormData(); fd.append('purpose', 'voice_clone'); fd.append('file', blob, name);
  const j = await mmFetch('/files/upload', key, { method: 'POST', body: fd });
  return j.file.file_id;
}
export async function minimaxClone(key, { fileId, voiceId, model = 'speech-2.8-hd', previewText }) {
  const j = await mmFetch('/voice_clone', key, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, voice_id: voiceId, need_noise_reduction: true, need_volume_normalization: true, language_boost: 'Turkish', ...(previewText ? { text: previewText, model } : {}) })
  });
  return { voiceId, demo: j.demo_audio || '' };
}
export async function minimaxDesign(key, { prompt, previewText, voiceId }) {
  const j = await mmFetch('/voice_design', key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, preview_text: previewText, ...(voiceId ? { voice_id: voiceId } : {}) }) });
  return { voiceId: j.voice_id, trial: j.trial_audio ? hexToBlob(j.trial_audio) : null };
}
export const newVoiceId = (p = 'defter') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Azure Speech: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
const xmlEsc = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
async function azureLine(line, voice, cfg, _style, lang) {
  if (!cfg.azureKey) throw new TTSError('Azure için ayarlara anahtar ve bölge girin.');
  const lc = langCode(lang), text = xmlEsc(normalizeTR(line.text));
  const inner = /Multilingual/i.test(voice) ? `<lang xml:lang="${lc}">${text}</lang>` : text;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lc}"><voice name="${voice}">${inner}</voice></speak>`;
  const r = await fetch(`https://${(cfg.azureRegion || 'westeurope').trim()}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': cfg.azureKey, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3' }, body: ssml
  });
  if (!r.ok) throw await httpErr('Azure', r);
  return r.blob();
}

// Google Cloud Text-to-Speech: https://cloud.google.com/text-to-speech/docs/reference/rest
const GQ = ['Chirp3-HD', 'Chirp-HD', 'Studio', 'Neural2', 'Wavenet', 'Standard'];
const gScore = (n) => { const i = GQ.findIndex((q) => n.includes(q)); return i < 0 ? 9 : i; };
const gCache = {};
export async function listGoogleVoices(key, lang = 'tr-TR') {
  if (!key) return [];
  if (gCache[key + lang]) return gCache[key + lang];
  const r = await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=' + lang, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw await httpErr('Google TTS', r);
  const vs = ((await r.json()).voices || []).filter((v) => v.languageCodes?.includes(lang)).map((v) => ({ name: v.name, gender: v.ssmlGender })).sort((a, b) => gScore(a.name) - gScore(b.name));
  return (gCache[key + lang] = vs);
}
async function googleLine(line, voice, cfg, _style, lang) {
  if (!cfg.googleKey) throw new TTSError('Google Cloud TTS için ayarlara API anahtarı girin.');
  const lc = /^[a-z]{2}-[A-Z]{2}/.exec(voice)?.[0] || langCode(lang);
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.googleKey },
    body: JSON.stringify({ input: { text: normalizeTR(line.text) }, voice: { languageCode: lc, name: voice }, audioConfig: { audioEncoding: 'MP3' } })
  });
  if (!r.ok) throw await httpErr('Google TTS', r);
  return b64ToBlob((await r.json()).audioContent, 'audio/mpeg');
}

async function openaiLine(line, voice, cfg, style) {
  if (!cfg.openaiKey) throw new TTSError('OpenAI TTS için ayarlara OpenAI API anahtarı girin.');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.openaiKey },
    body: JSON.stringify({ model: cfg.openaiModel || 'gpt-4o-mini-tts', voice, input: normalizeTR(line.text), instructions: `${style}${line.tone ? '; ' + line.tone : ''}. Doğal Türkçe telaffuz, doğru vurgu.`, response_format: 'wav' })
  });
  if (!res.ok) throw await httpErr('OpenAI TTS', res);
  return res.blob();
}

async function serverLine(line, voice, cfg, style, lang, speaker) {
  const base = await serverUrl();
  if (!base) throw new TTSError('Lokal yardımcı sunucu çalışmıyor. server\\baslat.bat ile başlatın.');
  const g = speaker.gender === 'm' ? 'm' : 'f';
  // Motor sabitleme: sunucunun cinsiyet için seçtiği motor her satırda gönderilir; hata olursa sunucu başka motora (robot sese) düşmez
  const plan = serverInfo()?.tts?.plan;
  if (plan && !cfg.serverModel && !plan[g]) throw new TTSError(`Lokal sunucuda ${g === 'f' ? 'kadın' : 'erkek'} ses için hazır motor yok. Ses kütüphanesine bir kayıt ekleyin ya da tools\\kur-gpu.bat çalıştırın.`);
  const lock = cfg.serverModel ? '' : plan?.[g] || '';
  const r = await fetch(base + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: normalizeTR(line.text), speaker: speaker.id, gender: g, voice, model: cfg.serverModel || '', engine: lock, tone: line.tone || '', lang: langCode(lang) }) });
  if (!r.ok) throw new TTSError('Sunucu TTS: ' + (await r.text()).slice(0, 240), r.status, r.status === 502 || r.status === 504);
  return r.blob();
}

// Tek satırı (karakterin seçili sesiyle) dinlet: podcast'te "bu satırı bu kişiden duy". Parça önbelleğine yazmaz.
export async function speakLine(line, speaker, speakers, lang, format = 'deep') {
  const cfg = await loadTTS();
  const engine = await resolveEngine(cfg);
  if (engine === 'none') throw new TTSError(NO_ENGINE);
  const fn = LINE_FN[engine];
  if (!fn) throw new TTSError(`${ENGINE_SHORT[engine] || engine} toplu üretir; tek satır dinleme yalnız lokal sunucu ve satır satır çalışan bulut motorlarında var.`);
  if (engine === 'server') await serverUrl(true);
  const voices = await assignVoices(speakers, engine, cfg);
  return withRetry(() => fn(line, voices[speaker.id], cfg, STYLE[format] || STYLE.deep, lang, speaker), 2);
}
// Ses stüdyosu: bir kütüphane/hazır sesi kısa cümleyle dinlet
export async function testVoice(voice, gender, text) {
  const base = await serverUrl(); if (!base) throw new TTSError('Lokal yardımcı sunucu çalışmıyor.');
  const r = await fetch(base + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: normalizeTR(text), gender: gender === 'm' ? 'm' : 'f', voice, lang: 'tr-TR', engine: serverInfo()?.tts?.plan?.[gender === 'm' ? 'm' : 'f'] || '' }) });
  if (!r.ok) throw new TTSError('Sunucu TTS: ' + (await r.text()).slice(0, 240));
  return r.blob();
}

export async function serverVoices() {
  const base = await serverUrl(); if (!base) return [];
  const r = await fetch(base + '/voices'); return r.ok ? (await r.json()).voices || [] : [];
}
export async function uploadServerVoice(name, gender, blob, { label = '', text = '' } = {}) {
  const base = await serverUrl(); if (!base) throw new TTSError('Lokal yardımcı sunucu çalışmıyor.');
  const fd = new FormData(); fd.append('name', name); fd.append('gender', gender); fd.append('label', label); fd.append('text', text); fd.append('file', blob, name + '.wav');
  const r = await fetch(base + '/voices', { method: 'POST', body: fd });
  if (!r.ok) throw new TTSError('Sunucu: ' + (await r.text()).slice(0, 200));
  return r.json();
}
export async function deleteServerVoice(name) {
  const base = await serverUrl(); if (!base) return;
  await fetch(base + '/voices/' + encodeURIComponent(name), { method: 'DELETE' });
}
// Ses kütüphanesi: dinleme adresi, ad/cinsiyet/transkript güncelleme, hazır tasarımlar, yeni ses tasarlama
export async function serverVoiceUrl(name) { const base = await serverUrl(); return base ? `${base}/voices/${encodeURIComponent(name)}/audio` : ''; }
async function srvJson(path, opt) {
  const base = await serverUrl(); if (!base) throw new TTSError('Lokal yardımcı sunucu çalışmıyor.');
  const r = await fetch(base + path, opt);
  if (!r.ok) { let m = await r.text(); try { m = JSON.parse(m).detail || m; } catch {} throw new TTSError(String(m).slice(0, 300), r.status); }
  return r.json();
}
const jsonOpt = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const patchServerVoice = (name, patch) => srvJson('/voices/' + encodeURIComponent(name), jsonOpt('PATCH', patch));
export const serverPresets = () => srvJson('/voices/presets');
export const designServerVoice = (spec) => srvJson('/voices/design', jsonOpt('POST', spec));

let piperW = null, piperSeq = 0;
const piperWaits = {};
function piperWorker() {
  if (piperW) return piperW;
  piperW = new Worker(new URL('./piper-worker.js', import.meta.url), { type: 'module' });
  piperW.onmessage = (e) => { const w = piperWaits[e.data.id]; if (!w) return; if (e.data.progress) return w.onInfo?.(e.data.progress); delete piperWaits[e.data.id]; e.data.error ? w.fail(new Error(e.data.error)) : w.ok(e.data.blob || true); };
  piperW.onerror = (e) => { for (const k in piperWaits) { piperWaits[k].fail(new Error('Piper ses motoru başlatılamadı: ' + (e.message || 'bilinmeyen hata'))); delete piperWaits[k]; } piperW = null; };
  return piperW;
}
// Piper modelini önceden belleğe al (ayar penceresinde ya da podcast açılırken): ilk satır beklemez. İndirme yalnız ilk sefer; sonra kalıcı depodan gelir.
export async function preloadPiper(voiceId = 'tr_TR-fettah-medium', onInfo) {
  try { await navigator.storage?.persist?.(); } catch {}
  const id = ++piperSeq;
  await new Promise((ok, fail) => {
    piperWaits[id] = { ok, fail, onInfo: (p) => { if (p?.total && onInfo) onInfo(Math.round((p.loaded / p.total) * 100)); } };
    piperWorker().postMessage({ id, voiceId, preload: true });
  });
}
async function piperLine(line, voice, _cfg, _style, _lang, _sp, onInfo) {
  const id = ++piperSeq;
  const text = normalizeTR(line.text);
  try {
    return await new Promise((ok, fail) => {
      piperWaits[id] = { ok, fail, onInfo: (p) => { if (p?.total && onInfo) onInfo(`Ücretsiz ses modeli indiriliyor %${Math.round((p.loaded / p.total) * 100)} (yalnız ilk sefer, ~60 MB; sonra bu tarayıcıda kalıcı saklanır)`); } };
      piperWorker().postMessage({ id, text, voiceId: voice });
    });
  } catch (e) {
    if (/fetch|import|network|Failed/i.test(e.message)) throw new TTSError('Ücretsiz Piper sesi indirilemedi (ilk kullanımda internet gerekir). Ayarlar › Seslendirme’den başka bir motor seçebilirsiniz.');
    throw e;
  }
}
// ---------------- Fish Audio ----------------
const FISH = 'https://api.fish.audio';
async function fishFetch(path, key, init = {}) {
  const url = FISH + path;
  const headers = { Authorization: 'Bearer ' + key, ...(init.headers || {}) };
  try { return await fetch(url, { ...init, headers }); }
  catch { // tarayıcı doğrudan erişemezse (CORS) lokal sunucunun vekilinden dene
    const base = await serverUrl();
    if (!base) throw new TTSError('Fish Audio’ya tarayıcıdan erişilemedi (CORS) ve lokal sunucu kapalı. server\\baslat.bat ile sunucuyu açın; istek sunucu üzerinden gider.');
    return fetch(base + '/proxy?url=' + encodeURIComponent(url), { ...init, headers });
  }
}
async function fishLine(line, voice, cfg) {
  if (!cfg.fishKey) throw new TTSError('Fish Audio için ayarlara API anahtarı girin.');
  if (!voice) throw new TTSError('Fish Audio: Ayarlar › Seslendirme › Fish Audio’dan bir kadın ve bir erkek ses seçin (ses kimliği). Seçilmezse her satırda farklı bir ses gelir.');
  const r = await fishFetch('/v1/tts', cfg.fishKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json', model: cfg.fishModel || 's2.1-pro-free' },
    body: JSON.stringify({ text: normalizeTR(line.text), reference_id: voice, format: 'mp3', mp3_bitrate: 128, latency: 'normal', normalize: true })
  });
  if (!r.ok) throw await httpErr('Fish Audio', r);
  return r.blob();
}
// Herkese açık ses kütüphanesinden Türkçe sesleri listele (cinsiyet etiketlerden tahmin edilir)
export async function listFishVoices(key, language = 'tr') {
  const r = await fishFetch(`/model?page_size=40&page_number=1&language=${encodeURIComponent(language)}&sort_by=score`, key);
  if (!r.ok) throw await httpErr('Fish Audio', r);
  const j = await r.json();
  return (j.items || []).map((m) => {
    const tags = (m.tags || []).map((t) => String(t).toLowerCase());
    const gender = tags.some((t) => /^(female|woman|kad[ıi]n)/.test(t)) ? 'f' : tags.some((t) => /^(male|man|erkek)/.test(t)) ? 'm' : '';
    return { id: m._id || m.id, name: m.title || m._id, gender, desc: (m.description || '').slice(0, 60) };
  }).filter((v) => v.id);
}

const LINE_FN = { openai: openaiLine, server: serverLine, piper: piperLine, minimax: minimaxLine, fish: fishLine, azure: azureLine, google: googleLine };
const CONCURRENCY = { openai: 3, minimax: 3, fish: 2, azure: 3, google: 3, server: 1, piper: 1 };

// ---------------- Üst düzey: tüm konuşmayı tek dosyaya çevir ----------------
const STYLE = {
  deep: 'Canlı, samimi, meraklı iki kişilik podcast sohbeti; doğal Türkçe, akıcı tonlama',
  brief: 'Net, sıcak ve akıcı bir anlatıcı',
  critique: 'Uzman, yapıcı ve düşünceli değerlendirme',
  debate: 'Saygılı ama tutkulu tartışma',
  lecture: 'Deneyimli, sabırlı ve heyecanlı bir öğretmen; öğrencisi meraklı',
  consult: 'Toplantı masasında fikir alışverişi yapan uzmanlar; sakin, düşünceli',
  munazara: 'Resmî münazara; moderatör tarafsız, taraflar ikna edici ve heyecanlı',
  exam: 'Sözlü sınav: sınav görevlisi ciddi, aday heyecanlı, eğitmen cesaretlendirici',
  story: 'Sürükleyici, duygulu hikâye anlatımı; gerilim ve rahatlama anları',
  narration: 'Belgesel anlatıcısı; sıcak, tok, net diksiyonlu, merak uyandıran; kusursuz Türkçe telaffuz'
};

function chunkLines(lines, maxChars = 1600, maxSpeakers = 2) {
  const chunks = []; let cur = [], chars = 0, spk = new Set();
  for (const l of lines) {
    const ns = new Set([...spk, l.speaker]);
    if (cur.length && (chars + l.text.length > maxChars || ns.size > maxSpeakers)) { chunks.push(cur); cur = []; chars = 0; spk = new Set(); }
    cur.push(l); chars += l.text.length; spk.add(l.speaker);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// Metin anahtarı: yalnız konuşmacı + metin + ton. Motor/ses/model ayarına BAĞLI DEĞİL (ayar değişince kayıtlı ses boşa gitmesin).
// Anahtar: konuşmacı + metin + ton; motor/ayar değişse de değişmez. Tek istisna: bu podcast'in karakterlerine AÇIKÇA atanmış sesler
// (Ses stüdyosu/podcast karakter paneli): atama değişince ses de değişmelidir. Atama yoksa anahtar eski sürümle aynıdır.
const voiceMark = (speakers) => (speakers || []).some((s) => s.serverVoice || s.voice) ? JSON.stringify(speakers.map((s) => [s.id, s.serverVoice || s.voice || ''])) : '';
const textKey = (lines, speakers) => hash('t1' + JSON.stringify(lines.map((l) => [l.speaker, l.text, l.tone || ''])) + voiceMark(speakers));
export async function savedMix(artifactId, lines, speakers) {
  const tk = textKey(lines, speakers);
  const all = await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'mix' && b.blob).toArray();
  let hit = all.find((b) => b.textKey === tk);
  if (!hit) { // 0.6.0 öncesi kayıt: metin anahtarı yok; satır sayısı tutuyorsa kabul et ve yükselt
    hit = all.find((b) => !b.textKey && b.timings?.length === lines.length);
    if (hit) { try { await db.blobs.update(hit.id, { textKey: tk }); } catch {} }
  }
  return hit ? { engine: hit.engine, blob: hit.blob, timings: hit.timings, cached: true, saved: true } : null;
}
export const hasSavedMix = async (artifactId, lines, speakers) => !!(await savedMix(artifactId, lines, speakers).catch(() => null));

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const inflight = {};

/**
 * lines: [{speaker, text, tone?}], speakers: [{id, name, gender}]
 * Dönen: { blob (WAV), timings: [{start, end}], engine } — önbelleğe alınır, metin değişmedikçe yeniden üretilmez.
 * onPiece({blob, idx:[satır no]}) parçalar sırayla hazır oldukça çağrılır (beklemeden dinletmek için).
 */
export async function synthesize(artifactId, lines, speakers, lang, { format = 'deep', onProgress = () => {}, onPiece, engine: forced, fresh = false } = {}) {
  if (!lines?.length) throw new TTSError('Seslendirilecek metin yok.');
  // KAYITLI SES ÖNCE: bu metnin tamamı daha önce seslendirildiyse (hangi motorla olursa olsun) kayıtlı dosya çalınır;
  // ağa/API'ye hiç gidilmez, kota harcanmaz. Yeniden üretim yalnız 'Sesi yeniden üret' ile (fresh) ya da metin değişince olur.
  if (!fresh) { const saved = await savedMix(artifactId, lines, speakers); if (saved) return saved; }
  const cfg = await loadTTS();
  // SES KİLİDİ: bir seslendirme tek bir motorla yapılır. Motor başta seçilir; kota ya da hata olursa başka motora (özellikle robot
  // Piper'a) GEÇİLMEZ: podcast ortasında ses ve cinsiyet değişiyordu. Biten parçalar saklanır; yeniden açınca kaldığı yerden sürer.
  let engine = forced || await resolveEngine(cfg);
  if (!forced && cfg.engine === 'auto' && speakers.some((s) => s.gender !== 'm')) {
    const av = await availableEngines(cfg);
    engine = av.find(femaleOK) || av[0] || 'none'; // kadın konuşmacı varsa kadın sesi verebilen ilk motor
  }
  if (engine === 'none') throw new TTSError(NO_ENGINE);
  if (engine === 'browser') return { engine: 'browser', blob: null, timings: null };
  try { return await synthWith(engine, cfg, artifactId, lines, speakers, lang, format, onProgress, onPiece); }
  catch (e) {
    const n = e.doneLines || 0;
    e.engine = engine;
    e.message = `${e.message}${/[.!?]$/.test(e.message) ? '' : '.'} ${n ? `İlk ${n}/${lines.length} satır hazır ve kalıcı saklandı; ${e.daily ? 'kota yenilenince' : 'sorun giderilince'} bu podcast’i açmanız yeterli, kaldığı yerden devam eder. ` : ''}Ses aynı kalsın diye başka motora (ör. robot Piper) geçilmedi.`;
    throw e;
  }
}

async function synthWith(engine, cfg, artifactId, lines, speakers, lang, format, onProgress, onPiece) {
  if (engine === 'server') await serverUrl(true); // taze motor planı (cinsiyet başına kilitlenecek motor)
  const voices = await assignVoices(speakers, engine, cfg);
  const model = { gemini: cfg.geminiModel, elevenlabs: cfg.elevenModel, minimax: cfg.minimaxModel, fish: cfg.fishModel, openai: cfg.openaiModel, azure: cfg.azureRegion, server: cfg.serverModel || JSON.stringify(serverInfo()?.tts?.plan || {}) }[engine] || '';
  const key = hash(engine + JSON.stringify(voices) + model + JSON.stringify(lines.map((l) => [l.speaker, l.text, l.tone])));
  const cached = await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'mix' && b.key === key).first();
  if (cached) return { engine, blob: cached.blob, timings: cached.timings, cached: true };
  if (inflight[key]) return inflight[key]; // aynı ses zaten üretiliyorsa onu bekle
  const job = (async () => {
    const style = STYLE[format] || STYLE.deep;
    const byId = Object.fromEntries(speakers.map((s) => [s.id, s]));
    const pieces = []; // {blob, idx:[satır no]}
    const emit = (p) => { pieces.push(p); try { onPiece?.(p); } catch {} };
    try {
    if (engine === 'elevenlabs' || engine === 'gemini') {
      const chunks = engine === 'elevenlabs' ? chunkLines(lines, 1800, 10) : chunkLines(lines, 3200); // az istek = ücretsiz kotada daha uzun podcast
      const wait = (sec, e) => onProgress(`${ENGINE_SHORT[engine]} ${e.status === 429 ? 'hız sınırı' : 'geçici hata'}: ${sec} sn bekleniyor, sonra kaldığı yerden devam…`);
      let done = 0;
      for (const ch of chunks) {
        onProgress(`${ENGINE_SHORT[engine]} ile seslendiriliyor ${done + 1}–${done + ch.length} / ${lines.length}`);
        const idx = ch.map((l) => lines.indexOf(l));
        const pk = hash(engine + model + JSON.stringify(voices) + JSON.stringify(ch.map((l) => [l.speaker, l.text, l.tone])));
        if (engine === 'gemini') emit({ blob: await cachedPiece(artifactId, pk, () => withRetry(() => geminiChunk(ch, voices, speakers, cfg, style), 6, wait)), idx });
        else {
          const r = await withRetry(() => elevenChunk(ch, voices, cfg));
          if (r.whole) emit({ blob: r.blob, idx }); else r.blobs.forEach((b, n) => emit({ blob: b, idx: [idx[n]] }));
        }
        done += ch.length;
      }
    } else {
      const fn = LINE_FN[engine];
      if (!fn) throw new TTSError('Bilinmeyen ses motoru: ' + engine);
      const conc = CONCURRENCY[engine] || 1;
      const results = new Array(lines.length);
      let next = 0, delivered = 0, finished = 0;
      const deliver = () => { while (delivered < lines.length && results[delivered]) emit({ blob: results[delivered], idx: [delivered++] }); };
      const worker = async () => {
        while (next < lines.length) {
          const i = next++;
          const l = lines[i];
          const pk = hash(engine + model + voices[l.speaker] + l.text + (l.tone || ''));
          results[i] = await cachedPiece(artifactId, pk, () => withRetry(() => fn(l, voices[l.speaker], cfg, style, lang, byId[l.speaker] || speakers[0], onProgress), 6,
            (sec, e) => onProgress(`${ENGINE_SHORT[engine]} ${e.status === 429 ? 'hız sınırı' : 'geçici hata'}: ${sec} sn bekleniyor…`)));
          finished++;
          onProgress(`${ENGINE_SHORT[engine]} ile seslendiriliyor ${finished} / ${lines.length}`);
          deliver();
        }
      };
      await Promise.all(Array.from({ length: Math.min(conc, lines.length) }, worker));
    }
    } catch (e) { e.doneLines = pieces.reduce((a, p) => a + p.idx.length, 0); throw e; } // kaç satır hazır kaldı (kalıcı parça önbelleği)
    onProgress('Ses birleştiriliyor ve dengeleniyor…');
    const { blob, timings } = await mixPieces(pieces, lines);
    await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'mix' || b.kind === 'piece').delete();
    await db.blobs.add({ artifactId, kind: 'mix', key, textKey: textKey(lines, speakers), blob, timings, engine });
    return { engine, blob, timings };
  })();
  inflight[key] = job;
  try { return await job; } finally { delete inflight[key]; }
}

// Parçaları birleştir: konuşmacı değişiminde ~0,3 sn doğal duraklama (Google podcast'inde ölçülen ortanca 0,32 sn),
// ses seviyesini podcast standardına yakın (-16 LUFS civarı) dengele
async function mixPieces(pieces, lines) {
  const SR = 44100;
  const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
  const bufs = [];
  try { for (const p of pieces) bufs.push(await ac.decodeAudioData(await p.blob.arrayBuffer())); } finally { ac.close(); }
  const gapFor = (i) => {
    if (i === 0) return 0;
    const prev = lines[pieces[i - 1].idx.at(-1)], cur = lines[pieces[i].idx[0]];
    const base = prev?.speaker === cur?.speaker ? 0.18 : 0.3;
    return base + (Math.random() - 0.5) * 0.12;
  };
  const gaps = pieces.map((_, i) => Math.floor(gapFor(i) * SR));
  const total = bufs.reduce((a, b, i) => a + b.length + gaps[i], 0) + Math.floor(0.6 * SR);
  const out = new Float32Array(total);
  const timings = new Array(lines.length);
  let off = Math.floor(0.2 * SR);
  bufs.forEach((b, i) => {
    off += gaps[i];
    const ch0 = b.getChannelData(0), ch1 = b.numberOfChannels > 1 ? b.getChannelData(1) : null;
    for (let k = 0; k < b.length; k++) out[off + k] = ch1 ? (ch0[k] + ch1[k]) / 2 : ch0[k];
    // satır zamanları: parça içindeki satırlara karakter oranında paylaştır
    const idx = pieces[i].idx; const lens = idx.map((j) => Math.max(1, lines[j].text.length)); const sum = lens.reduce((a, c) => a + c, 0);
    let t = off / SR; const dur = b.length / SR;
    idx.forEach((j, n) => { const d = dur * (lens[n] / sum); timings[j] = { start: t, end: t + d }; t += d; });
    off += b.length;
  });
  // ses seviyesi dengeleme: konuşma bölümlerinin RMS'ini ~-18 dBFS'e çek, tepeleri yumuşak sınırla
  let s2 = 0, n = 0;
  for (let i = 0; i < out.length; i += 4) { const v = out[i]; if (Math.abs(v) > 0.01) { s2 += v * v; n++; } }
  const gain = n ? Math.min(6, 0.126 / Math.sqrt(s2 / n)) : 1;
  for (let i = 0; i < out.length; i++) { const v = out[i] * gain; out[i] = Math.tanh(v * 1.2) / Math.tanh(1.2); }
  for (let i = 0; i < timings.length; i++) if (!timings[i]) timings[i] = timings[i - 1] || { start: 0, end: 0 };
  return { blob: encodeWav([out], SR), timings };
}

export function encodeWav(channels, sr) {
  const samples = channels[0];
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

// Herhangi bir ses dosyasını (webm/ogg/mp3) mono WAV'a çevir (MiniMax ve lokal klonlama WAV/MP3 ister)
export async function toWav(blob, sr = 24000) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let b; try { b = await ac.decodeAudioData(await blob.arrayBuffer()); } finally { ac.close(); }
  const off = new OfflineAudioContext(1, Math.ceil(b.duration * sr), sr);
  const src = off.createBufferSource(); src.buffer = b; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  return { blob: encodeWav([r.getChannelData(0)], sr), seconds: b.duration };
}

// Mikrofondan kayıt: const rec = await recordVoice(); … const { blob, seconds } = await rec.stop();
export async function recordVoice() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mr = new MediaRecorder(stream); const parts = [];
  mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
  mr.start(250);
  const end = () => new Promise((ok) => { mr.onstop = ok; mr.stop(); }).then(() => stream.getTracks().forEach((t) => t.stop()));
  return {
    stop: async () => { await end(); return toWav(new Blob(parts, { type: mr.mimeType })); },
    cancel: () => end()
  };
}

// ---------------- Tarayıcı sesi (canlı, dosyasız) ----------------
export function browserVoices(lang) {
  const code = langCode(lang).slice(0, 2);
  const vs = (window.speechSynthesis?.getVoices() || []).filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(code));
  const score = (v) => (/natural|online|neural/i.test(v.name) ? 10 : 0) + (/google/i.test(v.name) ? 3 : 0);
  return vs.sort((a, b) => score(b) - score(a));
}
export const hasBrowserVoice = (lang = 'Türkçe') => browserVoices(lang).length > 0;
export function hasNaturalBrowserVoice(lang) { return browserVoices(lang).some((v) => /natural|online|neural/i.test(v.name)); }
const FEMALE_RE = /emel|female|kadın|seda|yelda|filiz|google/i, MALE_RE = /ahmet|(^|\W)male|erkek|tolga|cem/i;
function pickBrowserVoice(lang, gender) {
  const vs = browserVoices(lang);
  if (!vs.length) return null;
  const f = vs.find((v) => FEMALE_RE.test(v.name) && !/(^|\W)male/i.test(v.name));
  const m = vs.find((v) => MALE_RE.test(v.name) && !/female/i.test(v.name));
  if (gender === 'm') return { voice: m || vs.find((v) => v !== f) || vs[0], male: !!m };
  return { voice: f || vs[0], female: !!f };
}
// Bu dilde tarayıcı sesi yoksa hiç konuşmaz (yabancı sesle Türkçe okumak robot gibi duyulur), onend hemen çağrılır.
export function speakBrowser(text, { lang, gender = 'f', rate = 1, onend }) {
  const p = window.speechSynthesis && pickBrowserVoice(lang, gender);
  if (!p) { setTimeout(() => onend?.(), 0); return null; }
  const u = new SpeechSynthesisUtterance(normalizeTR(text));
  u.lang = langCode(lang); u.voice = p.voice; u.rate = rate;
  u.onend = onend; u.onerror = onend;
  speechSynthesis.speak(u);
  return u;
}

// Tek satır (video sahnesi gibi) için ses dosyası
export async function synthOne(artifactId, key, text, speaker, lang, format = 'narration', opts = {}) {
  const r = await synthesize(artifactId + ':' + key, [{ speaker: speaker.id, text }], [speaker], lang, { format, ...opts });
  return r.blob;
}

// ---------------- Kısa metni gerçek ses motoruyla oku (hafıza sarayı, hikâye vb.) ----------------
// Aynı düğmeye ikinci basış durdurur; başka bir metin başlarsa öncekini keser. Robot tarayıcı sesi kullanılmaz.
let saying = null;
export function stopSpeaking() { const c = saying; saying = null; c?.stop(); }
export function speakText(key, text, { lang = 'Türkçe', onState = () => {} } = {}) {
  if (saying?.key === key) { stopSpeaking(); return null; }
  stopSpeaking();
  const ctl = { key, stopped: false, audio: null, stop() { this.stopped = true; this.audio?.pause(); onState('idle'); } };
  saying = ctl; onState('loading');
  (async () => {
    const cfg = await loadTTS();
    const sp = { id: 'A', name: 'Okuyucu', gender: cfg.narrator === 'f' ? 'f' : 'm', role: 'okuyucu' };
    const r = await synthesize('say:' + hash(text), [{ speaker: 'A', text }], [sp], lang, { format: 'narration' });
    if (ctl.stopped) return;
    ctl.audio = new Audio(URL.createObjectURL(r.blob));
    ctl.audio.onended = () => { if (saying === ctl) saying = null; onState('idle'); };
    await ctl.audio.play(); onState('playing');
  })().catch((e) => { if (saying === ctl) saying = null; onState('error', e); });
  return ctl;
}
