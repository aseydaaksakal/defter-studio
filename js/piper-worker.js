// Piper seslendirmesi arka plan iş parçacığında: arayüz donmaz
import { predict } from './vendor/piper/piper-tts-web.js';
self.onmessage = async (e) => {
  const { id, text, voiceId } = e.data;
  try {
    const blob = await predict({ text, voiceId }, (p) => { try { self.postMessage({ id, progress: { loaded: p?.loaded, total: p?.total } }); } catch {} });
    self.postMessage({ id, blob });
  } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
};
