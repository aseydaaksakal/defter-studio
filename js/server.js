// Lokal yardımcı sunucu (server/ klasörü, isteğe bağlı): uygulamayı localhost:8765'te sunar, kaliteli TTS (Chatterbox /
// edge-tts / Piper), lokal ses klonlama, ses/video dökümü (Whisper), web sayfası ve YouTube okuma, Ollama ve API vekili.
import { getSetting, setSetting } from './db.js';

let cache = { url: null, ok: null, at: 0, info: null };
let pending = null;
const listeners = new Set();

// Uygulama yardımcı sunucunun kendisinden açıldıysa (http://localhost:8765) adres ayarı gerekmez: aynı köken kullanılır.
const sameOrigin = () => (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? location.origin : '');

export async function serverBase() { return ((await getSetting('serverUrl', '')) || '').replace(/\/$/, ''); }
export async function setServerBase(u) { await setSetting('serverUrl', u); cache.at = 0; }

// TEK ADRES ÇÖZÜCÜ: bütün ekranlar (Ses stüdyosu, Modeller, görseller, podcast) sunucu durumunu buradan alır.
// Çalışıyorsa adresini, değilse null döndürür. Başarı 60 sn, başarısızlık yalnız 4 sn önbellekte kalır (kısa bir
// takılma "çalışmıyor" iletisini yarım dakika kilitlemesin); eşzamanlı çağrılar tek bir /health isteğini paylaşır.
export async function serverUrl(force = false) {
  const url = (await serverBase()) || sameOrigin();
  if (!url) return null; // kullanıcı etkinleştirmedikçe başka bir kökenden yerel ağa istek atma
  const fresh = Date.now() - cache.at < (cache.ok ? 60000 : 4000);
  if (!force && cache.url === url && fresh) return cache.ok ? url : null;
  if (pending && pending.url === url) return pending.p;
  const p = (async () => {
    let info = null;
    for (let k = 0; k < 2 && !info?.ok; k++) { // bir kez yeniden dene: ilk bağlantı geçici takılabilir
      try { const r = await fetch(url + '/health', { signal: AbortSignal.timeout(2500) }); info = r.ok ? await r.json().catch(() => null) : null; } catch { info = null; }
    }
    const was = cache.ok;
    cache = { url, ok: !!info?.ok, at: Date.now(), info: info?.ok ? info : null };
    if (was !== cache.ok) listeners.forEach((f) => { try { f(cache.ok, cache.info); } catch {} });
    return cache.ok ? url : null;
  })();
  pending = { url, p };
  try { return await p; } finally { pending = null; }
}
export function serverInfo() { return cache.info; }
export const servedByHelper = () => !!sameOrigin() && cache.url === sameOrigin() && cache.ok;
export const onServerChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Sunucu gerekiyorsa adresi verir; yoksa bir kez taze yoklar, yine yoksa sade iletiyle hata fırlatır.
export const SERVER_DOWN = "Lokal sunucu çalışmıyor. tools\\kur.bat'ı çalıştırın.";
export async function needServer(msg = SERVER_DOWN) {
  const u = (await serverUrl()) || (await serverUrl(true));
  if (!u) throw new Error(msg);
  return u;
}

// ---------- Motor durumu (GET /health › tts: engines = gerçekten çalışan, installed = diskte paketi olan, engineErrors = {motor: hata})
const ENGINE_NAMES = { pockettr: 'Pocket TR', omnivoice: 'OmniVoice', voxcpm: 'VoxCPM2', chatterbox: 'Chatterbox', xtts: 'XTTS', edge: 'Edge', piper: 'Piper' };
export const engineName = (e) => ENGINE_NAMES[e] || e;
// -> { run: [çalışanlar], bad: {motor: hata}, off: [kurulu olmayan bilinenler], known: bool }
export function engineStatus(info = serverInfo()) {
  const t = info?.tts || {};
  const run = (t.engines || []).filter((e) => e !== 'piper');
  const errs = t.engineErrors || {};
  const inst = new Set([...(t.installed || []), ...Object.keys(errs)]);
  const bad = {};
  for (const e of inst) if (!run.includes(e) && e !== 'piper') bad[e] = errs[e] || 'paket var ama motor başlamadı';
  const off = ['pockettr', 'omnivoice', 'voxcpm', 'edge'].filter((e) => !run.includes(e) && !(e in bad));
  return { run, bad, off, known: Array.isArray(t.installed) || !!t.engineErrors };
}
// Bir motor için tek satır durum: { state: 'ok'|'bad'|'off'|'unknown', text }
export function engineState(name, info = serverInfo()) {
  const s = engineStatus(info);
  if (s.run.includes(name)) return { state: 'ok', text: '✓ çalışıyor' };
  if (name in s.bad) return { state: 'bad', text: '✗ ' + s.bad[name] };
  return s.known ? { state: 'off', text: 'kurulu değil' } : { state: 'unknown', text: '' };
}
export const REINSTALL_HINT = "tools\\kur.bat'ı yeniden çalıştırın.";

