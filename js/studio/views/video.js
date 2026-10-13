// Videolu Özet: sahneler tuvale (canvas) canlı çizilir; tüm anlatım tek ses dosyası olarak üretilir (varsayılan erkek anlatıcı),
// sahneler anlatımın zamanlamasına göre ilerler; MP4/WebM olarak sesli dışa aktarılır.
import { h, icon, toast, download, slug, fmtTime, promptBox } from '../../ui.js';
import { imageSrc, preload } from '../../imagegen.js';
import { illustrate, illustrateOne, imagesAvailable } from '../illustrate.js';
import { speakBrowser, synthesize, resolveEngine, loadTTS, ENGINE_SHORT, hasBrowserVoice } from '../../tts.js';
import { serverUrl, serverInfo } from '../../server.js';

const THEMES = {
  sketch: { bg: '#fbfaf6', grid: '#e9e6dc', ink: '#1d1d1f', accent: '#f2c94c', soft: '#dbe9f6', font: '"Patrick Hand", "Comic Sans MS", system-ui' },
  ocean: { bg: '#0b3a5b', grid: '#0f4a73', ink: '#ffffff', accent: '#4fd1c5', soft: '#164e78', font: 'system-ui, sans-serif' },
  night: { bg: '#11131a', grid: '#1b1f2a', ink: '#f3f4f6', accent: '#8ab4ff', soft: '#1f2533', font: 'system-ui, sans-serif' },
  paper: { bg: '#f4efe6', grid: '#e8e0d0', ink: '#2b2622', accent: '#c2410c', soft: '#ebe2d2', font: 'Georgia, serif' }
};

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
// Sahne görseli (yapay zeka): önceden yüklenmiş blob adresinden HTMLImageElement; hazır değilse null (görselsiz çizilir)
const imgEls = new Map();
function sceneImage(sc) {
  const src = sc?.imgKey ? imageSrc(sc.imgKey) : null; if (!src) return null;
  let el = imgEls.get(src); if (!el) { el = new Image(); el.src = src; imgEls.set(src, el); }
  return el.complete && el.naturalWidth ? el : null;
}
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export function drawScene(ctx, W, H, sc, k, t, n, theme, deckTitle, caption) {
  const T = THEMES[theme] || THEMES.sketch;
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const portrait = H > W, pad = W * 0.07, u = Math.min(W, H) / 720;
  // dekor
  ctx.fillStyle = T.accent; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.roundRect(pad, pad * 0.6, W * 0.18, 10 * u, 5 * u); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = T.ink; ctx.textBaseline = 'top';
  ctx.font = `500 ${18 * u}px ${T.font}`; ctx.globalAlpha = 0.6;
  ctx.fillText(`${deckTitle}  ·  ${k + 1}/${n}`, pad, pad * 0.6 + 22 * u); ctx.globalAlpha = 1;
  // başlık
  const a1 = ease(t / 0.12);
  ctx.globalAlpha = a1;
  ctx.font = `700 ${(portrait ? 54 : 50) * u}px ${T.font}`;
  let y = pad * 0.6 + 70 * u + (1 - a1) * 20;
  for (const l of wrap(ctx, sc.title, W - pad * 2)) { ctx.fillText(l, pad, y); y += (portrait ? 62 : 58) * u; }
  ctx.globalAlpha = 1;
  // yapay zeka görseli: simgenin yerine yuvarlak köşeli panel, yavaş yakınlaşma (Ken Burns)
  const pic = sceneImage(sc); let picBy = 0;
  if (pic) {
    const pw = portrait ? W - pad * 2 : W * 0.34, ph = portrait ? Math.min(H * 0.26, pw * 0.62) : H * 0.54;
    const px = portrait ? pad : W - pad - pw, py = portrait ? y + 10 * u : H * 0.2;
    const z = Math.max(pw / pic.naturalWidth, ph / pic.naturalHeight) * (1 + 0.08 * t), dw = pic.naturalWidth * z, dh = pic.naturalHeight * z;
    ctx.save(); ctx.globalAlpha = ease((t - 0.02) / 0.15); ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22 * u); ctx.clip();
    ctx.drawImage(pic, px + (pw - dw) / 2 + (0.5 - t) * pw * 0.03, py + (ph - dh) / 2, dw, dh); ctx.restore();
    ctx.strokeStyle = T.accent; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22 * u); ctx.stroke();
    picBy = portrait ? py + ph + 26 * u : y + 30 * u;
  }
  // simge
  const iconSize = (portrait ? 170 : 150) * u * (1 + 0.04 * Math.sin(t * Math.PI * 2));
  ctx.font = `${iconSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textBaseline = 'middle';
  const ix = portrait ? W / 2 - iconSize * 0.75 : W - pad - iconSize * 1.6;
  const iy = portrait ? y + iconSize * 1.05 + 10 * u : H * 0.5;
  if (!pic) {
    ctx.globalAlpha = ease((t - 0.05) / 0.2);
    ctx.fillStyle = T.soft; ctx.beginPath(); ctx.arc(ix + iconSize * 0.75, iy, iconSize * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = T.ink; ctx.textAlign = 'center'; ctx.fillText(sc.icon || '•', ix + iconSize * 0.75, iy); ctx.textAlign = 'left';
  }
  ctx.globalAlpha = 1; ctx.textBaseline = 'top';
  // sayı
  let by = pic ? picBy : portrait ? iy + iconSize * 1.15 : y + 30 * u;
  if (sc.stat?.value) {
    const a = ease((t - 0.15) / 0.15); ctx.globalAlpha = a;
    ctx.fillStyle = T.accent; ctx.font = `800 ${72 * u}px ${T.font}`; ctx.fillText(sc.stat.value, pad, by);
    ctx.fillStyle = T.ink; ctx.font = `500 ${24 * u}px ${T.font}`; ctx.fillText(sc.stat.label || '', pad, by + 82 * u);
    ctx.globalAlpha = 1; by += 130 * u;
  }
  // maddeler (sırayla belirir)
  const bw = portrait ? W - pad * 2 : W * 0.55;
  (sc.bullets || []).slice(0, 4).forEach((b, i) => {
    const a = ease((t - 0.2 - i * 0.15) / 0.12); if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(pad + 10 * u, by + 17 * u, 7 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = T.ink; ctx.font = `500 ${(portrait ? 32 : 28) * u}px ${T.font}`;
    for (const l of wrap(ctx, b, bw - 40 * u)) { ctx.fillText(l, pad + 32 * u + (1 - a) * 30, by); by += (portrait ? 40 : 36) * u; }
    by += 14 * u; ctx.globalAlpha = 1;
  });
  // altyazı: metin = cümle düzeyi; nesne {words:[{t, state}]} = kelime düzeyi (okunan kelime vurgulanır)
  if (caption) drawCaption(ctx, W, H, caption, u, pad, portrait, T);
  // ilerleme
  ctx.fillStyle = T.accent; ctx.fillRect(0, H - 6 * u, W * ((k + t) / n), 6 * u);
}

// Altyazı çizimi. Kelime düzeyinde: okunmuş kelimeler beyaz, şu an okunan kelime vurgulu kutuda, gelecekler soluk.
function drawCaption(ctx, W, H, caption, u, pad, portrait, T) {
  const fs = (portrait ? 30 : 26) * u, lh = 38 * u, maxW = W - pad * 2;
  ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.textBaseline = 'top';
  if (typeof caption === 'string') {
    const lines = wrap(ctx, caption, maxW).slice(-2);
    const ch = lines.length * lh + 24 * u, cy = H - ch - 40 * u;
    ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.beginPath(); ctx.roundRect(pad - 12 * u, cy, maxW + 24 * u, ch, 12 * u); ctx.fill();
    ctx.fillStyle = '#fff'; lines.forEach((l, i) => ctx.fillText(l, pad, cy + 12 * u + i * lh));
    return;
  }
  const sp = ctx.measureText(' ').width;
  const lines = []; let cur = [], w = 0;
  for (const wd of caption.words) {
    const ww = ctx.measureText(wd.t).width;
    if (cur.length && w + sp + ww > maxW) { lines.push(cur); cur = []; w = 0; }
    cur.push({ ...wd, ww }); w += (cur.length > 1 ? sp : 0) + ww;
  }
  if (cur.length) lines.push(cur);
  const li = Math.max(0, lines.findIndex((l) => l.some((x) => x.state === 'now')));
  const first = Math.max(0, Math.min(li - (li > 0 ? 1 : 0), lines.length - 2));
  const shown = lines.slice(first, first + 2);
  const ch = shown.length * lh + 24 * u, cy = H - ch - 40 * u;
  ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.beginPath(); ctx.roundRect(pad - 12 * u, cy, maxW + 24 * u, ch, 12 * u); ctx.fill();
  shown.forEach((ln, i) => {
    let x = pad; const y = cy + 12 * u + i * lh;
    for (const wd of ln) {
      if (wd.state === 'now') { ctx.fillStyle = T.accent; ctx.beginPath(); ctx.roundRect(x - 5 * u, y - 3 * u, wd.ww + 10 * u, lh - 4 * u, 8 * u); ctx.fill(); ctx.fillStyle = '#111'; }
      else ctx.fillStyle = wd.state === 'past' ? '#fff' : 'rgba(255,255,255,.55)';
      ctx.fillText(wd.t, x, y); x += wd.ww + sp;
    }
  });
}

// Kelime zamanlaması: anlatım sahne başına tek parça; sahne içi kelime süreleri harf sayısı + noktalama duraklamasıyla paylaştırılır.
// (Sentezden gerçek kelime zamanı gelmez; yaklaşık ama okumayı izlemek için yeterince yakındır.)
export function wordPlan(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const wt = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1 + (/[.!?…]$/.test(w) ? 5 : /[,;:]$/.test(w) ? 2.5 : 0));
  const sum = wt.reduce((a, b) => a + b, 0) || 1; let acc = 0, si = 0;
  return words.map((t, i) => { const f0 = acc / sum; acc += wt[i]; const o = { t, f0, f1: acc / sum, sent: si }; if (/[.!?…]$/.test(t)) si++; return o; });
}
export function wordCaption(plan, frac) {
  if (!plan.length) return '';
  let idx = 0; for (let i = 0; i < plan.length; i++) if (plan[i].f0 <= frac) idx = i;
  return { words: plan.filter((w) => w.sent === plan[idx].sent).map((w) => ({ t: w.t, state: w.f1 <= frac ? 'past' : w.f0 <= frac ? 'now' : 'next' })) };
}
export const TRANSITION_SEC = 0.6;
const ease2 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
let offCv = null;
// Sahneler arası geçiş: önceki sahne yerinde kalır, yeni sahne hafif sağdan kayarak üzerine solar. local = sahnenin başından beri geçen saniye.
export function drawFrame(ctx, W, H, scenes, k, frac, local, theme, title, caption) {
  const n = scenes.length;
  if (k > 0 && local < TRANSITION_SEC) {
    const a = ease2(local / TRANSITION_SEC);
    drawScene(ctx, W, H, scenes[k - 1], k - 1, 1, n, theme, title, '');
    if (!offCv || offCv.width !== W || offCv.height !== H) { offCv = document.createElement('canvas'); offCv.width = W; offCv.height = H; }
    drawScene(offCv.getContext('2d'), W, H, scenes[k], k, frac, n, theme, title, caption);
    ctx.save(); ctx.globalAlpha = a; ctx.drawImage(offCv, (1 - a) * W * 0.06, 0); ctx.restore();
  } else drawScene(ctx, W, H, scenes[k], k, frac, n, theme, title, caption);
}

// Seslendirmeyi altyazı parçalarına böl (cümle cümle)
const sentences = (s) => (String(s || '').match(/[^.!?…]+[.!?…]*/g) || [s || '']).map((x) => x.trim()).filter(Boolean);
const recType = () => ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || 'video/webm';

export function render(root, art, api) {
  const v = art.content;
  const scenes = v.scenes || [];
  const portrait = v.format === 'short';
  const W = portrait ? 720 : 1280, H = portrait ? 1280 : 720;
  const canvas = h('canvas', { width: W, height: H, class: 'video-canvas' + (portrait ? ' portrait' : '') });
  const ctx = canvas.getContext('2d');
  const est = scenes.map((s) => Math.max(4, (s.narration || '').length / 14)); // anlatım yokken tahmini sahne süresi (sn)
  const estStart = est.map((_, i) => est.slice(0, i).reduce((a, b) => a + b, 0));
  const estTotal = est.reduce((a, b) => a + b, 0);
  let disposed = false, playing = false, raf = 0, k = 0;
  let audio = null, timings = null, audioBlob = null; // tek parça anlatım hazır olunca
  const pieces = []; let pAudio = null, pPos = 0, pWait = false, streaming = false; // hazırlanırken sahne sahne
  let clock0 = 0, clockOff = 0, live = false;       // sessiz önizleme / tarayıcı sesi
  let recording = null;
  const status = h('span', { class: 'muted small', role: 'status' }, 'Anlatım hazırlanıyor…');
  const time = h('span', { class: 'time' });
  const bar = h('input', { type: 'range', min: 0, max: Math.max(0, scenes.length - 1), value: 0, class: 'seek', 'aria-label': 'Sahne' });
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Oynat' }, icon('play', 26));
  const setIcon = () => playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
  const sceneStart = (i) => (timings ? timings[i]?.start ?? 0 : estStart[i]);

  // Altyazı kipi: kelime (okunan kelime vurgulanır) · cümle · kapalı. Tercih bu tarayıcıda saklanır.
  const CAP_MODES = [['word', 'Altyazı: kelime'], ['sentence', 'Altyazı: cümle'], ['off', 'Altyazı: kapalı']];
  let capMode = 'word'; try { capMode = localStorage.getItem('defter.capMode') || 'word'; } catch {}
  const plans = scenes.map((s) => wordPlan(s.narration));
  const captionFor = (k, frac) => {
    if (capMode === 'off') return '';
    if (capMode === 'word') return wordCaption(plans[k] || [], frac);
    const sents = sentences(scenes[k]?.narration);
    return sents[Math.min(sents.length - 1, Math.floor(frac * sents.length))] || '';
  };

  function frame() {
    let frac = 1, t = 0, total = estTotal, local = 99;
    if (audio && timings) {
      t = audio.currentTime; total = audio.duration || total;
      k = Math.max(0, timings.findLastIndex((x) => t >= x.start - 0.05));
      const end = timings[k + 1]?.start ?? total;
      frac = (t - timings[k].start) / Math.max(0.5, end - timings[k].start);
      local = t - timings[k].start;
      if (!playing && t === 0) { frac = 1; local = 99; }
    } else if (streaming && pAudio && pieces[pPos]) {
      k = pieces[pPos].idx[0];
      frac = pAudio.duration ? pAudio.currentTime / pAudio.duration : 0;
      t = estStart[k] + frac * est[k]; local = pAudio.currentTime;
    } else if (playing) {
      t = clockOff + (performance.now() - clock0) / 1000;
      if (t >= estTotal) { playing = false; t = estTotal; setIcon(); }
      k = Math.max(0, estStart.findLastIndex((s) => t >= s));
      frac = (t - estStart[k]) / est[k]; local = t - estStart[k];
    } else { t = clockOff; }
    frac = Math.max(0, Math.min(1, frac));
    drawFrame(ctx, W, H, scenes, k, frac, local, v.theme, v.title, captionFor(k, frac));
    time.textContent = `${fmtTime(t)} / ${fmtTime(total)}`;
    bar.value = k;
    if (playing || (audio && !audio.paused)) raf = requestAnimationFrame(frame);
  }
  const loop = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };

  // ---- hazırlanırken sahne sahne çalma ----
  function playPiece() {
    if (!playing || disposed) return;
    const p = pieces[pPos];
    if (!p) { pWait = true; status.textContent = 'Sıradaki sahnenin anlatımı hazırlanıyor…'; return; }
    pWait = false; pAudio?.pause();
    pAudio = new Audio(p.url || (p.url = URL.createObjectURL(p.blob)));
    pAudio.onended = () => { pPos++; if (pPos >= scenes.length) { playing = false; setIcon(); } else setTimeout(playPiece, 350); };
    pAudio.play().catch(() => {}); loop();
  }
  // ---- tarayıcı sesiyle (yalnız Türkçe tarayıcı sesi varsa) ----
  function playLive() {
    if (!playing || disposed) return;
    clock0 = performance.now(); clockOff = estStart[k]; loop();
    speakBrowser(scenes[k].narration, { lang: v.lang, gender: narrator.gender, onend: () => { if (!playing) return; if (k + 1 >= scenes.length) { playing = false; setIcon(); return; } k++; playLive(); } });
  }
  function jump(i) {
    k = Math.max(0, Math.min(scenes.length - 1, i));
    if (audio) { audio.currentTime = sceneStart(k); if (!playing) frame(); return; }
    if (streaming) { const n = pieces.findIndex((p) => p.idx.includes(k)); if (n >= 0) { pPos = n; if (playing) playPiece(); } }
    if (live) { window.speechSynthesis?.cancel(); if (playing) playLive(); }
    clockOff = estStart[k]; clock0 = performance.now(); frame();
  }
  playBtn.onclick = () => {
    playing = !playing; setIcon();
    if (audio) { playing ? audio.play() : audio.pause(); loop(); return; }
    if (streaming) { if (playing) { if (pAudio && !pAudio.ended && pAudio.currentTime > 0) { pAudio.play(); loop(); } else playPiece(); } else { pAudio?.pause(); pWait = false; } return; }
    if (live) { if (playing) playLive(); else window.speechSynthesis?.cancel(); return; }
    if (playing) { clock0 = performance.now(); loop(); } else { clockOff += (performance.now() - clock0) / 1000; frame(); }
  };
  bar.oninput = () => jump(+bar.value);

  let narrator = { id: 'A', name: 'Anlatıcı', gender: 'm', role: 'anlatıcı' };
  async function prepare() {
    const cfg = await loadTTS();
    // Ayarlar'da kütüphaneden bir anlatıcı sesi seçildiyse (lokal sunucu) o kullanılır; cinsiyet o sesten gelir
    const nv = cfg.narratorVoice;
    narrator = { ...narrator, gender: nv?.gender || (cfg.narrator === 'f' ? 'f' : 'm'), serverVoice: nv?.name || undefined };
    const engine = await resolveEngine(cfg);
    if (engine === 'browser') { live = true; status.textContent = 'Tarayıcı sesiyle anlatım'; return; }
    streaming = true;
    status.textContent = `${ENGINE_SHORT[engine]} ile ${narrator.gender === 'm' ? 'erkek' : 'kadın'} anlatıcı hazırlanıyor…`;
    try {
      const lines = scenes.map((s) => ({ speaker: 'A', text: s.narration || s.title || '' }));
      const r = await synthesize(art.id + ':video', lines, [narrator], v.lang, {
        format: 'narration',
        onPiece: (p) => { if (disposed) return; pieces.push(p); if (pWait) playPiece(); },
        onProgress: (m) => { status.textContent = m + (pieces.length ? ' · ▶ hazır sahneleri oynatır' : ''); }
      });
      if (disposed) return;
      const resumeScene = streaming && playing ? (pieces[pPos]?.idx[0] ?? k) : -1;
      const offset = pAudio && resumeScene >= 0 ? pAudio.currentTime : 0;
      pAudio?.pause(); streaming = false; pieces.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      timings = r.timings; audioBlob = r.blob;
      audio = new Audio(URL.createObjectURL(r.blob));
      audio.onended = () => { playing = false; setIcon(); recording?.stop(); };
      await new Promise((ok) => { audio.onloadedmetadata = ok; audio.onerror = ok; });
      status.textContent = `${ENGINE_SHORT[r.engine]} · ${narrator.gender === 'm' ? 'erkek' : 'kadın'} anlatıcı hazır`;
      dlBtn.disabled = false; syncFast();
      if (resumeScene >= 0) { audio.currentTime = sceneStart(resumeScene) + offset; audio.play().catch(() => {}); loop(); } else frame();
    } catch (e) {
      if (disposed) return;
      streaming = false;
      if (hasBrowserVoice(v.lang)) { live = true; status.textContent = 'Anlatım üretilemedi, tarayıcı sesiyle oynatılıyor'; }
      else status.textContent = 'Anlatım üretilemedi: ' + String(e.message).slice(0, 120) + ' · altyazılı sessiz önizleme';
      toast(e.message, 'error', 8000);
    }
  }

  const dlBtn = h('button', { class: 'btn ghost small', disabled: true, title: 'Anlatım hazır olunca etkinleşir' }, icon('download', 16), ' Videoyu indir');
  dlBtn.onclick = async () => {
    if (recording || !audio) return;
    const type = recType(), ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    const stream = canvas.captureStream(30);
    const rAudio = new Audio(audio.src);
    const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
    const src = ac.createMediaElementSource(rAudio); src.connect(dest); src.connect(ac.destination);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4e6 });
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const main = audio; audio.pause();
    rec.onstop = () => { download(slug(art.title) + '.' + ext, new Blob(parts, { type: type.split(';')[0] })); recording = null; audio = main; ac.close(); dlBtn.disabled = false; playing = false; setIcon(); status.textContent = 'Video indirildi'; };
    recording = { stop: () => rec.state !== 'inactive' && rec.stop() };
    rAudio.onended = () => setTimeout(() => recording?.stop(), 600);
    dlBtn.disabled = true; status.textContent = 'Video kaydediliyor (gerçek zamanlı; bu sekmeyi açık tutun)…';
    audio = rAudio; rec.start(500); playing = true; setIcon(); await rAudio.play(); loop();
  };

  // ---- Hızlı MP4 (lokal sunucuda ffmpeg): kareler gerçek zamanlı beklenmeden çizilir, JPEG olarak sunucuya gönderilir, ffmpeg MP4'e çevirir ----
  const FPS = 24;
  const fastBtn = h('button', { class: 'btn ghost small', hidden: true, title: 'Lokal sunucudaki ffmpeg ile gerçek zamandan çok daha hızlı MP4 üretir' }, icon('download', 16), ' Hızlı MP4');
  const fastReady = async () => { const base = await serverUrl(); return !!(base && serverInfo()?.ffmpeg); };
  async function syncFast() { fastBtn.hidden = !(await fastReady().catch(() => false)); fastBtn.disabled = !audioBlob || !!recording; }
  fastBtn.onclick = async () => {
    if (recording || !audioBlob || !timings) return;
    const base = await serverUrl(); if (!base) return toast('Hızlı MP4 için lokal sunucu gerekir (server\\baslat.bat).', 'error', 6000);
    fastBtn.disabled = dlBtn.disabled = true; playing = false; audio?.pause(); setIcon();
    let id = null;
    try {
      const total = (audio?.duration && isFinite(audio.duration)) ? audio.duration : (timings.at(-1)?.end || estTotal);
      const frames = Math.ceil(total * FPS) + FPS; // sonda 1 sn ek: son kare kesilmesin
      const fd = new FormData(); fd.append('audio', audioBlob, 'anlatim.wav'); fd.append('fps', String(FPS)); fd.append('width', String(W)); fd.append('height', String(H));
      const st = await fetch(base + '/video/start', { method: 'POST', body: fd });
      if (!st.ok) throw new Error((await st.text()).slice(0, 200));
      id = (await st.json()).id;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c2 = cv.getContext('2d');
      let batch = [], t0 = performance.now();
      const toJpeg = () => new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('Kare üretilemedi'))), 'image/jpeg', 0.9));
      for (let i = 0; i < frames; i++) {
        if (disposed) throw new Error('Görünüm kapandı');
        const t = Math.min(i / FPS, total);
        const kk = Math.max(0, timings.findLastIndex((x) => t >= x.start - 0.05));
        const end = timings[kk + 1]?.start ?? total;
        const local = t - timings[kk].start, fr = Math.max(0, Math.min(1, local / Math.max(0.5, end - timings[kk].start)));
        drawFrame(c2, W, H, scenes, kk, fr, local, v.theme, v.title, captionFor(kk, fr));
        batch.push(await toJpeg());
        if (batch.length >= 48 || i === frames - 1) {
          const r = await fetch(base + '/video/frames/' + id, { method: 'POST', body: new Blob(batch) });
          if (!r.ok) throw new Error((await r.text()).slice(0, 200));
          batch = [];
          const sec = (performance.now() - t0) / 1000;
          status.textContent = `Hızlı MP4: %${Math.round(((i + 1) / frames) * 100)} · ${sec.toFixed(0)} sn (video ${fmtTime(total)})`;
        }
      }
      status.textContent = 'ffmpeg MP4 dosyasını tamamlıyor…';
      const fin = await fetch(base + '/video/finish/' + id, { method: 'POST' });
      if (!fin.ok) throw new Error((await fin.text()).slice(0, 300));
      id = null;
      download(slug(art.title) + '.mp4', await fin.blob());
      status.textContent = `MP4 indirildi (${((performance.now() - t0) / 1000).toFixed(0)} sn'de hazırlandı)`;
    } catch (e) {
      if (id) fetch(base + '/video/' + id, { method: 'DELETE' }).catch(() => {});
      toast('Hızlı MP4 olmadı: ' + e.message, 'error', 8000); status.textContent = 'Hızlı MP4 olmadı: ' + String(e.message).slice(0, 100);
    } finally { fastBtn.disabled = dlBtn.disabled = false; frame(); }
  };
  const capBtn = h('button', { class: 'btn ghost small', title: 'Altyazı kipi: kelime düzeyinde vurgu / cümle / kapalı' }, CAP_MODES.find((m) => m[0] === capMode)?.[1] || 'Altyazı');
  capBtn.onclick = () => {
    capMode = CAP_MODES[(CAP_MODES.findIndex((m) => m[0] === capMode) + 1) % CAP_MODES.length][0];
    capBtn.textContent = CAP_MODES.find((m) => m[0] === capMode)[1];
    try { localStorage.setItem('defter.capMode', capMode); } catch {}
    if (!playing) frame();
  };

  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Sahneleri düzenle');
  editBtn.onclick = () => api.editJSON();

  // Yapay zeka görselleri (Ayarlar › Görseller): eksik sahne görsellerini üret / geçerli sahnenin görselini yenile
  const needAvail = async () => { if (await imagesAvailable()) return true; toast('Görsel sağlayıcısı yok: Ayarlar › Görseller (Gemini/MiniMax anahtarı ya da lokal ComfyUI).', 'error', 7000); return false; };
  const imgBtn = h('button', { class: 'btn ghost small', title: 'Sahnelere kaynakla ilgili yapay zeka görselleri ekler' }, icon('infographic', 16), ' Görselleri üret');
  imgBtn.onclick = async () => {
    if (recording || !(await needAvail())) return;
    imgBtn.disabled = true;
    try {
      const r = await illustrate('video', v, { onProgress: (n, m) => { status.textContent = `Görsel ${n}/${m}…`; } });
      if (!r.total) toast(scenes.some((x) => x.imgKey) ? 'Tüm sahnelerin görseli hazır.' : 'Bu videoda görsel tarifi yok; videoyu yeniden üretince eklenir ya da sahne başına "Görseli yenile"yi kullanın.', 'info', 6000);
      else { await api.save({ ...v, scenes }, `${r.made} görsel eklendi`); toast(`${r.made} görsel eklendi${r.failed ? `, ${r.failed} üretilemedi: ${r.errors[0]}` : ''}`, r.failed ? 'error' : 'ok', 6000); }
      status.textContent = ''; if (!playing) frame();
    } catch (e) { toast('Görseller üretilemedi: ' + e.message, 'error', 7000); } finally { imgBtn.disabled = false; }
  };
  const regenBtn = h('button', { class: 'btn ghost small', title: 'Geçerli sahnenin görselini (yeni tarifle) yeniden üretir' }, icon('infographic', 16), ' Görseli yenile');
  regenBtn.onclick = async () => {
    if (recording) return;
    const sc = scenes[k];
    const t = await promptBox('Sahne görseli tarifi (İngilizce, yazısız bir sahne)', sc.visual || ''); if (t == null || !t.trim()) return;
    if (!(await needAvail())) return;
    regenBtn.disabled = true;
    try { sc.visual = t.trim(); sc.imgKey = await illustrateOne(sc.visual, portrait ? '9:16' : '16:9', v.theme); await api.save({ ...v, scenes }, `Sahne ${k + 1} görseli yenilendi`); if (!playing) frame(); }
    catch (e) { toast('Görsel üretilemedi: ' + e.message, 'error', 7000); } finally { regenBtn.disabled = false; }
  };
  preload(scenes.map((x) => x.imgKey)).then(() => { if (!disposed && !playing) frame(); });

  root.append(h('div', { class: 'video-view' },
    h('div', { class: 'video-frame' + (portrait ? ' portrait' : '') }, canvas),
    h('div', { class: 'player card' },
      bar,
      h('div', { class: 'player-row' }, time, h('span', { class: 'grow' }), status),
      h('div', { class: 'player-ctrl' },
        h('button', { class: 'icon-btn', 'aria-label': 'Önceki sahne', onclick: () => jump(k - 1) }, icon('back')),
        playBtn,
        h('button', { class: 'icon-btn', 'aria-label': 'Sonraki sahne', onclick: () => jump(k + 1) }, icon('next')),
        h('span', { class: 'chip ghosty' }, scenes.length + ' sahne'), h('span', { class: 'grow' }), capBtn, imgBtn, regenBtn, fastBtn, dlBtn, editBtn))));
  document.fonts?.ready.then(() => !playing && frame()); frame();
  prepare();
  return () => { disposed = true; playing = false; window.speechSynthesis?.cancel(); pAudio?.pause(); audio?.pause(); cancelAnimationFrame(raf); recording?.stop(); };
}

export function toText(art) { return (art.content.scenes || []).map((s, i) => `## Sahne ${i + 1}: ${s.title}\n${s.narration}`).join('\n\n'); }
