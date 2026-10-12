// Defter Studio — seslendirme motoru
// Motorlar (kaliteye göre): Gemini TTS (çok konuşmacılı, doğal Türkçe) · OpenAI TTS · lokal sunucu (XTTS/Chatterbox/Piper)
// · tarayıcıda Piper (ücretsiz, çevrimdışı, Türkçe) · tarayıcı sesi (Web Speech; Edge'de doğal Emel/Ahmet sesleri).
// Çıktı: tek parça, ses seviyesi dengelenmiş WAV + satır zamanlamaları (döküm vurgusu ve ileri/geri sarma için).
import { db, getSetting, setSetting } from './db.js';
import { serverUrl } from './server.js';
import { normalizeTR } from './textnorm.js';
import { loadConfig } from './llm.js';

const LANG_CODES = { 'Türkçe': 'tr-TR', English: 'en-US', Deutsch: 'de-DE', 'Français': 'fr-FR', 'Español': 'es-ES', 'العربية': 'ar-SA', 'Русский': 'ru-RU', Italiano: 'it-IT', Nederlands: 'nl-NL', '日本語': 'ja-JP' };
export const langCode = (l) => LANG_CODES[l] || 'tr-TR';

export const ENGINES = {
  auto: 'Otomatik (en iyisini seç)',
  gemini: 'Gemini TTS — en doğal, çok konuşmacılı (API anahtarı)',
  openai: 'OpenAI TTS (API anahtarı)',
  server: 'Lokal yardımcı sunucu (XTTS / Chatterbox / Piper)',
  piper: 'Tarayıcıda Piper — ücretsiz, çevrimdışı Türkçe',
  browser: 'Tarayıcı sesi (Edge’de doğal Emel/Ahmet)'
};
export const VOICES = {
  gemini: { f: ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Sulafat', 'Despina'], m: ['Puck', 'Charon', 'Orus', 'Iapetus', 'Algenib', 'Sadaltager'] },
  openai: { f: ['nova', 'shimmer', 'coral', 'sage'], m: ['onyx', 'echo', 'ash', 'ballad'] },
  piper: { f: ['tr_TR-dfki-medium'], m: ['tr_TR-fahrettin-medium', 'tr_TR-fettah-medium'] }
};

export async function loadTTS() {
  return { engine: 'auto', geminiKey: '', geminiModel: 'gemini-3.8-flash-tts', openaiKey: '', openaiModel: 'gpt-4o-mini-tts', rate: 1, ...(await getSetting('tts', {})) };
}
export async function saveTTS(cfg) { await setSetting('tts', cfg); }

// Hangi motor kullanılacak? (otomatik: anahtar varsa Gemini, sunucu varsa sunucu, yoksa tarayıcıda Piper)
export async function resolveEngine(cfg) {
  cfg = cfg || await loadTTS();
  if (cfg.engine !== 'auto') return cfg.engine;
  const llm = await loadConfig();
  if (cfg.geminiKey || (llm.provider === 'gemini' && llm.apiKey)) return 'gemini';
  if (cfg.openaiKey) return 'openai';
  if (await serverUrl()) return 'server';
  return 'piper';
}
const geminiKey = async (cfg) => cfg.geminiKey || ((await loadConfig()).provider === 'gemini' ? (await loadConfig()).apiKey : '');

// Konuşmacılara cinsiyete göre farklı ses ata
export function assignVoices(speakers, engine) {
  const pool = VOICES[engine];
  const used = { f: 0, m: 0 };
  return Object.fromEntries(speakers.map((s) => {
    const g = s.gender === 'm' ? 'm' : 'f';
    const v = s.voice || (pool ? pool[g][used[g]++ % pool[g].length] : g);
    return [s.id, v];
  }));
}

// ---------------- Motorlar ----------------
function b64ToBlob(b64, type) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
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

async function geminiChunk(lines, voices, speakers, cfg, style) {
  const key = await geminiKey(cfg);
  if (!key) throw new Error('Gemini TTS için ayarlara Gemini API anahtarı girin.');
  const names = Object.fromEntries(speakers.map((s) => [s.id, s.name]));
  const ids = [...new Set(lines.map((l) => l.speaker))];
  const content = lines.map((l) => ({ type: 'text', text: l.text, annotations: [{ type: 'speech_metadata', speaker: names[l.speaker], style: l.tone ? `${style}; ${l.tone}` : style }] }));
  const speech = ids.length > 1
    ? { mode: 'conversational', speakers: ids.map((id) => ({ speaker: names[id], voice: voices[id] })) }
    : [{ voice: voices[ids[0]] }];
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ model: cfg.geminiModel || 'gemini-3.8-flash-tts', input: [{ type: 'user_input', content }], response_format: { type: 'audio' }, generation_config: { speech_config: speech } })
  });
  if (res.ok) {
    const j = await res.json();
    const audio = (j.steps || []).filter((s) => s.type === 'model_output').flatMap((s) => s.content || []).filter((c) => c.type === 'audio').pop();
    if (audio?.data) return b64ToBlob(audio.data, audio.mime_type || 'audio/wav');
    throw new Error('Gemini yanıtında ses yok');
  }
  if (res.status !== 404 && res.status !== 400) throw new Error('Gemini TTS: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  // Eski uç nokta (generateContent) ile yeniden dene
  const legacy = cfg.geminiLegacyModel || 'gemini-2.5-flash-preview-tts';
  const text = `${style}.\n` + lines.map((l) => `${names[l.speaker]}: ${l.text}`).join('\n');
  const speechConfig = ids.length > 1
    ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: ids.slice(0, 2).map((id) => ({ speaker: names[id], voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[id] } } })) } }
    : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[ids[0]] } } };
  const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${legacy}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig } })
  });
  if (!r2.ok) throw new Error('Gemini TTS: ' + r2.status + ' ' + (await r2.text()).slice(0, 200));
  const j2 = await r2.json();
  const part = j2.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('Gemini yanıtında ses yok');
  return pcmToWav(b64ToBlob(part.inlineData.data, 'audio/l16'), 24000);
}

