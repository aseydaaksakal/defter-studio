// Lokal yardımcı sunucu (server/ klasörü, isteğe bağlı): kaliteli TTS, video dışa aktarma,
// ses/video dökümü (Whisper), web sayfası ve YouTube okuma.
import { getSetting, setSetting } from './db.js';

let cache = { url: null, ok: null, at: 0, info: null };

export async function serverBase() { return (await getSetting('serverUrl', '')).replace(/\/$/, ''); }
export async function setServerBase(u) { await setSetting('serverUrl', u); cache.at = 0; }

// Sunucu çalışıyorsa adresini, değilse null döndürür (30 sn önbellek)
export async function serverUrl(force = false) {
  const url = await serverBase();
  if (!url) return null; // kullanıcı etkinleştirmedikçe yerel ağa istek atma
  if (!force && cache.url === url && Date.now() - cache.at < 30000) return cache.ok ? url : null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(url + '/health', { signal: ctl.signal });
    clearTimeout(t);
    cache = { url, ok: r.ok, at: Date.now(), info: r.ok ? await r.json() : null };
  } catch { cache = { url, ok: false, at: Date.now(), info: null }; }
  return cache.ok ? url : null;
}
export function serverInfo() { return cache.info; }
