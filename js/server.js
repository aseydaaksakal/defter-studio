// Lokal yardımcı sunucu (server/ klasörü, isteğe bağlı): uygulamayı localhost:8765'te sunar, kaliteli TTS (Chatterbox /
// edge-tts / Piper), lokal ses klonlama, ses/video dökümü (Whisper), web sayfası ve YouTube okuma, Ollama ve API vekili.
import { getSetting, setSetting } from './db.js';

let cache = { url: null, ok: null, at: 0, info: null };

// Uygulama yardımcı sunucunun kendisinden açıldıysa (http://localhost:8765) adres ayarı gerekmez: aynı köken kullanılır.
const sameOrigin = () => (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? location.origin : '');

export async function serverBase() { return ((await getSetting('serverUrl', '')) || '').replace(/\/$/, ''); }
export async function setServerBase(u) { await setSetting('serverUrl', u); cache.at = 0; }

// Sunucu çalışıyorsa adresini, değilse null döndürür (30 sn önbellek)
export async function serverUrl(force = false) {
  const url = (await serverBase()) || sameOrigin();
  if (!url) return null; // kullanıcı etkinleştirmedikçe başka bir kökenden yerel ağa istek atma
  if (!force && cache.url === url && Date.now() - cache.at < 30000) return cache.ok ? url : null;
  try {
    const r = await fetch(url + '/health', { signal: AbortSignal.timeout(1500) });
    const info = r.ok ? await r.json().catch(() => null) : null;
    cache = { url, ok: !!info?.ok, at: Date.now(), info };
  } catch { cache = { url, ok: false, at: Date.now(), info: null }; }
  return cache.ok ? url : null;
}
export function serverInfo() { return cache.info; }
export const servedByHelper = () => !!sameOrigin() && cache.url === sameOrigin() && cache.ok;
