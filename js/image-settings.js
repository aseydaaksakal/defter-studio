// Ayarlar › Görseller: yapay zeka görseli sağlayıcısı, stil, sınır ve deneme. Anahtarlar Seslendirme bölümündeki
// Gemini/MiniMax anahtarlarıdır (ayrıca girmeye gerek yok); lokal görsel için sunucuda ComfyUI + FLUX.1-schnell çalışmalıdır.
import { h, toast } from './ui.js';
import { loadImgCfg, saveImgCfg, availableProviders, PROVIDER_NAME, STYLES, generateImage, preload, imageSrc } from './imagegen.js';
import { serverUrl, serverInfo } from './server.js';

export async function imageSettings() {
  const cfg = await loadImgCfg();
  const save = () => saveImgCfg(cfg);
  const field = (label, ...el) => h('div', { class: 'field' }, h('label', {}, label), ...el);
  const sel = (key, options) => {
    const e = h('select', { class: 'input' }, options.map(([v, t]) => h('option', { value: v, selected: v === cfg[key] ? true : null }, t)));
    e.onchange = () => { cfg[key] = e.value; save(); };
    return e;
  };
  const status = h('p', { class: 'muted small', role: 'status' }, 'Sağlayıcılar denetleniyor…');
  const refresh = async () => {
    await serverUrl(true);
    const av = await availableProviders();
    const img = serverInfo()?.image;
    const parts = av.length ? [`Hazır: ${av.map((p) => PROVIDER_NAME[p]).join(', ')}`] : ['Hazır sağlayıcı yok: Seslendirme bölümüne Gemini ya da MiniMax anahtarı girin ya da lokal sunucuda ComfyUI çalıştırın.'];
    if (img && !img.ok && img.neden) parts.push('Lokal: ' + img.neden);
    status.textContent = parts.join(' · ');
  };
  refresh();
  const preview = h('div', { class: 'row gap wrap' });
  const test = h('button', { class: 'btn ghost small', type: 'button' }, 'Deneme görseli üret');
  test.onclick = async () => {
    test.disabled = true; preview.replaceChildren(h('span', { class: 'muted small' }, 'Üretiliyor…'));
    try {
      const r = await generateImage('a friendly lighthouse on a rocky coast at sunrise, calm sea', { aspect: '16:9', force: true });
      await preload([r.key]);
      preview.replaceChildren(h('img', { src: imageSrc(r.key), alt: 'Deneme görseli', style: { maxWidth: '320px', borderRadius: '10px' } }), h('span', { class: 'muted small' }, `${PROVIDER_NAME[r.provider] || r.provider}`));
    } catch (e) { preview.replaceChildren(h('span', { class: 'err small' }, e.message)); toast('Görsel üretilemedi: ' + e.message, 'error', 7000); }
    finally { test.disabled = false; refresh(); }
  };
  const max = h('input', { class: 'input', type: 'number', min: 1, max: 60, value: cfg.max, 'aria-label': 'En çok görsel' });
  max.onchange = () => { cfg.max = Math.max(1, Math.min(60, +max.value || 12)); save(); };
  const auto = h('input', { type: 'checkbox', checked: cfg.auto !== false ? true : null });
  auto.onchange = () => { cfg.auto = auto.checked; save(); };
  const model = h('input', { class: 'input', value: cfg.geminiModel || '', placeholder: 'gemini-3.1-flash-lite-image' });
  model.onchange = () => { cfg.geminiModel = model.value.trim(); save(); };

  const el = h('details', { class: 'vsec' },
    h('summary', {}, 'Görseller (slayt, infografik, video)'),
    h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Slayt, infografik ve video sahnelerine kaynakla ilgili yapay zeka görseli eklenir. Görselde yazı olmaz; metni uygulama basar. Her görsel bir kez üretilir ve tarayıcıda saklanır.'),
      status,
      h('div', { class: 'grid2' },
        field('Sağlayıcı', sel('provider', [['auto', 'Otomatik (Gemini → MiniMax → lokal)'], ['gemini', 'Gemini'], ['minimax', 'MiniMax'], ['server', 'Lokal (ComfyUI + FLUX.1-schnell)'], ['off', 'Kapalı']])),
        field('Stil', sel('style', [['auto', 'Temaya göre'], ...Object.entries(STYLES).map(([v, x]) => [v, x[0]])])),
        field('Bir sunuda en çok görsel', max),
        field('Gemini görsel modeli', model)),
      h('label', { class: 'row gap small' }, auto, 'Üretim sırasında görselleri de otomatik oluştur'),
      h('div', { class: 'row gap wrap' }, test), preview));
  return { el };
}
