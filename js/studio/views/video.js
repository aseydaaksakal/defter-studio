// Videolu Özet: sahneler tuvale (canvas) canlı çizilir, seslendirme ile eşlenir; WebM olarak dışa aktarılabilir.
import { h, icon, toast, download, slug, fmtTime } from '../../ui.js';
import { speakBrowser, synthOne, resolveEngine } from '../../tts.js';

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

const NARRATOR = { id: 'A', name: 'Anlatıcı', gender: 'f', role: 'anlatıcı' };

// Seslendirmeyi altyazı parçalarına böl (cümle cümle)
const sentences = (s) => (String(s || '').match(/[^.!?…]+[.!?…]*/g) || [s || '']).map((x) => x.trim()).filter(Boolean);

export function render(root, art, api) {
  const v = art.content;
  const scenes = v.scenes || [];
  const portrait = v.format === 'short';
  const W = portrait ? 720 : 1280, H = portrait ? 1280 : 720;
  const canvas = h('canvas', { width: W, height: H, class: 'video-canvas' + (portrait ? ' portrait' : '') });
  const ctx = canvas.getContext('2d');
  let durs = scenes.map((s) => Math.max(4, (s.narration || '').length / 14));
  let k = 0, start = 0, playing = false, raf = 0, audio = null, useServer = false, recording = null, elapsedBefore = 0;
  const time = h('span', { class: 'time' });
  const bar = h('input', { type: 'range', min: 0, max: scenes.length - 1, value: 0, class: 'seek', 'aria-label': 'Sahne' });
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Oynat' }, icon('play', 26));
  const total = () => durs.reduce((a, b) => a + b, 0);

  function frame() {
    const dt = playing ? (performance.now() - start) / 1000 : elapsedBefore;
    const t = playing || elapsedBefore ? Math.min(1, dt / durs[k]) : 1; // duraklatılmışken sahnenin tamamını göster
    const sents = sentences(scenes[k]?.narration);
    const cap = sents[Math.min(sents.length - 1, Math.floor(t * sents.length))] || '';
    drawScene(ctx, W, H, scenes[k], k, t, scenes.length, v.theme, v.title, cap);
    const before = durs.slice(0, k).reduce((a, b) => a + b, 0);
    time.textContent = `${fmtTime(before + Math.min(dt, durs[k]))} / ${fmtTime(total())}`;
    bar.value = k;
    if (playing) raf = requestAnimationFrame(frame);
  }
  function stopAudio() { speechSynthesis.cancel(); if (audio) { audio.onended = null; audio.pause(); audio = null; } }
  async function playScene() {
    stopAudio();
    if (k >= scenes.length) { playing = false; k = scenes.length - 1; ui(); recording?.stop(); return; }
    const sc = scenes[k];
    let ended = false;
    const next = () => { if (ended || !playing) return; ended = true; k++; if (k >= scenes.length) { playing = false; k = scenes.length - 1; elapsedBefore = durs[k]; ui(); frame(); recording?.stop(); return; } playScene(); };
    if (useServer) {
      try {
        const blob = await synthOne(art.id, 'scene' + k, sc.narration, NARRATOR, v.lang, 'narration');
        if (blob) {
          audio = new Audio(URL.createObjectURL(blob));
          await new Promise((r) => { audio.onloadedmetadata = r; audio.onerror = r; });
          if (isFinite(audio.duration)) durs[k] = audio.duration + 0.4;
          if (recording?.dest) { const src = recording.ac.createMediaElementSource(audio); src.connect(recording.dest); src.connect(recording.ac.destination); }
          audio.onended = () => setTimeout(next, 400);
          start = performance.now(); audio.play(); cancelAnimationFrame(raf); frame();
          return;
        }
      } catch (e) { toast(e.message, 'error'); useServer = false; }
    }
    start = performance.now(); cancelAnimationFrame(raf); frame();
    if (recording) setTimeout(next, durs[k] * 1000); // kayıtta tarayıcı sesi yakalanamaz → sabit süre
    else speakBrowser(sc.narration, { lang: v.lang, gender: 'f', onend: next });
  }
  function ui() { playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26)); }
  playBtn.onclick = () => {
    if (playing) { playing = false; elapsedBefore = (performance.now() - start) / 1000; stopAudio(); cancelAnimationFrame(raf); ui(); frame(); }
    else { playing = true; ui(); playScene(); }
  };
  bar.oninput = () => { k = +bar.value; elapsedBefore = 0; if (playing) playScene(); else frame(); };

  const recBtn = h('button', { class: 'btn ghost small' }, icon('download', 16), ' Video indir (WebM)');
  recBtn.onclick = async () => {
    if (recording) return;
    const stream = canvas.captureStream(30);
    const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
    if (useServer) dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => { download(slug(art.title) + '.webm', new Blob(parts, { type: 'video/webm' })); recording = null; ac.close(); recBtn.disabled = false; toast('Video hazır'); };
    recording = { stop: () => rec.state !== 'inactive' && rec.stop(), ac, dest: useServer ? dest : null };
    if (!useServer) toast('Doğal ses motoru seçili değil: video altyazılı ama sessiz kaydedilecek (Ayarlar › Seslendirme).', 'info', 6000);
    recBtn.disabled = true; rec.start(500);
    k = 0; elapsedBefore = 0; playing = true; ui(); playScene();
  };
  resolveEngine().then((e) => { useServer = e !== 'browser'; });

  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Sahneleri düzenle');
  editBtn.onclick = () => api.editJSON();

  root.append(h('div', { class: 'video-view' },
    h('div', { class: 'video-frame' + (portrait ? ' portrait' : '') }, canvas),
    h('div', { class: 'player card' },
      bar,
      h('div', { class: 'player-ctrl' },
        h('button', { class: 'icon-btn', 'aria-label': 'Önceki sahne', onclick: () => { k = Math.max(0, k - 1); elapsedBefore = 0; playing ? playScene() : frame(); } }, icon('back')),
        playBtn,
        h('button', { class: 'icon-btn', 'aria-label': 'Sonraki sahne', onclick: () => { k = Math.min(scenes.length - 1, k + 1); elapsedBefore = 0; playing ? playScene() : frame(); } }, icon('next')),
        time, h('span', { class: 'grow' }), recBtn, editBtn))));
  document.fonts?.ready.then(frame); frame();
  return () => { playing = false; stopAudio(); cancelAnimationFrame(raf); recording?.stop(); };
}

export function toText(art) { return (art.content.scenes || []).map((s, i) => `## Sahne ${i + 1}: ${s.title}\n${s.narration}`).join('\n\n'); }
