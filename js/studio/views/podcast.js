// Sesli Özet oynatıcısı: tek parça doğal ses (gerçek ileri/geri sarma), konuşmacılar, döküm vurgusu, hız, WAV indirme.
// Ses hazırlanırken hazır olan bölümler sırayla çalınır (beklemeden dinleme). Türkçe tarayıcı sesi yoksa tarayıcı sesi kullanılmaz.
import { h, icon, toast, download, slug, fmtTime } from '../../ui.js';
import { synthesize, speakBrowser, resolveEngine, ENGINE_SHORT, loadTTS, hasNaturalBrowserVoice, hasBrowserVoice, femaleOK } from '../../tts.js';
import { castFor } from '../gen.js';

export function speakersOf(c) {
  if (c.speakers?.length) return c.speakers;
  const cast = castFor(c.format || 'deep');
  if (c.hosts) cast.forEach((s) => { if (c.hosts[s.id]) s.name = c.hosts[s.id]; });
  return cast;
}

// Kadın konuşmacı varken yalnız erkek sesli motor seçildiyse gösterilen ücretsiz çözüm kartı
export function femaleVoiceCard(openSettings) {
  return h('div', { class: 'card voice-up' },
    h('b', {}, 'Kadın sesi için bir adım kaldı. '),
    'Tarayıcıda çalışan ücretsiz Piper modelinin Türkçe seslerinin üçü de erkek; bu yüzden kadın konuşmacı da erkek sesle okunuyor. Ücretsiz çözümler: ',
    h('ol', { class: 'small' },
      h('li', {}, h('b', {}, 'Gemini anahtarı (önerilen, ücretsiz katman): '), h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'aistudio.google.com/apikey'), ' › “Create API key” › anahtarı Ayarlar › Seslendirme’ye yapıştırın. Doğal kadın + erkek Türkçe.'),
      h('li', {}, h('b', {}, 'Lokal sunucu: '), 'server/baslat.bat ile açın; edge-tts (Emel kadın, Ahmet erkek) ya da Chatterbox ile kendi kaydettiğiniz sesler.'),
      h('li', {}, h('b', {}, 'Azure (ayda 0,5M karakter ücretsiz) veya Google Cloud TTS (ayda 1M karakter ücretsiz) anahtarı.'))),
    h('button', { class: 'btn primary small', onclick: () => openSettings?.() }, 'Ses ayarlarını aç'));
}

