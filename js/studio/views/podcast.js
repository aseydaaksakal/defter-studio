// Sesli Özet oynatıcısı: tek parça doğal ses (gerçek ileri/geri sarma), konuşmacılar, döküm vurgusu, hız, WAV indirme.
// Ses hazırlanırken hazır olan bölümler sırayla çalınır (beklemeden dinleme). Türkçe tarayıcı sesi yoksa tarayıcı sesi kullanılmaz.
import { h, icon, toast, download, slug, fmtTime } from '../../ui.js';
import { synthesize, speakBrowser, resolveEngine, ENGINE_SHORT, loadTTS, hasNaturalBrowserVoice, hasBrowserVoice, femaleOK, hasSavedMix, speakLine, testVoice, serverVoices } from '../../tts.js';
import { castFor } from '../gen.js';

export function speakersOf(c) {
  if (c.speakers?.length) return c.speakers;
  const cast = castFor(c.format || 'deep');
  if (c.hosts) cast.forEach((s) => { if (c.hosts[s.id]) s.name = c.hosts[s.id]; });
  return cast;
}

// Kadın + erkek sesi verebilen bir motor yokken gösterilen çözüm kartı
export function femaleVoiceCard(openSettings) {
  return h('div', { class: 'card voice-up' },
    h('b', {}, 'Ses motoru için bir adım kaldı. '),
    'Podcast için kadın ve erkek sesi verebilen bir motor gerekiyor. Robot gibi duyulan tarayıcı Piper sesi (yalnız erkek) artık kendiliğinden kullanılmıyor. Seçenekler: ',
    h('ol', { class: 'small' },
      h('li', {}, h('b', {}, 'Lokal sunucu (önerilen, kotasız): '), 'server\\baslat.bat ile açın; edge-tts (Emel kadın, Ahmet erkek) ya da GPU modelleri (OmniVoice, Trendyol-TTS) kota olmadan, ses podcast boyunca sabit okur.'),
      h('li', {}, h('b', {}, 'Gemini anahtarı (ücretsiz ama günlük kota küçük, ~10-12 satır): '), h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'aistudio.google.com/apikey'), ' › “Create API key” › anahtarı Ayarlar › Seslendirme’ye yapıştırın.'),
      h('li', {}, h('b', {}, 'Azure (ayda 0,5M karakter ücretsiz) veya Google Cloud TTS (ayda 1M karakter ücretsiz) anahtarı.'))),
    h('button', { class: 'btn primary small', onclick: () => openSettings?.() }, 'Ses ayarlarını aç'));
}

