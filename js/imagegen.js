// Yapay zeka görselleri (0.5.0): slayt, infografik ve video sahneleri için kaynakla ilgili görsel üretir.
// Sağlayıcılar (otomatik sıra): Gemini (Interactions API) → MiniMax image-01 → lokal sunucu (ComfyUI + FLUX.1-schnell).
// Her görsel (istem + oran + stil) için bir kez üretilir ve IndexedDB'de önbelleğe alınır; artifact içeriğine yalnız anahtar yazılır.
// Görsellerde yazı üretilmez (modeller Türkçe harfleri bozar); metni slayt/poster kendisi basar.
import { db, getSetting, setSetting } from './db.js';
import { serverUrl, serverInfo } from './server.js';
import { loadTTS } from './tts.js';
import { loadConfig } from './llm.js';

export const IMG_DEFAULTS = {
  provider: 'auto',                      // auto | gemini | minimax | server | off
  geminiModel: 'gemini-3.1-flash-lite-image',
  minimaxModel: 'image-01',
  style: 'auto',                         // auto (temaya göre) ya da STYLES anahtarı
  max: 12,                               // bir slayt sunusunda en çok kaç görsel (kota/zaman korunur)
  auto: true                             // slayt/infografik/video üretilirken görselleri de üret
};

export const STYLES = {
  flat: ['Düz vektör çizim', 'clean flat vector illustration, soft gradients, balanced composition, bright friendly colors'],
  sketch: ['Defter çizimi', 'hand-drawn notebook sketch, ink linework with soft marker colors on cream paper'],
  watercolor: ['Suluboya', 'soft watercolor illustration, gentle washes, light paper texture'],
  photo: ['Gerçekçi', 'realistic editorial photograph, natural light, shallow depth of field'],
  dark: ['Koyu, neon', 'moody dark background illustration with glowing cyan and violet accents, minimal, modern']
};
// Görsel temaya göre varsayılan stil
export const STYLE_FOR_THEME = { ocean: 'flat', paper: 'sketch', sketch: 'sketch', night: 'dark', sunset: 'watercolor', kawaii: 'flat' };

export const styleFor = (cfg, theme) => (cfg?.style && cfg.style !== 'auto' && STYLES[cfg.style] ? cfg.style : STYLE_FOR_THEME[theme] || 'flat');

export const ASPECTS = { '16:9': [1024, 576], '9:16': [576, 1024], '1:1': [768, 768], '4:3': [896, 672], '3:4': [672, 896] };
const MINIMAX_OK = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'];
const NO_TEXT = 'No text, no letters, no numbers, no captions, no logos, no watermark.';

export class ImgError extends Error { constructor(m, status = 0, retry = false) { super(m); this.status = status; this.retry = retry; } }

export async function loadImgCfg() { return { ...IMG_DEFAULTS, ...(await getSetting('img', {})) }; }
export async function saveImgCfg(c) { await setSetting('img', c); }

const geminiKey = async () => { const t = await loadTTS(); if (t.geminiKey) return t.geminiKey; const l = await loadConfig(); return l.provider === 'gemini' ? l.apiKey : ''; };
const minimaxKey = async () => (await loadTTS()).minimaxKey || '';

// Kullanılabilir sağlayıcılar, otomatik sırayla
export async function availableProviders() {
  const out = [];
  if (await geminiKey()) out.push('gemini');
  if (await minimaxKey()) out.push('minimax');
  if (await serverUrl() && serverInfo()?.image?.ok) out.push('server');
  return out;
}
export const PROVIDER_NAME = { gemini: 'Gemini', minimax: 'MiniMax', server: 'Lokal (ComfyUI/FLUX)' };
export async function imagesAvailable() {
  const c = await loadImgCfg();
  if (c.provider === 'off') return false;
  return (await availableProviders()).length > 0;
}