// Sunucunun ham hata gövdesini ({"detail":"…"}, DLL yolu, izleme) sade Türkçe iletiye çevirir: { msg, detail }
export function friendlyError(raw, status = 0) {
  let t = String(raw ?? '').trim(), d = t;
  try { const j = JSON.parse(t); d = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail ?? j); t = d; } catch {}
  t = t.replace(/^Sunucu TTS:\s*/i, '');
  const first = t.split(/\r?\n/).find((x) => x.trim()) || '';
  let msg;
  if (/CUDA out of memory|out of memory|OOM/i.test(t)) msg = 'Ekran kartı belleği yetmedi. Ollama modelini boşaltıp yeniden deneyin.';
  else if (/DLL|WinError|No module named|ModuleNotFoundError|ImportError|cannot import/i.test(t)) msg = 'Ses motoru bu bilgisayarda çalışmıyor. ' + REINSTALL_HINT;
  else if (/hazır değil|kurulu değil|motor yok|engine/i.test(first) && status >= 500) msg = first.length < 140 ? first : 'Ses motoru hazır değil. ' + REINSTALL_HINT;
  else if (status === 503 || status === 502 || status === 504) msg = 'Ses motoru şu an yanıt vermiyor. ' + REINSTALL_HINT;
  else msg = first.length > 160 ? first.slice(0, 157) + '…' : first || 'Bilinmeyen hata';
  return { msg, detail: d };
}

// ---------- Podcast kadrosu: doğruluk kaynağı sunucu (GET/PUT /cast); sunucu yoksa localStorage yedeği.
// Pages ile localhost:8765 farklı tarayıcı kökeni olduğundan yerel depolar paylaşılmaz; kadro sunucuda durunca kaybolmaz.
const CAST_KEY = 'ds-cast';
const cleanCast = (c) => (Array.isArray(c) ? c : []).filter((x) => x && typeof x === 'object').map((x) => ({ id: x.id || undefined, name: String(x.name || '').trim(), gender: x.gender === 'm' ? 'm' : 'f', voice: x.voice || '' })).slice(0, 12);
export function localCast() { try { return cleanCast(JSON.parse(localStorage.getItem(CAST_KEY) || '[]')); } catch { return []; } }
export function keepLocalCast(cast) { try { localStorage.setItem(CAST_KEY, JSON.stringify(cleanCast(cast))); } catch {} }
export async function pushCast(cast) {
  keepLocalCast(cast);
  const u = await serverUrl(); if (!u) return false;
  try { const r = await fetch(u + '/cast', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cast: cleanCast(cast) }), signal: AbortSignal.timeout(5000) }); return r.ok; } catch { return false; }
}
// { cast, from: 'server'|'local' }: sunucu doluysa o kazanır; boşsa ve yerelde varsa yerel kadro sunucuya taşınır.
export async function pullCast(localList = []) {
  const u = await serverUrl();
  const local = cleanCast(localList).length ? cleanCast(localList) : localCast();
  if (!u) return { cast: local, from: 'local' };
  try {
    const r = await fetch(u + '/cast', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const srv = cleanCast((await r.json())?.cast);
      if (srv.length) { keepLocalCast(srv); return { cast: srv, from: 'server' }; }
      if (local.length) { await pushCast(local); return { cast: local, from: 'local', migrated: true }; }
      return { cast: [], from: 'server' };
    }
  } catch {}
  return { cast: local, from: 'local' };
}

// Sunucu kendini güncelleyebilir (server/guncelle.py): siteyle karşılaştırır, yalnız değişen dosyaları indirir.
export async function updateCheck(force = true) {
  const base = await serverUrl(); if (!base) return null;
  const r = await fetch(`${base}/update/check${force ? '?force=true' : ''}`, { signal: AbortSignal.timeout(20000) });
  return r.ok ? r.json() : null;
}
export async function updateApply() {
  const base = await serverUrl(); if (!base) throw new Error('Sunucu çalışmıyor.');
  const r = await fetch(`${base}/update/apply`, { method: 'POST', signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
}
