// Piper seslendirmesi arka plan iş parçacığında: arayüz donmaz.
// 0.6.0: her ses (voiceId) kendi oturumunu SÜREKLİ tutar; model bir kez belleğe alınır, sonraki satırlar için yeniden yüklenmez.
// Model dosyası ilk kullanımda indirilip tarayıcının kalıcı depolamasına (OPFS) yazılır; sonraki açılışlarda ağ gerekmez.
import { TtsSession } from './vendor/piper/piper-tts-web.js';

const sessions = new Map();
let currentId = 0;

function session(voiceId) {
  let s = sessions.get(voiceId);
  if (!s) {
    s = new TtsSession({
      voiceId,
      progress: (p) => { try { self.postMessage({ id: currentId, progress: { loaded: p?.loaded, total: p?.total } }); } catch {} }
    });
    sessions.set(voiceId, s);
    s.waitReady.catch(() => { if (sessions.get(voiceId) === s) sessions.delete(voiceId); }); // başarısız yükleme bir sonraki denemeyi engellemesin
  }
  return s;
}

self.onmessage = async (e) => {
  const { id, text, voiceId, preload } = e.data;
  currentId = id;
  try {
    const s = session(voiceId);
    await s.waitReady;
    if (preload) { self.postMessage({ id, ready: true }); return; }
    const blob = await s.predict(text);
    self.postMessage({ id, blob });
  } catch (err) {
    sessions.delete(voiceId);
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