// ---------------------------------------------------------------- yardımcılar
function b64ToBlob(b64, type = 'image/png') {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Yanıtın içinde (şeması değişse de) base64 görseli bulur: Interactions (steps[].content[]), generateContent (inlineData), MiniMax
export function findImage(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 8) return null;
  if (typeof o.data === 'string' && o.data.length > 64 && (o.type === 'image' || /^image\//.test(o.mime_type || o.mimeType || ''))) return { data: o.data, mime: o.mime_type || o.mimeType || 'image/png' };
  if (o.inlineData?.data && /^image\//.test(o.inlineData.mimeType || 'image/')) return { data: o.inlineData.data, mime: o.inlineData.mimeType || 'image/png' };
  if (typeof o.image_base64?.[0] === 'string') return { data: o.image_base64[0], mime: 'image/jpeg' };
  if (typeof o.bytesBase64Encoded === 'string') return { data: o.bytesBase64Encoded, mime: o.mimeType || 'image/png' };
  for (const v of Object.values(o)) { const r = findImage(v, depth + 1); if (r) return r; }
  return null;
}
async function httpErr(name, res) {
  let m = ''; try { const j = await res.json(); m = j.error?.message || j.base_resp?.status_msg || j.detail || JSON.stringify(j).slice(0, 200); } catch { /* gövde yok */ }
  const why = res.status === 401 || res.status === 403 ? ' (anahtar geçersiz ya da bu modele erişim yok)' : res.status === 429 ? ' (kota/hız sınırı)' : '';
  return new ImgError(`${name}: ${res.status}${why} ${m}`.trim(), res.status, res.status === 429 || res.status >= 500);
}

// ---------------------------------------------------------------- sağlayıcılar
// Gemini: https://ai.google.dev/gemini-api/docs/image-generation (Interactions API; eski generateContent'e düşer)
async function geminiImage(prompt, aspect, cfg, signal) {
  const key = await geminiKey();
  if (!key) throw new ImgError('Gemini görseli için Ayarlar › Seslendirme’ye (ya da dil modeline) Gemini API anahtarı girin.');
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
  const model = cfg.geminiModel || IMG_DEFAULTS.geminiModel;
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  let res = await fetch(`${base}/interactions`, { method: 'POST', headers, signal, body: JSON.stringify({ model, input: [{ type: 'text', text: prompt }], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: aspect, image_size: '1K' } }) });
  if (res.status === 400) // bazı modeller response_format kabul etmeyebilir: oranı istemde söyleyip yeniden dene
    res = await fetch(`${base}/interactions`, { method: 'POST', headers, signal, body: JSON.stringify({ model, input: [{ type: 'text', text: `${prompt} Aspect ratio ${aspect}.` }] }) });
  if (res.status === 404) // eski uç nokta
    res = await fetch(`${base}/models/${cfg.geminiLegacyModel || 'gemini-2.5-flash-image'}:generateContent`, { method: 'POST', headers, signal, body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt} Aspect ratio ${aspect}.` }] }], generationConfig: { responseModalities: ['IMAGE'] } }) });
  if (!res.ok) throw await httpErr('Gemini görsel', res);
  const img = findImage(await res.json());
  if (!img) throw new ImgError('Gemini yanıtında görsel yok (istem güvenlik süzgecine takılmış olabilir).');
  return b64ToBlob(img.data, img.mime);
}

// MiniMax image-01: https://platform.minimax.io/docs/api-reference/image-generation-t2i
async function minimaxImage(prompt, aspect, cfg, signal) {
  const key = await minimaxKey();
  if (!key) throw new ImgError('MiniMax görseli için Ayarlar › Seslendirme’ye MiniMax API anahtarı girin.');
  const res = await fetch('https://api.minimax.io/v1/image_generation', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal,
    body: JSON.stringify({ model: cfg.minimaxModel || 'image-01', prompt: prompt.slice(0, 1500), aspect_ratio: MINIMAX_OK.includes(aspect) ? aspect : '16:9', response_format: 'base64', n: 1 })
  });
  if (!res.ok) throw await httpErr('MiniMax görsel', res);
  const j = await res.json();
  if (j.base_resp && j.base_resp.status_code !== 0) throw new ImgError(`MiniMax görsel: ${j.base_resp.status_code} ${j.base_resp.status_msg || ''}`.trim(), 0, j.base_resp.status_code === 1002);
  const img = findImage(j);
  if (!img) throw new ImgError('MiniMax yanıtında görsel yok.');
  return b64ToBlob(img.data, img.mime);
}

// Lokal sunucu: /image → ComfyUI (127.0.0.1:8188) üzerinde FLUX.1-schnell
async function serverImage(prompt, aspect, _cfg, signal) {
  const url = await serverUrl();
  if (!url) throw new ImgError('Lokal sunucu çalışmıyor (server\\baslat.bat).');
  const [w, h] = ASPECTS[aspect] || ASPECTS['16:9'];
  const res = await fetch(url + '/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ prompt, width: w, height: h }) });
  if (!res.ok) throw await httpErr('Lokal görsel', res);
  return await res.blob();
}
const RUN = { gemini: geminiImage, minimax: minimaxImage, server: serverImage };

// ---------------------------------------------------------------- önbellek
const objUrls = new Map(); // anahtar → blob: adresi (eşzamanlı çizim için)
export async function cachedBlob(key) { return (await db.blobs.where('artifactId').equals(key).first())?.blob || null; }
async function putBlob(key, blob, meta) {
  await db.blobs.where('artifactId').equals(key).delete(); await db.blobs.add({ artifactId: key, kind: 'image', blob, ...meta });
  const u = objUrls.get(key); if (u) { URL.revokeObjectURL(u); objUrls.delete(key); } // yenilenen görselin eski adresi geçersiz
}
export async function removeImage(key) { await db.blobs.where('artifactId').equals(key).delete(); const u = objUrls.get(key); if (u) { URL.revokeObjectURL(u); objUrls.delete(key); } }

// Eşzamanlı çizim için: önceden yüklenmişse blob: adresi, değilse null
export const imageSrc = (key) => objUrls.get(key) || null;
export async function preload(keys) {
  await Promise.all([...new Set((keys || []).filter(Boolean))].map(async (k) => {
    if (objUrls.has(k)) return;
    const b = await cachedBlob(k); if (b) objUrls.set(k, URL.createObjectURL(b));
  }));
}
export async function dataUrl(key) {
  const b = await cachedBlob(key); if (!b) return null;
  return await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });
}
// HTML dizesindeki blob: adreslerini data: adresiyle değiştirir (bağımsız HTML dışa aktarımı)
export async function inlineImages(html, keys) {
  for (const k of new Set((keys || []).filter(Boolean))) { const u = objUrls.get(k), d = await dataUrl(k); if (u && d) html = html.split(u).join(d); }
  return html;
}
export async function loadImgElement(key) { // video çizimi için
  await preload([key]); const src = imageSrc(key); if (!src) return null;
  const im = new Image(); im.src = src; try { await im.decode(); return im; } catch { return null; }
}

// ---------------------------------------------------------------- üretim
export function buildPrompt(visual, style = 'flat') {
  const st = (STYLES[style] || STYLES.flat)[1];
  return `${String(visual || '').trim().replace(/\s+/g, ' ').slice(0, 600)}. Style: ${st}. ${NO_TEXT}`;
}
const sleep = (ms, signal) => new Promise((ok, no) => { const t = setTimeout(ok, ms); signal?.addEventListener('abort', () => { clearTimeout(t); no(new DOMException('İptal', 'AbortError')); }, { once: true }); });

// Tek görsel: önbellekte varsa onu verir. Dönen { key, blob, provider, cached }
export async function generateImage(visual, { aspect = '16:9', style, signal, force = false, provider } = {}) {
  const cfg = await loadImgCfg();
  if (cfg.provider === 'off') throw new ImgError('Görsel üretimi Ayarlar’dan kapatılmış.');
  const st = style || (cfg.style !== 'auto' && STYLES[cfg.style] ? cfg.style : 'flat');
  const prompt = buildPrompt(visual, st);
  const key = 'img:' + await sha(`${prompt}|${aspect}`);
  if (!force) { const hit = await cachedBlob(key); if (hit) return { key, blob: hit, provider: 'cache', cached: true }; }
  const avail = await availableProviders();
  const want = provider || cfg.provider;
  const order = want && want !== 'auto' ? [want, ...avail.filter((p) => p !== want)] : avail;
  if (!order.length) throw new ImgError('Görsel için Gemini/MiniMax anahtarı ya da lokal sunucuda ComfyUI gerekir (Ayarlar › Görseller).');
  let last;
  for (const p of order) {
    if (!avail.includes(p) && p !== want) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const blob = await RUN[p](prompt, aspect, cfg, signal);
        await putBlob(key, blob, { provider: p, aspect });
        return { key, blob, provider: p, cached: false };
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        last = e;
        if (e.retry && attempt < 2) { await sleep(3000 * (attempt + 1), signal); continue; }
        break;
      }
    }
  }
  throw last || new ImgError('Görsel üretilemedi.');
}

// Birden çok görsel (en çok 2 eşzamanlı). items: [{ visual, aspect }]; sonuç: her öğe için { key } ya da { error }
export async function generateMany(items, { signal, onProgress, style, concurrency = 2 } = {}) {
  const out = new Array(items.length); let next = 0, done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      if (!items[i]?.visual) { out[i] = { skipped: true }; done++; continue; }
      try { const r = await generateImage(items[i].visual, { aspect: items[i].aspect, style, signal }); out[i] = { key: r.key, cached: r.cached, provider: r.provider }; }
      catch (e) { if (e.name === 'AbortError') throw e; out[i] = { error: e.message }; }
      onProgress?.(++done, items.length, out[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, worker));
  return out;
}

// Slayt, sahne ya da kutu için görselin gerektiği düzenler (metin yoğun/veri düzenleri görselsiz kalır)
export const IMAGE_LAYOUTS = new Set(['title', 'bullets', 'two-col', 'quote', 'stat']);
