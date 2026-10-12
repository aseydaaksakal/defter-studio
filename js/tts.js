// Defter Studio — seslendirme
// 1) Lokal yardımcı sunucu varsa: Piper / XTTS / Chatterbox ile gerçek ses dosyası (indirilebilir, videoya gömülür)
// 2) Yoksa: tarayıcının ücretsiz Web Speech sesleri (anında çalar, dosyaya kaydedilemez)
import { serverUrl } from './server.js';
import { db } from './db.js';

const LANG_CODES = { 'Türkçe': 'tr-TR', English: 'en-US', Deutsch: 'de-DE', 'Français': 'fr-FR', 'Español': 'es-ES', 'العربية': 'ar-SA', 'Русский': 'ru-RU', Italiano: 'it-IT', Nederlands: 'nl-NL', '日本語': 'ja-JP' };
export const langCode = (l) => LANG_CODES[l] || 'tr-TR';

export function browserVoices(lang) {
  const code = langCode(lang).slice(0, 2);
  const all = speechSynthesis.getVoices();
  const vs = all.filter((v) => v.lang.toLowerCase().startsWith(code));
  // Doğal (Neural/Online) sesleri öne al
  return vs.sort((a, b) => (/(natural|online|neural)/i.test(b.name) ? 1 : 0) - (/(natural|online|neural)/i.test(a.name) ? 1 : 0));
}

export function speakBrowser(text, { lang, voiceIndex = 0, rate = 1, onend }) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langCode(lang);
  const vs = browserVoices(lang);
  if (vs.length) u.voice = vs[voiceIndex % vs.length];
  if (vs.length < 2 && voiceIndex === 1) u.pitch = 0.8; // tek ses varsa ikinci sunucuyu pesleştir
  u.rate = rate;
  u.onend = onend; u.onerror = onend;
  speechSynthesis.speak(u);
  return u;
}

// Sunucu TTS: bir satırı ses dosyasına çevirir ve önbelleğe alır
export async function renderLine(artifactId, idx, text, speaker, lang) {
  const key = `${idx}`;
  const cached = await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'line' && b.key === key && b.text === text).first();
  if (cached) return cached.blob;
  const base = await serverUrl();
  if (!base) return null;
  const r = await fetch(base + '/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speaker, lang: langCode(lang) })
  });
  if (!r.ok) throw new Error('TTS hatası: ' + (await r.text()));
  const blob = await r.blob();
  await db.blobs.where('artifactId').equals(artifactId).filter((b) => b.kind === 'line' && b.key === key).delete();
  await db.blobs.add({ artifactId, kind: 'line', key, text, blob });
  return blob;
}

// Birden çok ses parçasını tek WAV dosyasında birleştir (satırlar arasına kısa sessizlik)
export async function concatToWav(blobs, gap = 0.25) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const bufs = [];
  for (const b of blobs) bufs.push(await ac.decodeAudioData(await b.arrayBuffer()));
  const sr = bufs[0]?.sampleRate || 24000;
  const total = bufs.reduce((a, b) => a + b.length + Math.floor(gap * sr), 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const b of bufs) { out.set(b.getChannelData(0), off); off += b.length + Math.floor(gap * sr); }
  ac.close();
  return encodeWav(out, sr);
}

function encodeWav(samples, sr) {
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
