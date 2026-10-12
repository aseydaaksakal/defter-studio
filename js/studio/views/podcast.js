// Sesli Özet oynatıcısı: iki sunuculu döküm, satır vurgusu, hız, ileri/geri, WAV indirme
import { h, icon, toast, download, slug, fmtTime } from '../../ui.js';
import { speakBrowser, renderLine, concatToWav } from '../../tts.js';
import { serverUrl } from '../../server.js';

export function render(root, art, api) {
  const c = art.content;
  const lines = c.lines || [];
  const est = lines.map((l) => Math.max(1.2, l.text.length / 14)); // saniye tahmini
  const starts = est.reduce((a, d, i) => (a.push(i ? a[i - 1] + est[i - 1] : 0), a), []);
  const total = est.reduce((a, b) => a + b, 0);
  let idx = 0, playing = false, rate = 1, audio = null, useServer = false, editing = false;

  const bar = h('input', { type: 'range', min: 0, max: lines.length - 1, value: 0, class: 'seek', 'aria-label': 'Konum' });
  const time = h('span', { class: 'time' });
  const playBtn = h('button', { class: 'play-btn', 'aria-label': 'Oynat' }, icon('play', 26));
  const speedBtn = h('button', { class: 'chip', title: 'Hız' }, '1,0×');
  const mode = h('span', { class: 'muted small' }, 'Tarayıcı sesi');
  const list = h('div', { class: 'transcript' });

  const host = (s) => c.hosts?.[s] || s;
  lines.forEach((l, i) => {
    const txt = h('div', { class: 'tline-text' }, l.text);
    list.append(h('div', { class: 'tline ' + (l.speaker === 'B' ? 'b' : 'a'), 'data-i': i, onclick: () => { if (!editing) jump(i, true); } },
      h('div', { class: 'tline-who' }, host(l.speaker)), txt));
  });

  function ui() {
    bar.value = idx;
    time.textContent = `${fmtTime(starts[idx] || 0)} / ${fmtTime(total)}`;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
    playBtn.setAttribute('aria-label', playing ? 'Duraklat' : 'Oynat');
    list.querySelectorAll('.tline').forEach((n) => n.classList.toggle('on', +n.dataset.i === idx));
    const cur = list.querySelector('.tline.on');
    if (cur && playing) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function stop() {
    speechSynthesis.cancel();
    if (audio) { audio.onended = null; audio.pause(); audio = null; }
  }
  async function playLine() {
    if (!playing) return;
    if (idx >= lines.length) { playing = false; idx = lines.length - 1; ui(); return; }
    ui();
    const l = lines[idx];
    const next = () => { if (!playing) return; idx++; playLine(); };
    if (useServer) {
      try {
        const blob = await renderLine(art.id, idx, l.text, l.speaker, c.lang);
        if (blob && playing) {
          audio = new Audio(URL.createObjectURL(blob));
          audio.playbackRate = rate; audio.onended = next;
          audio.play(); prefetch(idx + 1);
          return;
        }
      } catch (e) { toast(e.message, 'error'); useServer = false; mode.textContent = 'Tarayıcı sesi'; }
    }
    speakBrowser(l.text, { lang: c.lang, voiceIndex: l.speaker === 'B' ? 1 : 0, rate, onend: next });
  }
  const prefetch = (i) => { if (lines[i]) renderLine(art.id, i, lines[i].text, lines[i].speaker, c.lang).catch(() => {}); };
  function jump(i, play) { stop(); idx = Math.max(0, Math.min(lines.length - 1, i)); if (play) playing = true; ui(); if (playing) playLine(); }

  playBtn.onclick = () => { if (playing) { playing = false; stop(); ui(); } else { playing = true; playLine(); } };
  bar.oninput = () => jump(+bar.value, playing);
  const rates = [0.75, 1, 1.25, 1.5, 2];
  speedBtn.onclick = () => { rate = rates[(rates.indexOf(rate) + 1) % rates.length]; speedBtn.textContent = rate.toLocaleString('tr', { minimumFractionDigits: 1 }) + '×'; if (playing) jump(idx, true); };

  const wavBtn = h('button', { class: 'btn ghost small', hidden: true }, icon('download', 16), ' Ses dosyası (WAV)');
  wavBtn.onclick = async () => {
    wavBtn.disabled = true;
    try {
      const blobs = [];
      for (let i = 0; i < lines.length; i++) { wavBtn.textContent = `Seslendiriliyor ${i + 1}/${lines.length}`; blobs.push(await renderLine(art.id, i, lines[i].text, lines[i].speaker, c.lang)); }
      download(slug(art.title) + '.wav', await concatToWav(blobs));
    } catch (e) { toast(e.message, 'error'); }
    wavBtn.disabled = false; wavBtn.replaceChildren(icon('download', 16), ' Ses dosyası (WAV)');
  };
  serverUrl().then((u) => { if (u) { useServer = true; mode.textContent = 'Lokal yüksek kaliteli ses'; wavBtn.hidden = false; } });

  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Metni düzenle');
  editBtn.onclick = async () => {
    editing = !editing;
    list.classList.toggle('editing', editing);
    list.querySelectorAll('.tline-text').forEach((n) => (n.contentEditable = editing));
    if (!editing) {
      const newLines = [...list.querySelectorAll('.tline')].map((n, i) => ({ ...lines[i], text: n.querySelector('.tline-text').innerText.trim() }));
      await api.save({ ...c, lines: newLines }, 'Döküm düzenlendi');
      toast('Döküm kaydedildi');
    }
    editBtn.replaceChildren(icon(editing ? 'check' : 'edit', 16), editing ? ' Kaydet' : ' Metni düzenle');
  };

  root.append(h('div', { class: 'podcast' },
    h('div', { class: 'player card' },
      h('div', { class: 'player-title' }, art.title),
      bar,
      h('div', { class: 'player-row' }, time, h('span', { class: 'grow' }), mode),
      h('div', { class: 'player-ctrl' },
        speedBtn,
        h('button', { class: 'icon-btn', 'aria-label': '10 saniye geri', onclick: () => jump(idx - 1, playing) }, icon('back')),
        playBtn,
        h('button', { class: 'icon-btn', 'aria-label': '10 saniye ileri', onclick: () => jump(idx + 1, playing) }, icon('next')),
        h('span', { class: 'chip ghosty' }, lines.length + ' replik'))),
    h('div', { class: 'row gap' }, editBtn, wavBtn),
    list));
  ui();
  return () => { playing = false; stop(); };
}

export function toText(art) {
  return art.content.lines.map((l) => `${art.content.hosts?.[l.speaker] || l.speaker}: ${l.text}`).join('\n\n');
}
