// Ses stüdyosu penceresi: Ayarlar'dan, üst çubuktan ve podcast'ten açılır. Değişiklikler anında kaydedilir (Kaydet düğmesi gerekmez).
import { modal } from './ui.js';
import { loadTTS, saveTTS } from './tts.js';
import { voiceLibrary } from './voice-library.js';

export async function openVoiceStudio({ onClose } = {}) {
  const cfg = await loadTTS();
  let timer = 0;
  const flush = async () => {
    clearTimeout(timer);
    const cur = await loadTTS(); // başka yerde değişen ayarları ezme: yalnız stüdyonun alanları yazılır
    await saveTTS({ ...cur, cast: cfg.cast, narratorVoice: cfg.narratorVoice, serverF: cfg.serverF, serverM: cfg.serverM, serverModel: cfg.serverModel });
  };
  const onChange = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
  const lib = voiceLibrary({ cfg, onChange });
  const close = modal({ title: 'Ses stüdyosu', wide: true, body: lib.el, onClose: async () => { lib.stop(); await flush(); onClose?.(); } });
  lib.refresh();
  return close;
}