async function openaiLine(line, voice, cfg, style) {
  if (!cfg.openaiKey) throw new Error('OpenAI TTS için ayarlara OpenAI API anahtarı girin.');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.openaiKey },
    body: JSON.stringify({ model: cfg.openaiModel || 'gpt-4o-mini-tts', voice, input: line.text, instructions: `${style}${line.tone ? '; ' + line.tone : ''}. Doğal Türkçe telaffuz.`, response_format: 'wav' })
  });
  if (!res.ok) throw new Error('OpenAI TTS: ' + res.status);
  return res.blob();
}

async function serverLine(line, speaker, lang) {
  const base = await serverUrl();
  if (!base) throw new Error('Lokal yardımcı sunucu çalışmıyor.');
  const r = await fetch(base + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: normalizeTR(line.text), speaker: speaker.id, gender: speaker.gender, lang: langCode(lang) }) });
  if (!r.ok) throw new Error('Sunucu TTS: ' + (await r.text()).slice(0, 200));
  return r.blob();
}

let piperMod = null;
async function piperLine(line, voice, onInfo) {
  try { piperMod = piperMod || await import('./vendor/piper/piper-tts-web.js'); }
  catch { throw new Error('Tarayıcıda Piper ses motoru yüklenemedi (internet gerekir). Ayarlar › Seslendirme’den Gemini veya lokal sunucuyu seçebilirsiniz.'); }
  try {
    return await piperMod.predict({ text: normalizeTR(line.text), voiceId: voice }, (p) => {
      if (p?.total && onInfo) onInfo(`Ses modeli indiriliyor %${Math.round((p.loaded / p.total) * 100)} (ilk seferde ~60 MB)`);
    });
  } catch (e) {
    if (/fetch|import|network/i.test(e.message)) throw new Error('Tarayıcıda Piper ses motoru indirilemedi (internet gerekir). Ayarlar › Seslendirme’den Gemini veya lokal sunucuyu seçebilirsiniz.');
    throw e;
  }
}

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
  narration: 'Belgesel anlatıcısı; sıcak, net, merak uyandıran'
};

