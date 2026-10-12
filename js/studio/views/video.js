// Videolu Özet: sahneler tuvale (canvas) canlı çizilir; tüm anlatım tek ses dosyası olarak üretilir (varsayılan erkek anlatıcı),
// sahneler anlatımın zamanlamasına göre ilerler; MP4/WebM olarak sesli dışa aktarılır.
import { h, icon, toast, download, slug, fmtTime } from '../../ui.js';
import { speakBrowser, synthesize, resolveEngine, loadTTS, ENGINE_SHORT, hasBrowserVoice } from '../../tts.js';

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
  // simge
  const iconSize = (portrait ? 170 : 150) * u * (1 + 0.04 * Math.sin(t * Math.PI * 2));
  ctx.font = `${iconSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textBaseline = 'middle';
  const ix = portrait ? W / 2 - iconSize * 0.75 : W - pad - iconSize * 1.6;
  const iy = portrait ? y + iconSize * 1.05 + 10 * u : H * 0.5;
  ctx.globalAlpha = ease((t - 0.05) / 0.2);
  ctx.fillStyle = T.soft; ctx.beginPath(); ctx.arc(ix + iconSize * 0.75, iy, iconSize * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T.ink; ctx.textAlign = 'center'; ctx.fillText(sc.icon || '•', ix + iconSize * 0.75, iy); ctx.textAlign = 'left';
  ctx.globalAlpha = 1; ctx.textBaseline = 'top';
  // sayı
  let by = portrait ? iy + iconSize * 1.15 : y + 30 * u;
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
  // altyazı
  if (caption) {
    ctx.font = `600 ${(portrait ? 30 : 26) * u}px system-ui, sans-serif`;
    const lines = wrap(ctx, caption, W - pad * 2).slice(-2);
    const ch = lines.length * 38 * u + 24 * u, cy = H - ch - 40 * u;
    ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.beginPath(); ctx.roundRect(pad - 12 * u, cy, W - pad * 2 + 24 * u, ch, 12 * u); ctx.fill();
    ctx.fillStyle = '#fff'; lines.forEach((l, i) => ctx.fillText(l, pad, cy + 12 * u + i * 38 * u));
  }
  // ilerleme
  ctx.fillStyle = T.accent; ctx.fillRect(0, H - 6 * u, W * ((k + t) / n), 6 * u);
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
  let audio = null, timings = null;                 // tek parça anlatım hazır olunca
  const pieces = []; let pAudio = null, pPos = 0, pWait = false, streaming = false; // hazırlanırken sahne sahne
  let clock0 = 0, clockOff = 0, live = false;       // sessiz önizleme / tarayıcı sesi
  let recording = null;
  const status = h('span', { class: 'muted small', role: 'status' }, 'Anlatım hazırlanıyor…');
  const time = h('span', { class: 'time' });
  const bar = h('input', { type: 'range', min: 0, max: Math.max(0, scenes.length - 1), value: 0, class: 'seek', 'aria-label': 'Sahne' });
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Oynat' }, icon('play', 26));
  const setIcon = () => playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
  const sceneStart = (i) => (timings ? timings[i]?.start ?? 0 : estStart[i]);

  function frame() {
    let frac = 1, t = 0, total = estTotal;
    if (audio && timings) {
      t = audio.currentTime; total = audio.duration || total;
      k = Math.max(0, timings.findLastIndex((x) => t >= x.start - 0.05));
      const end = timings[k + 1]?.start ?? total;
      frac = (t - timings[k].start) / Math.max(0.5, end - timings[k].start);
      if (!playing && t === 0) frac = 1;
    } else if (streaming && pAudio && pieces[pPos]) {
      k = pieces[pPos].idx[0];
      frac = pAudio.duration ? pAudio.currentTime / pAudio.duration : 0;
      t = estStart[k] + frac * est[k];
    } else if (playing) {
      t = clockOff + (performance.now() - clock0) / 1000;
      if (t >= estTotal) { playing = false; t = estTotal; setIcon(); }
      k = Math.max(0, estStart.findLastIndex((s) => t >= s));
      frac = (t - estStart[k]) / est[k];
    } else { t = clockOff; }
    frac = Math.max(0, Math.min(1, frac));
    const sents = sentences(scenes[k]?.narration);
    const cap = sents[Math.min(sents.length - 1, Math.floor(frac * sents.length))] || '';
    drawScene(ctx, W, H, scenes[k], k, frac, scenes.length, v.theme, v.title, cap);
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
      timings = r.timings;
      audio = new Audio(URL.createObjectURL(r.blob));
      audio.onended = () => { playing = false; setIcon(); recording?.stop(); };
      await new Promise((ok) => { audio.onloadedmetadata = ok; audio.onerror = ok; });
      status.textContent = `${ENGINE_SHORT[r.engine]} · ${narrator.gender === 'm' ? 'erkek' : 'kadın'} anlatıcı hazır`;
      dlBtn.disabled = false;
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

  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Sahneleri düzenle');
  editBtn.onclick = () => api.editJSON();

  root.append(h('div', { class: 'video-view' },
    h('div', { class: 'video-frame' + (portrait ? ' portrait' : '') }, canvas),
    h('div', { class: 'player card' },
      bar,
      h('div', { class: 'player-row' }, time, h('span', { class: 'grow' }), status),
      h('div', { class: 'player-ctrl' },
        h('button', { class: 'icon-btn', 'aria-label': 'Önceki sahne', onclick: () => jump(k - 1) }, icon('back')),
        playBtn,
        h('button', { class: 'icon-btn', 'aria-label': 'Sonraki sahne', onclick: () => jump(k + 1) }, icon('next')),
        h('span', { class: 'chip ghosty' }, scenes.length + ' sahne'), h('span', { class: 'grow' }), dlBtn, editBtn))));
  document.fonts?.ready.then(() => !playing && frame()); frame();
  prepare();
  return () => { disposed = true; playing = false; window.speechSynthesis?.cancel(); pAudio?.pause(); audio?.pause(); cancelAnimationFrame(raf); recording?.stop(); };
}

export function toText(art) { return (art.content.scenes || []).map((s, i) => `## Sahne ${i + 1}: ${s.title}\n${s.narration}`).join('\n\n'); }
