// Sesli Özet oynatıcısı: tek parça doğal ses (gerçek ileri/geri sarma), konuşmacılar, döküm vurgusu, hız, WAV indirme.
// Ses dosyası üretilemezse tarayıcı sesiyle satır satır çalar.
import { h, icon, toast, download, slug, fmtTime } from '../../ui.js';
import { synthesize, speakBrowser, resolveEngine, ENGINES, loadTTS, hasNaturalBrowserVoice } from '../../tts.js';
import { castFor } from '../gen.js';

export function speakersOf(c) {
  if (c.speakers?.length) return c.speakers;
  const cast = castFor(c.format || 'deep');
  if (c.hosts) cast.forEach((s) => { if (c.hosts[s.id]) s.name = c.hosts[s.id]; });
  return cast;
}

export function render(root, art, api) {
  const c = art.content;
  const lines = c.lines || [];
  const speakers = speakersOf(c);
  const byId = Object.fromEntries(speakers.map((s) => [s.id, s]));
  let disposed = false, audio = null, timings = null, idx = 0, liveMode = false, livePlaying = false, rate = 1, editing = false, raf = 0;

  const bar = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'seek', 'aria-label': 'Konum' });
  const time = h('span', { class: 'time' }, '00:00 / --:--');
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Oynat', disabled: true }, icon('play', 26));
  const speedBtn = h('button', { class: 'chip', title: 'Oynatma hızı' }, '1,0×');
  const status = h('span', { class: 'muted small' }, 'Ses hazırlanıyor…');
  const list = h('div', { class: 'transcript' });
  const cast = h('div', { class: 'row gap wrap' }, speakers.map((s) => h('span', { class: 'chip spk-' + s.id }, h('b', {}, s.name), ` · ${s.role} · ${s.gender === 'm' ? 'erkek' : 'kadın'} sesi`)));

  lines.forEach((l, i) => list.append(h('div', { class: 'tline spk-' + l.speaker, 'data-i': i, onclick: () => { if (!editing) seekLine(i); } },
    h('div', { class: 'tline-who' }, byId[l.speaker]?.name || l.speaker), h('div', { class: 'tline-text' }, l.text))));

  const fmtRate = () => rate.toLocaleString('tr', { minimumFractionDigits: 1 }) + '×';
  function highlight(i) {
    if (i === idx && list.querySelector('.tline.on')) return;
    idx = i;
    list.querySelectorAll('.tline').forEach((n) => n.classList.toggle('on', +n.dataset.i === i));
    const cur = list.querySelector('.tline.on');
    if (cur && (audio ? !audio.paused : livePlaying)) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function tick() {
    if (audio) {
      const t = audio.currentTime, d = audio.duration || 0;
      bar.value = d ? Math.round((t / d) * 1000) : 0;
      time.textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
      const i = timings ? timings.findIndex((x) => t >= x.start && t < x.end + 0.25) : -1;
      if (i >= 0) highlight(i);
      playBtn.replaceChildren(icon(audio.paused ? 'play' : 'pause', 26));
    }
    raf = requestAnimationFrame(tick);
  }
  function seekLine(i) {
    if (audio && timings) { audio.currentTime = timings[i].start; audio.play(); return; }
    if (liveMode) { speechSynthesis.cancel(); idx = i; livePlaying = true; playLive(); }
  }
  // Tarayıcı sesiyle canlı mod
  function playLive() {
    if (!livePlaying || idx >= lines.length) { livePlaying = false; playBtn.replaceChildren(icon('play', 26)); return; }
    highlight(idx);
    playBtn.replaceChildren(icon('pause', 26));
    bar.value = Math.round((idx / Math.max(1, lines.length - 1)) * 1000);
    time.textContent = `${idx + 1} / ${lines.length} replik`;
    const l = lines[idx];
    speakBrowser(l.text, { lang: c.lang, gender: byId[l.speaker]?.gender, rate, onend: () => { if (!livePlaying) return; idx++; playLive(); } });
  }

  playBtn.onclick = () => {
    if (audio) { audio.paused ? audio.play() : audio.pause(); return; }
    if (liveMode) { livePlaying = !livePlaying; if (livePlaying) playLive(); else { speechSynthesis.cancel(); playBtn.replaceChildren(icon('play', 26)); } }
  };
  const skip = (s) => {
    if (audio) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + s));
    else if (liveMode) { speechSynthesis.cancel(); idx = Math.max(0, Math.min(lines.length - 1, idx + Math.sign(s))); if (livePlaying) playLive(); else highlight(idx); }
  };
  bar.oninput = () => {
    if (audio?.duration) audio.currentTime = (bar.value / 1000) * audio.duration;
    else if (liveMode) { idx = Math.round((bar.value / 1000) * (lines.length - 1)); highlight(idx); if (livePlaying) { speechSynthesis.cancel(); playLive(); } }
  };
  const rates = [0.75, 1, 1.25, 1.5, 1.75, 2];
  speedBtn.onclick = () => { rate = rates[(rates.indexOf(rate) + 1) % rates.length]; speedBtn.textContent = fmtRate(); if (audio) audio.playbackRate = rate; };

  const dlBtn = h('button', { class: 'btn ghost small', hidden: true }, icon('download', 16), ' Ses dosyası (WAV)');
  const redoBtn = h('button', { class: 'btn ghost small' }, icon('refresh', 16), ' Sesi yeniden üret');

  const upsell = h('div', { class: 'card voice-up', hidden: true },
    h('b', {}, 'Gerçek insan sesi ister misiniz? '),
    'Şu an ücretsiz yerel ses kullanılıyor. ElevenLabs (duygulu, nefesli kadın ve erkek ses) ya da Gemini TTS anahtarı eklerseniz bu podcast gerçek bir stüdyo kaydı gibi seslendirilir. ',
    h('button', { class: 'btn primary small', onclick: () => api.openSettings?.() }, 'Ses ayarlarını aç'));
  async function prepare() {
    const cfg = await loadTTS();
    const engine = await resolveEngine(cfg);
    upsell.hidden = !['piper', 'browser'].includes(engine);
    if (engine === 'browser') return goLive('Tarayıcı sesi' + (hasNaturalBrowserVoice(c.lang) ? ' (doğal)' : ' — daha doğal ses için Ayarlar › Seslendirme'));
    const name = ENGINES[engine].split(' —')[0].split(' (')[0];
    // Ses dosyası hazırlanırken beklemeden tarayıcı sesiyle dinlenebilir
    liveMode = true; playBtn.disabled = false;
    status.textContent = `${name} ile hazırlanıyor… beklerken ▶ ile dinleyebilirsiniz`;
    try {
      const r = await synthesize(art.id, lines, speakers, c.lang, { format: c.format, onProgress: (m) => (status.textContent = m + ' · beklerken ▶ ile dinleyebilirsiniz') });
      if (disposed) return;
      timings = r.timings;
      const resumeAt = livePlaying ? idx : -1;
      livePlaying = false; speechSynthesis.cancel(); liveMode = false;
      audio = new Audio(URL.createObjectURL(r.blob));
      audio.playbackRate = rate;
      audio.addEventListener('ended', () => playBtn.replaceChildren(icon('play', 26)));
      playBtn.disabled = false;
      dlBtn.hidden = false;
      dlBtn.onclick = () => download(slug(art.title) + '.wav', r.blob);
      status.textContent = name + ' · ses dosyası hazır';
      if (resumeAt >= 0 && timings?.[resumeAt]) { audio.currentTime = timings[resumeAt].start; audio.play().catch(() => {}); }
    } catch (e) {
      if (disposed) return;
      toast(e.message, 'error', 7000);
      goLive('Ses dosyası üretilemedi, tarayıcı sesiyle çalıyor');
    }
  }
  function goLive(msg) { liveMode = true; playBtn.disabled = false; status.textContent = msg; time.textContent = `${lines.length} replik`; }
  redoBtn.onclick = async () => {
    const { db } = await import('../../db.js');
    await db.blobs.where('artifactId').equals(art.id).filter((b) => b.kind === 'mix').delete();
    if (audio) { audio.pause(); audio = null; }
    playBtn.disabled = true; prepare();
  };

  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Metni düzenle');
  editBtn.onclick = async () => {
    editing = !editing;
    list.classList.toggle('editing', editing);
    list.querySelectorAll('.tline-text').forEach((n) => (n.contentEditable = editing));
    if (!editing) {
      const newLines = [...list.querySelectorAll('.tline')].map((n, i) => ({ ...lines[i], text: n.querySelector('.tline-text').innerText.trim() }));
      await api.save({ ...c, lines: newLines }, 'Döküm düzenlendi');
      toast('Döküm kaydedildi; ses yeniden üretiliyor');
      api.reopen();
    }
    editBtn.replaceChildren(icon(editing ? 'check' : 'edit', 16), editing ? ' Kaydet' : ' Metni düzenle');
  };

  root.append(h('div', { class: 'podcast' },
    h('div', { class: 'player card' },
      h('div', { class: 'player-title' }, art.title),
      bar,
      h('div', { class: 'player-row' }, time, h('span', { class: 'grow' }), status),
      h('div', { class: 'player-ctrl' },
        speedBtn,
        h('button', { class: 'icon-btn', 'aria-label': '10 saniye geri', onclick: () => skip(-10) }, h('span', { class: 'skip' }, '↺10')),
        playBtn,
        h('button', { class: 'icon-btn', 'aria-label': '10 saniye ileri', onclick: () => skip(10) }, h('span', { class: 'skip' }, '10↻')),
        h('span', { class: 'chip ghosty' }, lines.length + ' replik'))),
    upsell,
    cast,
    h('div', { class: 'row gap wrap' }, editBtn, redoBtn, dlBtn),
    list));
  highlight(0);
  prepare();
  raf = requestAnimationFrame(tick);
  return () => { disposed = true; cancelAnimationFrame(raf); livePlaying = false; speechSynthesis.cancel(); audio?.pause(); };
}

export function toText(art) {
  const sp = Object.fromEntries(speakersOf(art.content).map((s) => [s.id, s.name]));
  return art.content.lines.map((l) => `${sp[l.speaker] || l.speaker}: ${l.text}`).join('\n\n');
}