function chunkLines(lines, maxChars = 1600) {
  const chunks = []; let cur = [], chars = 0, spk = new Set();
  for (const l of lines) {
    const ns = new Set([...spk, l.speaker]);
    if (cur.length && (chars + l.text.length > maxChars || ns.size > 2)) { chunks.push(cur); cur = []; chars = 0; spk = new Set(); }
    cur.push(l); chars += l.text.length; spk.add(l.speaker);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/**
 * lines: [{speaker, text, tone?}], speakers: [{id, name, gender}]
 * Dönen: { blob (WAV), timings: [{start, end}], engine } — önbelleğe alınır, metin değişmedikçe yeniden üretilmez.
 */
export async function synthesize(artifactId, lines, speakers, lang, { format = 'deep', onProgress = () => {} } = {}) {
  const cfg = await loadTTS();
  const engine = await resolveEngine(cfg);
  if (engine === 'browser') return { engine, blob: null, timings: null };
  const voices = assignVoices(speakers, engine);
  const key = hash(engine + JSON.stringify(voices) + (cfg.geminiModel || '') + JSON.stringify(lines.map((l) => [l.speaker, l.text, l.tone])));
  const cached = await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'mix' && b.key === key).first();
  if (cached) return { engine, blob: cached.blob, timings: cached.timings };
  const style = STYLE[format] || STYLE.deep;
  const byId = Object.fromEntries(speakers.map((s) => [s.id, s]));
  const pieces = []; // {blob, lines:[idx...]}
  if (engine === 'gemini') {
    const chunks = chunkLines(lines);
    let done = 0;
    for (const ch of chunks) {
      onProgress(`Seslendiriliyor ${done + 1}–${done + ch.length} / ${lines.length}`);
      pieces.push({ blob: await geminiChunk(ch, voices, speakers, cfg, style), idx: ch.map((l) => lines.indexOf(l)) });
      done += ch.length;
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      onProgress(`Seslendiriliyor ${i + 1} / ${lines.length}`);
      const l = lines[i];
      const sp = byId[l.speaker] || speakers[0];
      const blob = engine === 'openai' ? await openaiLine(l, voices[l.speaker], cfg, style)
        : engine === 'server' ? await serverLine(l, sp, lang)
          : await piperLine(l, voices[l.speaker], onProgress);
      pieces.push({ blob, idx: [i] });
    }
  }
  onProgress('Ses birleştiriliyor ve dengeleniyor…');
  const { blob, timings } = await mixPieces(pieces, lines);
  await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'mix').delete();
  await db.blobs.add({ artifactId, kind: 'mix', key, blob, timings });
  return { engine, blob, timings };
}

// Parçaları birleştir: konuşmacı değişiminde ~0,3 sn doğal duraklama (Google podcast'inde ölçülen ortanca 0,32 sn),
// ses seviyesini podcast standardına yakın (-16 LUFS civarı) dengele
async function mixPieces(pieces, lines) {
  const SR = 44100;
  const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
  const bufs = [];
  for (const p of pieces) bufs.push(await ac.decodeAudioData(await p.blob.arrayBuffer()));
  ac.close();
  const gapFor = (i) => {
    if (i === 0) return 0;
    const prev = lines[pieces[i - 1].idx.at(-1)], cur = lines[pieces[i].idx[0]];
    const base = prev?.speaker === cur?.speaker ? 0.18 : 0.3;
    return base + (Math.random() - 0.5) * 0.12;
  };
  const gaps = pieces.map((_, i) => Math.floor(gapFor(i) * SR));
  const total = bufs.reduce((a, b, i) => a + b.length + gaps[i], 0) + Math.floor(0.4 * SR);
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

// ---------------- Tarayıcı sesi (canlı, dosyasız) ----------------
export function browserVoices(lang) {
  const code = langCode(lang).slice(0, 2);
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(code));
  const score = (v) => (/natural|online|neural/i.test(v.name) ? 10 : 0) + (/google/i.test(v.name) ? 3 : 0);
  return vs.sort((a, b) => score(b) - score(a));
}
export function hasNaturalBrowserVoice(lang) { return browserVoices(lang).some((v) => /natural|online|neural/i.test(v.name)); }

export function speakBrowser(text, { lang, gender = 'f', rate = 1, onend }) {
  const u = new SpeechSynthesisUtterance(normalizeTR(text));
  u.lang = langCode(lang);
  const vs = browserVoices(lang);
  const female = vs.find((v) => /emel|female|kadın|seda|yelda|filiz/i.test(v.name));
  const male = vs.find((v) => /ahmet|male|erkek|tolga|cem/i.test(v.name) && !/female/i.test(v.name));
  u.voice = (gender === 'm' ? male || vs[1] : female || vs[0]) || vs[0] || null;
  if (gender === 'm' && !male && vs.length < 2) u.pitch = 0.75;
  u.rate = rate;
  u.onend = onend; u.onerror = onend;
  speechSynthesis.speak(u);
  return u;
}

// Tek satır (video sahnesi gibi) için ses dosyası
export async function synthOne(artifactId, key, text, speaker, lang, format = 'narration') {
  const r = await synthesize(artifactId + ':' + key, [{ speaker: speaker.id, text }], [speaker], lang, { format });
  return r.blob;
}
