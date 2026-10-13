// Studio çıktılarına (slayt, infografik, video) yapay zeka görseli ekler. İçerikteki `visual` (İngilizce, yazısız sahne tarifi)
// görsel üretim istemidir; üretilen görselin önbellek anahtarı `imgKey` alanına yazılır (heroKey: infografik başlığı).
import { loadImgCfg, imagesAvailable, generateMany, generateImage, styleFor, IMAGE_LAYOUTS, removeImage, preload } from '../imagegen.js';

export const IMAGE_TOOLS = new Set(['slides', 'infographic', 'video']);

const slideLayout = (s, i) => s.layout || (i === 0 ? 'title' : 'bullets');
const themeOf = (c) => c.theme || 'ocean';

// Slaytlarda sınırlı sayıda görsel: kapak + eşit aralıklı seçim (kota ve süre korunur)
function pickSlides(slides, max) {
  const cand = slides.map((s, i) => ({ s, i })).filter(({ s, i }) => s.visual && IMAGE_LAYOUTS.has(slideLayout(s, i)));
  if (cand.length <= max) return cand;
  const out = [cand[0]]; const rest = cand.slice(1); const left = max - 1;
  for (let k = 0; k < left; k++) out.push(rest[Math.floor((k * rest.length) / left)]);
  return out;
}

// İçeriğe görsel gerektiren öğelerin listesi: [{ visual, aspect, set(key) }]
export function plan(type, c, max = 12) {
  const items = [];
  if (type === 'slides') {
    for (const { s, i } of pickSlides(c.slides || [], max)) items.push({ visual: s.visual, aspect: slideLayout(s, i) === 'title' ? '16:9' : '4:3', get: () => s.imgKey, set: (k) => { s.imgKey = k; } });
  } else if (type === 'infographic') {
    if (c.heroVisual) items.push({ visual: c.heroVisual, aspect: c.orientation === 'portrait' ? '4:3' : '16:9', get: () => c.heroKey, set: (k) => { c.heroKey = k; } });
    for (const x of (c.highlights || []).slice(0, 6)) if (x.visual) items.push({ visual: x.visual, aspect: '1:1', get: () => x.imgKey, set: (k) => { x.imgKey = k; } });
  } else if (type === 'video') {
    const asp = c.format === 'short' ? '9:16' : '16:9';
    for (const s of c.scenes || []) if (s.visual) items.push({ visual: s.visual, aspect: asp, get: () => s.imgKey, set: (k) => { s.imgKey = k; } });
  }
  return items;
}

// İçerik nesnesini yerinde günceller. onlyMissing: görseli olanlara dokunma. Sonuç: { made, failed, total, errors }
export async function illustrate(type, content, { signal, onProgress, onlyMissing = true } = {}) {
  const cfg = await loadImgCfg();
  const items = plan(type, content, cfg.max || 12).filter((it) => !(onlyMissing && it.get()));
  if (!items.length) return { made: 0, failed: 0, total: 0, errors: [] };
  const style = styleFor(cfg, themeOf(content));
  const res = await generateMany(items, { signal, style, onProgress });
  let made = 0, failed = 0; const errors = [];
  res.forEach((r, i) => { if (r?.key) { items[i].set(r.key); made++; } else if (r?.error) { failed++; if (!errors.includes(r.error)) errors.push(r.error); } });
  await preload(items.map((it) => it.get()));
  return { made, failed, total: items.length, errors };
}

// Üretim sonrası otomatik adım: görsel kapalıysa ya da sağlayıcı yoksa sessizce atlanır; hata içeriği bozmaz
export async function autoIllustrate(type, content, opts = {}) {
  if (!IMAGE_TOOLS.has(type)) return null;
  const cfg = await loadImgCfg();
  if (cfg.provider === 'off' || cfg.auto === false) return null;
  if (!(await imagesAvailable())) return null;
  try { return await illustrate(type, content, opts); } catch (e) { if (e.name === 'AbortError') throw e; return { made: 0, failed: 1, total: 1, errors: [e.message] }; }
}

// Tek görseli (yeniden) üret: görüntüleyicideki "Yenile" düğmeleri için. Eski önbellek kaydı silinmez (başka yerde kullanılıyor olabilir).
export async function illustrateOne(visual, aspect, theme, { force = true, signal } = {}) {
  const cfg = await loadImgCfg();
  const r = await generateImage(visual, { aspect, style: styleFor(cfg, theme), force, signal });
  await preload([r.key]);
  return r.key;
}
export { removeImage, preload, imagesAvailable };