export function render(root, art, api) {
  const c = art.content;
  const lines = c.lines || [];
  const speakers = speakersOf(c).map((s) => ({ ...s })); // karakter paneli adı/cinsiyeti/sesi değiştirebilir
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
  const cast = h('div', { class: 'row gap wrap' });
  const paintCast = () => cast.replaceChildren(...speakers.map((s) => h('span', { class: 'chip spk-' + s.id }, h('b', {}, s.name), ` · ${s.role} · ${s.gender === 'm' ? 'erkek' : 'kadın'} sesi${s.serverVoice ? ' · ' + s.serverVoice : ''}`)));
  paintCast();

  // Karakter/ses değişiklikleri: kaydedilir, ses yeniden üretilir (yalnız değişen satırlar; kalan parçalar önbellekten gelir)
  const applyBtn = h('button', { class: 'btn primary small', hidden: true }, 'Değişiklikleri uygula (sesi yeniden üret)');
  const markPending = () => { applyBtn.hidden = false; };
  applyBtn.onclick = async () => { applyBtn.disabled = true; await api.save({ ...c, speakers, lines }, 'Karakter/ses ataması değişti'); api.reopen(); };
  let prevAudio = null;
  const hearBlob = async (blob) => { try { prevAudio?.pause(); } catch {} prevAudio = new Audio(URL.createObjectURL(blob)); await prevAudio.play(); };
  const labels = []; // satır başındaki ad etiketleri (ad değişince tazelenir)

  lines.forEach((l, i) => {
    const sel = h('select', { class: 'tline-sel', 'aria-label': 'Bu satırı kim okusun', title: 'Bu satırı kim okusun', onclick: (e) => e.stopPropagation() }, speakers.map((s) => h('option', { value: s.id, selected: s.id === l.speaker ? true : null }, s.name)));
    const play = h('button', { class: 'tline-play', type: 'button', title: 'Bu satırı seçili sesle dinle', 'aria-label': 'Satırı dinle', onclick: async (e) => {
      e.stopPropagation(); play.textContent = '…';
      try { await hearBlob(await speakLine(l, byId[l.speaker], speakers, c.lang, c.format)); } catch (er) { toast(er.message, 'error', 7000); } finally { play.textContent = '▶'; }
    } }, '▶');
    const row = h('div', { class: 'tline spk-' + l.speaker, 'data-i': i, onclick: () => { if (!editing) seekLine(i); } },
      h('div', { class: 'tline-who' }, sel, play), h('div', { class: 'tline-text' }, l.text));
    sel.onchange = () => { l.speaker = sel.value; row.className = row.className.replace(/spk-[A-F]/, 'spk-' + l.speaker); markPending(); };
    labels.push((sx) => { const k = sel.value; sel.replaceChildren(...sx.map((s) => h('option', { value: s.id, selected: s.id === k ? true : null }, s.name))); });
    list.append(row);
  });

  // Karakterler ve sesler paneli (ad · cinsiyet · ses · ▶ dinle)
  const castPanel = h('details', { class: 'cast-panel' }, h('summary', {}, 'Karakterler ve sesler'));
  const castRows = h('div', { class: 'stack' });
  let libVoices = null;
  async function paintCastRows() {
    if (!libVoices) libVoices = await serverVoices().catch(() => []);
    castRows.replaceChildren(...speakers.map((s) => {
      const name = h('input', { class: 'input small-in', value: s.name, 'aria-label': 'Karakter adı' });
      name.oninput = () => { s.name = name.value.trim() || s.name; paintCast(); labels.forEach((f) => f(speakers)); };
      name.onchange = markPending;
      const gender = h('select', { class: 'input small-in' }, h('option', { value: 'f', selected: s.gender !== 'm' ? true : null }, 'Kadın'), h('option', { value: 'm', selected: s.gender === 'm' ? true : null }, 'Erkek'));
      const voice = h('select', { class: 'input small-in' });
      const fillVoice = () => voice.replaceChildren(h('option', { value: '' }, 'Otomatik ses'), ...libVoices.filter((v) => v.gender === (s.gender === 'm' ? 'm' : 'f')).map((v) => h('option', { value: v.name, selected: v.name === s.serverVoice ? true : null }, v.label)));
      fillVoice();
      gender.onchange = () => { s.gender = gender.value; if (s.serverVoice && !libVoices.some((v) => v.name === s.serverVoice && v.gender === s.gender)) delete s.serverVoice; fillVoice(); paintCast(); markPending(); };
      voice.onchange = () => { if (voice.value) s.serverVoice = voice.value; else delete s.serverVoice; paintCast(); markPending(); };
      const hear = h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
        hear.disabled = true;
        try { await hearBlob(await testVoice(s.serverVoice || (s.gender === 'm' ? 'm' : 'f'), s.gender, `Merhaba, ben ${s.name}. Bugün sizinle önemli bir konuyu konuşacağız.`)); } catch (e) { toast(e.message, 'error', 7000); } finally { hear.disabled = false; }
      } }, '▶ Dinle');
      return h('div', { class: 'cast-row' }, h('b', { class: 'chip spk-' + s.id }, s.id), name, gender, voice, hear);
    }), h('div', { class: 'row gap wrap' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => api.openVoiceStudio?.({ onClose: () => { libVoices = null; paintCastRows(); } }) }, 'Ses stüdyosunu aç (yeni ses üret, klonla)')));
  }
  castPanel.addEventListener('toggle', () => castPanel.open && paintCastRows());
  castPanel.append(castRows);

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

  let freshNext = false; // yalnız 'Sesi yeniden üret' ile true: kayıtlı sesi yok say
  async function prepare() {
    const cfg = await loadTTS();
    const fresh = freshNext; freshNext = false;
    const savedOk = !fresh && await hasSavedMix(art.id, lines, speakers); // kayıtlı tam ses varsa motor/anahtar/ağ hiç devreye girmez
    const engine = savedOk ? 'saved' : await resolveEngine(cfg);
    const needF = speakers.some((s) => s.gender !== 'm');
    upsell.hidden = savedOk || !(needF && !femaleOK(engine));
    if (!upsell.hidden) upsell.replaceChildren(femaleVoiceCard(api.openSettings));
    if (engine === 'browser') { liveMode = true; playBtn.disabled = false; status.textContent = 'Tarayıcı sesi' + (hasNaturalBrowserVoice(c.lang) ? ' (doğal)' : ''); time.textContent = `${lines.length} replik`; return; }
    streaming = true; pieces.length = 0; sPos = 0;
    const name = ENGINE_SHORT[engine] || (savedOk ? 'Kayıtlı ses' : engine);
    status.textContent = savedOk ? 'Kayıtlı ses yükleniyor…' : `${name} ile hazırlanıyor…`;
    try {
      const r = await synthesize(art.id, lines, speakers, c.lang, { format: c.format, fresh, onPiece, onProgress: (m) => { status.textContent = m + (pieces.length ? ' · ▶ hazır bölümleri çalar' : ''); } });
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
      status.textContent = r.saved ? `${ENGINE_SHORT[r.engine] || 'Kayıtlı'} · ses dosyası hazır (kayıtlı, bu cihazdan çalıyor; ağ/API kullanılmadı)` : `${ENGINE_SHORT[r.engine] || name} · ses dosyası hazır ve bu cihaza kaydedildi`;
      redoBtn.replaceChildren(icon('refresh', 16), ' Sesi yeniden üret');
      if (resume) { audio.currentTime = at; audio.play().catch(() => {}); }
    } catch (e) {
      if (disposed) return;
      streaming = false; sAudio?.pause();
      toast(e.message, 'error', 9000);
      status.textContent = `Ses durdu${e.doneLines ? ` (${e.doneLines}/${lines.length} satır hazır, saklandı)` : ''}: ` + e.message.slice(0, 140);
      redoBtn.replaceChildren(icon('refresh', 16), ' Kaldığı yerden devam et');
      if (hasBrowserVoice(c.lang)) { liveMode = true; playBtn.disabled = false; status.textContent += ' · tarayıcı sesiyle dinleyebilirsiniz'; }
    }
  }
  redoBtn.onclick = async () => {
    const { db } = await import('../../db.js');
    await db.blobs.where('artifactId').equals(art.id).filter((b) => b.kind === 'mix').delete();
    if (audio) { audio.pause(); audio = null; }
    freshNext = true; playBtn.disabled = true; prepare();
  };

  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Metni düzenle');
  editBtn.onclick = async () => {
    editing = !editing;
    list.classList.toggle('editing', editing);
    list.querySelectorAll('.tline-text').forEach((n) => (n.contentEditable = editing));
    if (!editing) {
      const newLines = [...list.querySelectorAll('.tline')].map((n, i) => ({ ...lines[i], text: n.querySelector('.tline-text').innerText.trim() })).filter((l) => l.text);
      await api.save({ ...c, lines: newLines }, 'Döküm düzenlendi');
      try { const { db } = await import('../../db.js'); await db.blobs.where('artifactId').equals(art.id).filter((b) => b.kind === 'mix').delete(); } catch {} // metin değişti: eski ses geçersiz
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
    castPanel,
    h('div', { class: 'row gap wrap' }, editBtn, redoBtn, dlBtn, applyBtn),
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