export function render(root, art, api) {
  const c = art.content;
  const lines = c.lines || [];
  const speakers = speakersOf(c);
  const byId = Object.fromEntries(speakers.map((s) => [s.id, s]));
  let disposed = false, audio = null, timings = null, idx = 0, rate = 1, editing = false, raf = 0;
  // Akış (parça parça) çalma durumu
  const pieces = []; let sAudio = null, sPos = 0, sPlaying = false, sWaiting = false, streaming = false;
  // Tarayıcı sesiyle canlı mod (yalnız bu tarayıcıda Türkçe ses varsa)
  let liveMode = false, livePlaying = false;

  const bar = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'seek', 'aria-label': 'Konum' });
  const time = h('span', { class: 'time' }, '00:00 / --:--');
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Oynat', disabled: true }, icon('play', 26));
  const speedBtn = h('button', { class: 'chip', title: 'Oynatma hızı' }, '1,0×');
  const status = h('span', { class: 'muted small', role: 'status' }, 'Ses hazırlanıyor…');
  const list = h('div', { class: 'transcript' });
  const cast = h('div', { class: 'row gap wrap' }, speakers.map((s) => h('span', { class: 'chip spk-' + s.id }, h('b', {}, s.name), ` · ${s.role} · ${s.gender === 'm' ? 'erkek' : 'kadın'} sesi${s.serverVoice ? ' · ' + s.serverVoice : ''}`)));

  lines.forEach((l, i) => list.append(h('div', { class: 'tline spk-' + l.speaker, 'data-i': i, onclick: () => { if (!editing) seekLine(i); } },
    h('div', { class: 'tline-who' }, byId[l.speaker]?.name || l.speaker), h('div', { class: 'tline-text' }, l.text))));

  const fmtRate = () => rate.toLocaleString('tr', { minimumFractionDigits: 1 }) + '×';
  const setIcon = (playing) => playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
  function highlight(i) {
    if (i === idx && list.querySelector('.tline.on')) return;
    idx = i;
    list.querySelectorAll('.tline').forEach((n) => n.classList.toggle('on', +n.dataset.i === i));
    const cur = list.querySelector('.tline.on');
    if (cur && (audio ? !audio.paused : sPlaying || livePlaying)) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function tick() {
    if (audio) {
      const t = audio.currentTime, d = audio.duration || 0;
      bar.value = d ? Math.round((t / d) * 1000) : 0;
      time.textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
      const i = timings ? timings.findIndex((x) => t >= x.start && t < x.end + 0.25) : -1;
      if (i >= 0) highlight(i);
      setIcon(!audio.paused);
    } else if (streaming && sAudio && pieces[sPos]) {
      const p = pieces[sPos], d = sAudio.duration || 0, frac = d ? sAudio.currentTime / d : 0;
      const lens = p.idx.map((j) => lines[j].text.length || 1), sum = lens.reduce((a, b) => a + b, 0);
      let acc = 0, k = 0; while (k < lens.length - 1 && (acc + lens[k]) / sum < frac) acc += lens[k++];
      highlight(p.idx[k]);
      bar.value = Math.round((p.idx[k] / Math.max(1, lines.length - 1)) * 1000);
      time.textContent = `${p.idx[k] + 1} / ${lines.length} replik · hazır: ${pieces.at(-1).idx.at(-1) + 1}`;
    }
    raf = requestAnimationFrame(tick);
  }
  // ---- akış çalma ----
  function playPiece() {
    if (!sPlaying || disposed) return;
    const p = pieces[sPos];
    if (!p) { sWaiting = true; status.textContent = 'Sıradaki bölüm hazırlanıyor…'; return; }
    sWaiting = false;
    sAudio?.pause();
    sAudio = new Audio(p.url || (p.url = URL.createObjectURL(p.blob)));
    sAudio.playbackRate = rate;
    sAudio.onended = () => { sPos++; playPiece(); };
    sAudio.play().catch(() => { sPlaying = false; setIcon(false); });
    setIcon(true);
  }
  function onPiece(p) {
    if (disposed) return;
    pieces.push(p);
    playBtn.disabled = false;
    if (pieces.length === 1) status.textContent += ' · ▶ ile hemen dinleyebilirsiniz';
    if (sWaiting) playPiece();
  }
  function seekLine(i) {
    if (audio && timings) { audio.currentTime = timings[i].start; audio.play(); return; }
    if (streaming) { const k = pieces.findIndex((p) => p.idx.includes(i)); if (k >= 0) { sPos = k; sPlaying = true; playPiece(); } return; }
    if (liveMode) { speechSynthesis.cancel(); idx = i; livePlaying = true; playLive(); }
  }
  function playLive() {
    if (!livePlaying || idx >= lines.length) { livePlaying = false; setIcon(false); return; }
    highlight(idx); setIcon(true);
    bar.value = Math.round((idx / Math.max(1, lines.length - 1)) * 1000);
    time.textContent = `${idx + 1} / ${lines.length} replik`;
    const l = lines[idx];
    speakBrowser(l.text, { lang: c.lang, gender: byId[l.speaker]?.gender, rate, onend: () => { if (!livePlaying) return; idx++; playLive(); } });
  }

  playBtn.onclick = () => {
    if (audio) { audio.paused ? audio.play() : audio.pause(); return; }
    if (streaming) { sPlaying = !sPlaying; if (sPlaying) { if (sAudio && !sAudio.ended && sAudio.currentTime > 0) { sAudio.play(); setIcon(true); } else playPiece(); } else { sAudio?.pause(); sWaiting = false; setIcon(false); } return; }
    if (liveMode) { livePlaying = !livePlaying; if (livePlaying) playLive(); else { speechSynthesis.cancel(); setIcon(false); } }
  };
  const skip = (s) => {
    if (audio) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + s));
    else if (streaming && sAudio) sAudio.currentTime = Math.max(0, Math.min(sAudio.duration || 0, sAudio.currentTime + s));
    else if (liveMode) { speechSynthesis.cancel(); idx = Math.max(0, Math.min(lines.length - 1, idx + Math.sign(s))); if (livePlaying) playLive(); else highlight(idx); }
  };
  bar.oninput = () => {
    if (audio?.duration) audio.currentTime = (bar.value / 1000) * audio.duration;
    else if (streaming) seekLine(Math.round((bar.value / 1000) * (lines.length - 1)));
    else if (liveMode) { idx = Math.round((bar.value / 1000) * (lines.length - 1)); highlight(idx); if (livePlaying) { speechSynthesis.cancel(); playLive(); } }
  };
  const rates = [0.75, 1, 1.25, 1.5, 1.75, 2];
  speedBtn.onclick = () => { rate = rates[(rates.indexOf(rate) + 1) % rates.length]; speedBtn.textContent = fmtRate(); if (audio) audio.playbackRate = rate; if (sAudio) sAudio.playbackRate = rate; };

  const dlBtn = h('button', { class: 'btn ghost small', hidden: true }, icon('download', 16), ' Ses dosyası (WAV)');
  const redoBtn = h('button', { class: 'btn ghost small' }, icon('refresh', 16), ' Sesi yeniden üret');
  const upsell = h('div', { hidden: true });

  async function prepare() {
    const cfg = await loadTTS();
    const engine = await resolveEngine(cfg);
    const needF = speakers.some((s) => s.gender !== 'm');
    upsell.hidden = !(needF && !femaleOK(engine));
    if (!upsell.hidden) upsell.replaceChildren(femaleVoiceCard(api.openSettings));
    if (engine === 'browser') { liveMode = true; playBtn.disabled = false; status.textContent = 'Tarayıcı sesi' + (hasNaturalBrowserVoice(c.lang) ? ' (doğal)' : ''); time.textContent = `${lines.length} replik`; return; }
    streaming = true; pieces.length = 0; sPos = 0;
    const name = ENGINE_SHORT[engine] || engine;
    status.textContent = `${name} ile hazırlanıyor…`;
    try {
      const r = await synthesize(art.id, lines, speakers, c.lang, { format: c.format, onPiece, onProgress: (m) => { status.textContent = m + (pieces.length ? ' · ▶ hazır bölümleri çalar' : ''); } });
      if (disposed) return;
      // akıştan tek parça dosyaya geç: aynı yerden devam et
      const wasPlaying = sPlaying && !sWaiting;
      const at = sAudio && pieces[sPos] ? (r.timings?.[pieces[sPos].idx[0]]?.start || 0) + (sAudio.currentTime || 0) : sWaiting && pieces[sPos - 1] ? r.timings?.[pieces[sPos - 1].idx.at(-1)]?.end || 0 : 0;
      const resume = wasPlaying || sWaiting;
      sAudio?.pause(); sPlaying = false; streaming = false; pieces.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      timings = r.timings;
      audio = new Audio(URL.createObjectURL(r.blob));
      audio.playbackRate = rate;
      audio.addEventListener('ended', () => setIcon(false));
      playBtn.disabled = false;
      dlBtn.hidden = false;
      dlBtn.onclick = () => download(slug(art.title) + '.wav', r.blob);
      status.textContent = `${ENGINE_SHORT[r.engine] || name} · ses dosyası hazır`;
      if (resume) { audio.currentTime = at; audio.play().catch(() => {}); }
    } catch (e) {
      if (disposed) return;
      streaming = false; sAudio?.pause();
      toast(e.message, 'error', 9000);
      status.textContent = 'Ses üretilemedi: ' + e.message.slice(0, 120);
      if (hasBrowserVoice(c.lang)) { liveMode = true; playBtn.disabled = false; status.textContent += ' · tarayıcı sesiyle dinleyebilirsiniz'; }
    }
  }
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
      const newLines = [...list.querySelectorAll('.tline')].map((n, i) => ({ ...lines[i], text: n.querySelector('.tline-text').innerText.trim() })).filter((l) => l.text);
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
  return () => { disposed = true; cancelAnimationFrame(raf); livePlaying = false; sPlaying = false; sAudio?.pause(); window.speechSynthesis?.cancel(); audio?.pause(); };
}

export function toText(art) {
  const sp = Object.fromEntries(speakersOf(art.content).map((s) => [s.id, s.name]));
  return art.content.lines.map((l) => `${sp[l.speaker] || l.speaker}: ${l.text}`).join('\n\n');
}
