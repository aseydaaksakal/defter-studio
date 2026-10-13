// Defter Studio — uygulama kabuğu: defterler, kaynaklar, sohbet, Studio, görüntüleyici, ayarlar
import { db, now, getSetting, setSetting, saveArtifactContent, deleteArtifact, deleteSource, deleteNotebook, exportNotebook, importNotebook, touchNotebook } from './db.js';
import { PROVIDERS, loadConfig, saveConfig, listModels, chat } from './llm.js';
import { addSource, fileToText, urlToText, chunkText, enabledSources, replaceSourceText } from './sources.js';
import { serverUrl, serverBase, setServerBase, serverInfo, updateCheck, updateApply } from './server.js';
import { TOOLS, LANGS, answer, suggestQuestions } from './studio/gen.js';
import { h, icon, toast, modal, confirmBox, promptBox, renderMarkdown, download, slug, timeAgo } from './ui.js';
import { seedDemo } from './demo.js';
import { getStats, levelOf, xpForLevel, BADGES, updateXpPill, dueMistakes, readiness, sciencePage, resolveMistake } from './learn.js';
import { typingPage } from './typing.js';
import { looksScanned, runOcr, stopOcr, ocrRunning, onOcrProgress, ocrText } from './ocr.js';
import { loadTTS, saveTTS, synthesize } from './tts.js';
import { voiceSettings } from './voice-settings.js';
import { openVoiceStudio } from './voice-studio.js';
import { imageSettings } from './image-settings.js';
import { IMAGE_TOOLS, autoIllustrate } from './studio/illustrate.js';
import { bankCard } from './bank-ui.js';
import { pomodoroButton } from './pomodoro.js';
import { TAB, ownedElsewhere } from './tabs.js';
import { resumeBankFills } from './bank.js';
import * as vMemory from './studio/views/memory.js';
import * as vTeach from './studio/views/teach.js';
import * as vSpeed from './studio/views/speedread.js';

import * as vPodcast from './studio/views/podcast.js';
import * as vSlides from './studio/views/slides.js';
import * as vVideo from './studio/views/video.js';
import * as vMindmap from './studio/views/mindmap.js';
import * as vReport from './studio/views/report.js';
import * as vCards from './studio/views/flashcards.js';
import * as vQuiz from './studio/views/quiz.js';
import * as vInfo from './studio/views/infographic.js';
import * as vTable from './studio/views/table.js';
import * as vListen from './studio/views/listen.js';

const VIEWS = { podcast: vPodcast, slides: vSlides, video: vVideo, mindmap: vMindmap, report: vReport, flashcards: vCards, quiz: vQuiz, infographic: vInfo, table: vTable, memory: vMemory, teach: vTeach, speedread: vSpeed, listen: vListen,
  note: { render: (root, art) => root.append(renderMarkdown(art.content.markdown, art.content.refs || [])), toText: (a) => a.content.markdown } };
const TYPE_LABEL = { ...Object.fromEntries(Object.entries(TOOLS).map(([k, v]) => [k, v.label])), note: 'Not' };
const TYPE_ICON = { ...Object.fromEntries(Object.entries(TOOLS).map(([k, v]) => [k, v.icon])), note: 'note' };

const app = document.getElementById('app');
const put = (el, ...k) => el.replaceChildren(...k.flat().filter((x) => x !== null && x !== undefined && x !== false));
let state = { nb: null, pane: 'chat', viewer: null, cleanup: null };

// ===================== Başlangıç =====================
async function boot() {
  applyTheme(await getSetting('theme', 'auto'));
  // Kalıcı depolama: üretilmiş ses/video dosyaları ve Piper modeli tarayıcı yer açarken silinmesin (izin verilmezse sessizce geçilir)
  try { navigator.storage?.persist?.(); } catch {}
  // Sayfa kapanırken yarıda kalan üretimleri işaretle
  // (başka bir açık sekmede çalışan işlere dokunma)
  await db.artifacts.where('status').anyOf('running', 'queued').filter((a) => !ownedElsewhere(a.owner)).modify({ status: 'error', error: 'Sayfa kapandığı için yarıda kaldı.' });
  if (!(await db.notebooks.count()) && !(await getSetting('demoSeeded'))) { await seedDemo(); await setSetting('demoSeeded', true); }
  window.addEventListener('hashchange', route);
  route();
  try { const q = new URLSearchParams(location.search); if (q.get('bagla')) { await setServerBase('http://localhost:8765'); history.replaceState(null, '', location.pathname + location.hash); toast('Bilgisayarınızdaki sunucuya bağlanılıyor'); } } catch {}
  serverUrl().then((u) => { updateStatus(); const up = serverInfo()?.update; if (u && up?.available) toast(`Yardımcı sunucuya güncelleme var (${up.latest}). Ayarlar › Lokal yardımcı sunucu › Sunucuyu güncelle`); });
  // Yarıda kalan soru bankası doldurmayı sürdür (yalnız kullanıcı başlatmışsa ve model erişilebilirse)
  db.settings.where('key').startsWith('bank:').filter((r) => r.value?.status === 'running').count()
    .then(async (n) => { if (n && (await checkLLM()).ok) resumeBankFills(); }).catch(() => {});
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t === 'auto' ? '' : t;
  if (t === 'auto') delete document.documentElement.dataset.theme;
}

async function route() {
  state.cleanup?.(); state.cleanup = null;
  const m = location.hash.match(/^#\/n\/(\d+)(?:\/a\/(\d+))?/);
  if (m) {
    const nb = await db.notebooks.get(+m[1]);
    if (!nb) { location.hash = '#/'; return; }
    if (state.nb?.id !== nb.id || !document.querySelector('.nb')) { state.nb = nb; await renderNotebook(); }
    state.nb = nb;
    if (m[2]) openViewer(+m[2]); else closeViewer(false);
  } else {
    state.nb = null;
    const tab = (location.hash.match(/^#\/(bugun|klavye|bilim)/) || [])[1] || 'defterler';
    if (tab === 'defterler') await renderHome(); else await renderHub(tab);
  }
}

function topbar(extra = []) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Ana sayfa' }, h('span', { class: 'logo' }, icon('book', 22)), h('span', { class: 'brand-t' }, 'Defter Studio')),
    ...extra,
    h('span', { class: 'grow' }),
    pomodoroButton(),
    h('a', { id: 'xp-pill', class: 'status-pill xp', href: '#/bugun', title: 'Seri · seviye · bugünkü puan' }),
    h('span', { id: 'llm-status', class: 'status-pill', title: 'Model durumu' }),
    h('button', { class: 'icon-btn', 'aria-label': 'Ses efektleri', title: 'Ses efektleri', onclick: (e) => { const off = localStorage.getItem('ds-sound') === 'off'; localStorage.setItem('ds-sound', off ? 'on' : 'off'); toast(off ? 'Ses efektleri açık' : 'Ses efektleri kapalı'); } }, icon('audio')),
    h('button', { class: 'icon-btn', 'aria-label': 'Tema', onclick: cycleTheme }, icon('sun')),
    h('button', { class: 'icon-btn', 'aria-label': 'Ses stüdyosu', title: 'Ses stüdyosu: sesler, klonlama, karakterler', onclick: () => openVoiceStudio() }, icon('audio')),
    h('button', { class: 'icon-btn', 'aria-label': 'Ayarlar', onclick: openSettings }, icon('settings')));
}
async function cycleTheme() {
  const order = ['auto', 'dark', 'light'];
  const t = order[(order.indexOf(await getSetting('theme', 'auto')) + 1) % 3];
  await setSetting('theme', t); applyTheme(t); toast('Tema: ' + { auto: 'sistem', dark: 'koyu', light: 'açık' }[t]);
}
async function updateStatus() {
  const el = document.getElementById('llm-status'); if (!el) return;
  const cfg = await loadConfig();
  const srv = await serverUrl();
  put(el, h('span', { class: 'dot ' + (cfg.model ? 'ok' : 'skip') }), ' ', (PROVIDERS[cfg.provider]?.label || cfg.provider).split(' (')[0], cfg.model ? ' · ' + cfg.model : ' · model seçilmedi', srv ? ' · sunucu ✓' : '');
  el.onclick = openSettings;
  updateXpPill();
}

// ===================== Ana sayfa =====================
async function renderHome() {
  const list = await db.notebooks.orderBy('updatedAt').reverse().toArray();
  const counts = {};
  for (const n of list) counts[n.id] = { s: await db.sources.where('notebookId').equals(n.id).count(), a: await db.artifacts.where('notebookId').equals(n.id).count() };
  const grid = h('div', { class: 'nb-grid' },
    h('button', { class: 'nb-card new', onclick: newNotebook }, icon('plus', 34), h('span', {}, 'Yeni defter oluştur')),
    list.map((n) => h('div', { class: 'nb-card', tabindex: 0, onclick: () => (location.hash = '#/n/' + n.id), onkeydown: (e) => e.key === 'Enter' && (location.hash = '#/n/' + n.id) },
      h('div', { class: 'nb-emoji' }, n.emoji || '📘'),
      h('div', { class: 'nb-title' }, n.title),
      h('div', { class: 'muted small' }, `${counts[n.id].s} kaynak · ${counts[n.id].a} Studio içeriği · ${timeAgo(n.updatedAt)}`),
      h('div', { class: 'nb-actions' },
        h('button', { class: 'icon-btn', 'aria-label': 'Yeniden adlandır', onclick: async (e) => { e.stopPropagation(); const t = await promptBox('Defter adı', n.title); if (t) { await db.notebooks.update(n.id, { title: t }); renderHome(); } } }, icon('edit', 16)),
        h('button', { class: 'icon-btn', 'aria-label': 'Yedekle', onclick: async (e) => { e.stopPropagation(); download(slug(n.title) + '.defter.json', JSON.stringify(await exportNotebook(n.id)), 'application/json'); } }, icon('download', 16)),
        h('button', { class: 'icon-btn', 'aria-label': 'Sil', onclick: async (e) => { e.stopPropagation(); if (await confirmBox('Defter silinsin mi?', `"${n.title}" ve içindeki tüm kaynaklar, sohbetler ve Studio içerikleri kalıcı olarak silinecek.`)) { await deleteNotebook(n.id); renderHome(); } } }, icon('trash', 16))))));
  const imp = h('input', { type: 'file', accept: '.json', hidden: true, onchange: async (e) => {
    try { const id = await importNotebook(JSON.parse(await e.target.files[0].text()), chunkText); location.hash = '#/n/' + id; } catch (err) { toast(err.message, 'error'); }
  } });
  put(app, topbar(), hubTabs('defterler'), h('main', { class: 'home' },
    h('div', { class: 'home-head' }, h('div', {}, h('h1', {}, 'Defterleriniz'), h('p', { class: 'muted' }, 'Kaynaklarınızı yükleyin; sohbet edin, podcast, slayt, video, test ve daha fazlasını kendi bilgisayarınızda üretin.')),
      h('button', { class: 'btn ghost', onclick: () => imp.click() }, icon('upload', 16), ' Yedekten içe aktar'), imp),
    grid));
  updateStatus();
}

// ===================== Merkez sekmeleri: Bugün · Klavye · Öğrenme bilimi =====================
function hubTabs(cur) {
  const T = [['defterler', 'Defterler', '#/'], ['bugun', 'Bugün', '#/bugun'], ['klavye', '10 parmak', '#/klavye'], ['bilim', 'Öğrenme bilimi', '#/bilim']];
  return h('nav', { class: 'hub-tabs', 'aria-label': 'Bölümler' }, T.map(([k, t, href]) => h('a', { class: 'tab' + (k === cur ? ' on' : ''), href }, t)));
}
async function renderHub(tab) {
  let body;
  if (tab === 'klavye') body = await typingPage();
  else if (tab === 'bilim') body = sciencePage();
  else body = await todayPage();
  put(app, topbar(), hubTabs(tab), h('main', { class: 'home' }, body));
  updateStatus();
}

async function todayPage() {
  const s = await getStats();
  const lv = levelOf(s.xp), lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
  const todayXp = s.days[new Date().toISOString().slice(0, 10)] || 0;
  const mistakes = await dueMistakes();
  const nbs = await db.notebooks.orderBy('updatedAt').reverse().toArray();
  const rows = [];
  let dueTotal = 0;
  for (const n of nbs) { const r = await readiness(n.id); dueTotal += r.dueCards; rows.push({ n, r }); }
  const week = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return { d, v: s.days[d] || 0 }; });
  const maxW = Math.max(s.goal, ...week.map((w) => w.v));
  const plan = [];
  if (dueTotal) plan.push(['🃏', `${dueTotal} bilgi kartının tekrar zamanı geldi`, 'Kartları aç ve "Yalnız tekrar zamanı gelenler"i seç']);
  if (mistakes.length) plan.push(['📕', `Hata defterinde ${mistakes.length} soru seni bekliyor`, 'Aşağıdan "Hataları tekrar et"e bas']);
  const weakest = rows.filter((x) => x.r.arts.length).sort((a, b) => a.r.score - b.r.score)[0];
  if (weakest) plan.push(['🎯', `En zayıf defterin: ${weakest.n.title} (%${weakest.r.score})`, 'Bir deneme sınavı çöz, yanlışlarını öğreterek öğren aracıyla anlat']);
  plan.push(['⌨️', '5 dakika 10 parmak klavye', 'Kendi kaynaklarını yazarak hem hız hem tekrar kazan'], ['🧠', 'Bir konuyu hafıza sarayına yerleştir', 'Studio › Hafıza Teknikleri']);
  const reviewBtn = mistakes.length ? h('button', { class: 'btn primary', onclick: () => reviewMistakes(mistakes) }, `Hataları tekrar et (${mistakes.length})`) : null;
  return h('div', { class: 'today' },
    h('div', { class: 'today-top' },
      h('div', { class: 'card stat-big' }, h('div', { class: 'sb-v' }, '🔥 ' + s.streak), h('div', { class: 'muted' }, `günlük seri · en iyi ${s.best}`)),
      h('div', { class: 'card stat-big' }, h('div', { class: 'sb-v' }, 'Seviye ' + lv), h('div', { class: 'meter thin' }, h('div', { style: { width: Math.round(((s.xp - lo) / (hi - lo)) * 100) + '%' } })), h('div', { class: 'muted small' }, `${s.xp} puan · sonraki seviye ${hi}`)),
      h('div', { class: 'card stat-big' }, h('div', { class: 'sb-v' }, `${todayXp}/${s.goal}`), h('div', { class: 'meter thin' }, h('div', { style: { width: Math.min(100, (todayXp / s.goal) * 100) + '%' } })), h('div', { class: 'muted small' }, 'bugünkü hedef puan'))),
    h('div', { class: 'card' }, h('h3', {}, 'Son 14 gün'), h('div', { class: 'week' }, week.map((w) => h('div', { class: 'wk', title: `${w.d}: ${w.v} puan` }, h('div', { class: 'wk-bar' + (w.v >= s.goal ? ' pass' : ''), style: { height: Math.max(3, (w.v / maxW) * 70) + 'px' } }), h('small', {}, w.d.slice(8)))))),
    h('div', { class: 'card' }, h('h3', {}, 'Bugünün planı'), h('ol', { class: 'plan' }, plan.map(([e, t, d]) => h('li', {}, h('span', { class: 'plan-e' }, e), h('div', {}, h('b', {}, t), h('div', { class: 'muted small' }, d))))), reviewBtn),
    h('div', { class: 'card' }, h('h3', {}, 'Sınava hazırlık durumu'),
      rows.length ? h('div', { class: 'ready' }, rows.map(({ n, r }) => h('a', { class: 'ready-row', href: '#/n/' + n.id },
        h('span', { class: 'grow' }, `${n.emoji || '📘'} ${n.title}`),
        h('div', { class: 'meter thin', style: { width: '40%' } }, h('div', { style: { width: r.score + '%', background: r.score >= 70 ? 'var(--ok)' : r.score >= 40 ? 'var(--warn)' : 'var(--no)' } })),
        h('span', { class: 'small muted', style: { width: '170px', textAlign: 'right' } }, `%${r.score} · ${r.dueCards} kart bekliyor${r.lastQuiz !== null ? ' · son test %' + r.lastQuiz : ''}`)))) : h('p', { class: 'muted' }, 'Henüz defter yok.'),
      h('p', { class: 'muted small' }, 'Hazırlık: kart ustalığı ve son üç testin ortalaması. Hedef puanı geçince sınava hazırsın.')),
    h('div', { class: 'card' }, h('h3', {}, 'Rozetler'), h('div', { class: 'badges' }, Object.entries(BADGES).map(([k, [e, t, d]]) => h('div', { class: 'badge' + (s.badges.includes(k) ? ' got' : ''), title: d }, h('div', { class: 'be' }, e), h('small', {}, t))))));
}

function reviewMistakes(list) {
  const art = { id: 0, notebookId: 0, title: 'Hata defteri', content: { questions: list.map((m) => m.q), mode: 'practice', target: 70 } };
  const body = h('div');
  const close = modal({ title: 'Hata defteri tekrarı', wide: true, body, onClose: () => route() });
  vQuiz.render(body, art, { save: async () => {}, ask: (t) => { close(); askAnywhere(t); } });
}
function askAnywhere(t) { toast('Bir defter açıp sohbette sorabilirsin: ' + t.slice(0, 60)); }

async function newNotebook() {
  const id = await db.notebooks.add({ title: 'Adsız defter', emoji: ['📘', '📗', '📙', '📕', '🧭', '⚓', '🧪', '🎓'][Math.floor(Math.random() * 8)], createdAt: now(), updatedAt: now() });
  location.hash = '#/n/' + id;
  setTimeout(openAddSource, 300);
}

// ===================== Defter ekranı =====================
async function renderNotebook() {
  const nb = state.nb;
  const title = h('h1', { class: 'nb-name', contenteditable: 'true', spellcheck: 'false', 'aria-label': 'Defter adı' }, nb.title);
  title.addEventListener('blur', async () => { const t = title.innerText.trim() || 'Adsız defter'; await db.notebooks.update(nb.id, { title: t }); state.nb.title = t; });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  const tabs = h('nav', { class: 'mobile-tabs', 'aria-label': 'Bölümler' }, [['sources', 'Kaynaklar'], ['chat', 'Sohbet'], ['studio', 'Studio']].map(([k, t]) =>
    h('button', { class: 'tab' + (state.pane === k ? ' on' : ''), onclick: () => { state.pane = k; document.querySelector('.nb').dataset.pane = k; tabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.textContent === t)); } }, t)));
  put(app, 
    topbar([h('span', { class: 'sep' }, '/'), title,
      h('button', { class: 'btn ghost small hide-sm', onclick: async () => download(slug(nb.title) + '.defter.json', JSON.stringify(await exportNotebook(nb.id)), 'application/json') }, icon('download', 16), ' Yedekle')]),
    tabs,
    h('main', { class: 'nb', 'data-pane': state.pane },
      h('section', { class: 'pane sources-pane', id: 'sources' }),
      h('section', { class: 'pane chat-pane', id: 'chat' }),
      h('section', { class: 'pane studio-pane', id: 'studio' }),
      h('section', { class: 'viewer', id: 'viewer', hidden: true })));
  await Promise.all([renderSources(), renderChat(), renderStudio()]);
  resumeOcrs(nb.id);
  updateStatus();
}

// ---------- Kaynaklar ----------
async function renderSources() {
  const pane = document.getElementById('sources'); if (!pane) return;
  const srcs = await db.sources.where('notebookId').equals(state.nb.id).toArray();
  const allOn = srcs.length && srcs.every((s) => s.enabled);
  const srv = await serverUrl();
  const search = srv ? h('form', { class: 'src-search card', onsubmit: async (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) webSearch(q); } },
    h('input', { name: 'q', class: 'input', placeholder: "Web'de yeni kaynaklar arayın", 'aria-label': "Web'de kaynak ara" }), h('button', { class: 'icon-btn', 'aria-label': 'Ara' }, icon('next'))) : null;
  put(pane, 
    h('div', { class: 'pane-head' }, h('h2', {}, 'Kaynaklar')),
    h('button', { class: 'btn wide outline', onclick: openAddSource }, icon('plus', 18), ' Kaynak ekle'),
    search,
    srcs.length ? h('label', { class: 'src-all' }, h('span', { class: 'grow' }, 'Tümünü seç'), h('input', { type: 'checkbox', checked: allOn ? true : null, onchange: async (e) => { await db.sources.where('notebookId').equals(state.nb.id).modify({ enabled: e.target.checked ? 1 : 0 }); renderSources(); renderChat(true); } })) : null,
    h('ul', { class: 'src-list' }, srcs.map((s) => h('li', { class: 'src' },
      h('span', { class: 'src-ic ' + s.kind }, { pdf: 'PDF', web: 'WEB', youtube: 'YT', audio: 'SES', docx: 'DOC', text: 'TXT' }[s.kind] || 'TXT'),
      h('button', { class: 'src-title', title: s.title, onclick: () => viewSource(s) }, s.title,
        !s.ocr && s.kind === 'pdf' && looksScanned(s.text || '', s.pages || 0) ? h('span', { class: 'ocr-chip' }, 'Taranmış PDF: metin tanıma için silip yeniden yükleyin') : null,
        s.ocr ? h('span', { class: 'ocr-chip', 'data-ocr': s.id }, s.ocr.status === 'done' ? 'OCR tamam' : ocrRunning(s.id) ? `OCR %${Math.round(((s.ocr.done || 0) / (s.ocr.total || 1)) * 100)} · ${s.ocr.done || 0}/${s.ocr.total} sayfa` : s.ocr.status === 'error' ? 'OCR hata' : `OCR ${s.ocr.done || 0}/${s.ocr.total}`) : null),
      s.ocr && s.ocr.status !== 'done' ? h('button', { class: 'icon-btn small', 'aria-label': ocrRunning(s.id) ? 'OCR duraklat' : 'OCR sürdür', title: ocrRunning(s.id) ? 'Duraklat' : 'Sürdür', onclick: () => { ocrRunning(s.id) ? stopOcr(s.id) : startOcr(s.id); setTimeout(renderSources, 300); } }, icon(ocrRunning(s.id) ? 'pause' : 'play', 14)) : null,
      h('button', { class: 'icon-btn small', 'aria-label': 'Kaynağı sil', onclick: async () => { if (await confirmBox('Kaynak silinsin mi?', s.title)) { await deleteSource(s.id); renderSources(); renderChat(true); } } }, icon('trash', 15)),
      h('input', { type: 'checkbox', 'aria-label': 'Kaynağı kullan', checked: s.enabled ? true : null, onchange: async (e) => { await db.sources.update(s.id, { enabled: e.target.checked ? 1 : 0 }); renderSources(); renderChat(true); } })))),
    !srcs.length ? h('div', { class: 'empty' }, h('p', {}, 'Henüz kaynak yok.'), h('p', { class: 'muted small' }, 'PDF, Word, metin, web sayfası, YouTube veya ses dosyası ekleyin. Kaynaklarınız yalnızca bu tarayıcıda saklanır.')) : null);
}

// ---------- OCR (taranmış PDF) ----------
function startOcr(sid) {
  runOcr(sid, { onPages: async (text, done) => {
    const src = await db.sources.get(sid);
    await replaceSourceText(sid, text ?? ocrText(src));
    if (done) { toast(`${src.title}: metin tanıma tamamlandı`, 'ok'); afterSourcesChanged(); }
  } }).catch((e) => toast('OCR: ' + e.message, 'error', 7000));
  renderSources();
}
onOcrProgress((sid, st) => {
  const el = document.querySelector(`[data-ocr="${sid}"]`);
  if (el) { el.textContent = st.status === 'running' ? `OCR %${Math.round((st.done / st.total) * 100)} · ${st.done}/${st.total} sayfa` : st.status === 'done' ? 'OCR tamam' : st.status === 'error' ? 'OCR hata' : 'OCR duraklatıldı'; }
  if (st.status !== 'running') renderSources();
});
// Sayfa yenilenince yarım kalan OCR'ları sürdür
async function resumeOcrs(nbId) {
  const srcs = await db.sources.where('notebookId').equals(nbId).toArray();
  for (const s of srcs) if (s.ocr && ['running', 'queued'].includes(s.ocr.status) && !ocrRunning(s.id) && !ownedElsewhere(s.ocr.owner)) startOcr(s.id);
}

function viewSource(s) {
  modal({ title: s.title, wide: true, body: h('div', {}, h('p', { class: 'muted small' }, `${s.kind.toUpperCase()} · ${s.chars.toLocaleString('tr')} karakter${s.pages ? ' · ' + s.pages + ' sayfa' : ''}${s.url ? ' · ' : ''}`, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, 'bağlantı') : null),
    h('pre', { class: 'src-text' }, s.text.replace(/\[\[s\.(\d+)\]\]/g, '— Sayfa $1 —'))),
    actions: [{ label: 'Yeniden adlandır', run: async (c) => { const t = await promptBox('Kaynak adı', s.title); if (t) { await db.sources.update(s.id, { title: t }); c(); renderSources(); } } }, { label: 'Kapat', primary: true, run: (c) => c() }] });
}

function openAddSource() {
  const status = h('div', { class: 'add-status muted small', role: 'status' });
  const fileIn = h('input', { type: 'file', multiple: true, accept: '.pdf,.txt,.md,.docx,.html,.htm,.csv,.json,.mp3,.wav,.m4a,.mp4,.webm,.ogg', hidden: true, onchange: (e) => addFiles([...e.target.files]) });
  const drop = h('div', { class: 'dropzone', tabindex: 0, role: 'button', onclick: () => fileIn.click(), onkeydown: (e) => e.key === 'Enter' && fileIn.click() },
    icon('upload', 36), h('b', {}, 'Dosyaları sürükleyip bırakın ya da seçin'), h('span', { class: 'muted small' }, 'PDF, Word (.docx), TXT, Markdown, HTML, CSV · Ses/video (lokal sunucu ile)'));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  const url = h('input', { class: 'input', type: 'url', placeholder: 'https://… (web sayfası veya YouTube)' });
  const txtTitle = h('input', { class: 'input', placeholder: 'Başlık' });
  const txt = h('textarea', { class: 'input', rows: 6, placeholder: 'Metni buraya yapıştırın' });
  let closeFn;
  async function addFiles(files) {
    for (const f of files) {
      status.textContent = `${f.name} okunuyor…`;
      try {
        const r = await fileToText(f, (p) => (status.textContent = `${f.name} okunuyor… %${Math.round(p * 100)}`));
        status.textContent = `${f.name} parçalanıyor ve dizinleniyor…`;
        const scanned = r.kind === 'pdf' && looksScanned(r.text, r.pages);
        const sid = await addSource(state.nb.id, { title: f.name.replace(/\.[^.]+$/, ''), kind: r.kind, text: r.text, allowEmpty: scanned, meta: r.pages ? { pages: r.pages } : {} });
        if (scanned) {
          await db.blobs.add({ artifactId: 'src:' + sid, kind: 'pdf', blob: f });
          await db.sources.update(sid, { ocr: { status: 'queued', done: 0, total: r.pages } });
          toast(`${f.name}: taranmış PDF, ${r.pages} sayfa metin tanıma (OCR) ile okunuyor. İlerleme Kaynaklar listesinde.`, 'info', 8000);
          startOcr(sid);
        } else toast(`${f.name} eklendi`);
      } catch (e) { toast(`${f.name}: ${e.message}`, 'error', 6000); }
    }
    status.textContent = '';
    closeFn?.(); afterSourcesChanged();
  }
  closeFn = modal({ title: 'Kaynak ekle', wide: true, body: h('div', { class: 'add-src' }, drop, fileIn,
    h('div', { class: 'add-row' }, h('h3', {}, icon('link', 18), ' Web sitesi veya YouTube'), h('div', { class: 'row gap' }, url,
      h('button', { class: 'btn primary', onclick: async () => {
        if (!url.value) return; status.textContent = 'Sayfa okunuyor…';
        try { const r = await urlToText(url.value); await addSource(state.nb.id, { title: r.title || url.value, kind: r.kind, text: r.text, meta: { url: url.value } }); closeFn(); afterSourcesChanged(); toast('Bağlantı eklendi'); }
        catch (e) { status.textContent = ''; toast(e.message, 'error', 6000); }
      } }, 'Ekle'))),
    h('div', { class: 'add-row' }, h('h3', {}, icon('note', 18), ' Kopyalanan metin'), txtTitle, txt,
      h('button', { class: 'btn primary', onclick: async () => {
        if (!txt.value.trim()) return;
        try { await addSource(state.nb.id, { title: txtTitle.value || txt.value.slice(0, 40), kind: 'text', text: txt.value }); closeFn(); afterSourcesChanged(); } catch (e) { toast(e.message, 'error'); }
      } }, 'Metni ekle')),
    status) });
}

async function webSearch(q) {
  const base = await serverUrl();
  try {
    const r = await (await fetch(base + '/search?q=' + encodeURIComponent(q))).json();
    const sel = new Set();
    modal({ title: 'Web sonuçları: ' + q, wide: true,
      body: h('ul', { class: 'search-res' }, r.results.map((x, i) => h('li', {}, h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? sel.add(i) : sel.delete(i)) }), h('span', {}, h('b', {}, x.title), h('br'), h('span', { class: 'muted small' }, x.url), h('br'), h('span', { class: 'small' }, x.snippet)))))),
      actions: [{ label: 'Seçilenleri ekle', primary: true, run: async (c) => {
        c();
        for (const i of sel) { try { const t = await urlToText(r.results[i].url); await addSource(state.nb.id, { title: t.title || r.results[i].title, kind: 'web', text: t.text, meta: { url: r.results[i].url } }); } catch (e) { toast(e.message, 'error'); } }
        afterSourcesChanged();
      } }] });
  } catch (e) { toast('Arama başarısız: ' + e.message, 'error'); }
}

async function afterSourcesChanged() {
  if (state.nb.title === 'Adsız defter') {
    const first = await db.sources.where('notebookId').equals(state.nb.id).first();
    if (first) { await db.notebooks.update(state.nb.id, { title: first.title }); state.nb.title = first.title; const t = document.querySelector('.nb-name'); if (t) t.textContent = first.title; }
  }
  await db.notebooks.update(state.nb.id, { summary: null });
  renderSources(); renderChat(true);
}

// ---------- Sohbet ----------
let chatAbort = null;
async function renderChat(refreshSummary = false) {
  const pane = document.getElementById('chat'); if (!pane) return;
  const nb = await db.notebooks.get(state.nb.id);
  const msgs = await db.messages.where('notebookId').equals(nb.id).sortBy('createdAt');
  const srcCount = (await enabledSources(nb.id)).length;
  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const summary = h('div', { class: 'nb-summary' });
  log.append(summary);
  paintSummary(summary, nb, refreshSummary && srcCount);
  for (const m of msgs) log.append(msgEl(m));
  const input = h('textarea', { class: 'chat-input', rows: 1, placeholder: srcCount ? 'Soru sorun veya içerik oluşturun' : 'Başlamak için bir kaynak ekleyin', 'aria-label': 'Mesaj' });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(180, input.scrollHeight) + 'px'; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  const sendBtn = h('button', { class: 'send-btn', 'aria-label': 'Gönder', onclick: () => (chatAbort ? chatAbort.abort() : send()) }, icon('send', 18));
  async function send(text) {
    const q = (text || input.value).trim();
    if (!q) return;
    if (chatAbort) { toast('Önceki yanıt hâlâ hazırlanıyor. Durdurmak için ■ düğmesine basın.', 'info'); return; }
    if (!srcCount) { toast('Önce bir kaynak ekleyin.', 'error'); return; }
    input.value = ''; input.style.height = 'auto';
    const um = { notebookId: nb.id, role: 'user', content: q, createdAt: now() };
    um.id = await db.messages.add(um);
    log.append(msgEl(um));
    const live = h('div', { class: 'msg assistant' }, h('div', { class: 'md typing' }, h('span', { class: 'dots' }, '•••'), h('span', { class: 'muted small' }, ' Yanıt hazırlanıyor… (lokal modelde ilk kelime 10–30 sn sürebilir)')));
    log.append(live); live.scrollIntoView({ block: 'end' });
    chatAbort = new AbortController();
    put(sendBtn, icon('pause', 18)); sendBtn.setAttribute('aria-label', 'Durdur');
    try {
      const history = (await db.messages.where('notebookId').equals(nb.id).sortBy('createdAt')).slice(0, -1);
      let last = 0;
      const r = await answer(nb.id, history, q, { signal: chatAbort.signal, onToken: (_, all) => { if (Date.now() - last > 80) { last = Date.now(); live.firstChild.replaceWith(renderMarkdown(all.replace(/<think>[\s\S]*?(<\/think>|$)/g, ''))); } } });
      const am = { notebookId: nb.id, role: 'assistant', content: r.text, refs: r.refs, grounding: r.grounding, createdAt: now() };
      am.id = await db.messages.add(am);
      live.replaceWith(msgEl(am));
      touchNotebook(nb.id);
    } catch (e) {
      live.replaceWith(h('div', { class: 'msg error' }, e.name === 'AbortError' ? 'Durduruldu.' : connectionHelp(e)));
    }
    chatAbort = null; put(sendBtn, icon('send', 18)); sendBtn.setAttribute('aria-label', 'Gönder');
    log.lastChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }
  put(pane, 
    h('div', { class: 'pane-head' }, h('h2', {}, 'Sohbet'), h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Sohbeti sil', title: 'Tüm sohbeti sil', onclick: async () => {
        if (!(await db.messages.where('notebookId').equals(nb.id).count())) return toast('Silinecek sohbet yok.');
        if (await confirmBox('Tüm sohbet silinsin mi?', 'Bu defterdeki bütün sohbet mesajları kalıcı olarak silinir; kaynaklar ve Studio içerikleri kalır.', 'Sohbeti sil')) { chatAbort?.abort(); await db.messages.where('notebookId').equals(nb.id).delete(); renderChat(); toast('Sohbet silindi'); }
      } }, icon('trash', 18))),
    log,
    h('div', { class: 'composer' }, input, h('span', { class: 'src-count muted small' }, srcCount + ' kaynak'), sendBtn),
    h('p', { class: 'disclaimer muted small' }, 'Yapay zeka hata yapabilir; yanıtları kaynak numaralarından doğrulayın.'));
  pane._send = send;
  requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
}
export function askInChat(text) {
  closeViewer();
  state.pane = 'chat'; const nbEl = document.querySelector('.nb'); if (nbEl) nbEl.dataset.pane = 'chat';
  document.getElementById('chat')?._send?.(text);
}

async function paintSummary(box, nb, regenerate) {
  if (nb.summary && !regenerate) return drawSummary(box, nb.summary);
  if (!(await enabledSources(nb.id)).length) return;
  const st = await checkLLM();
  if (!st.ok) { put(box, h('div', { class: 'card muted small' }, 'Özet ve öneri soruları için model bağlantısı gerekli. ', h('button', { class: 'link', onclick: () => connectionModal(st.error) }, 'Bağlantıyı kur'))); return; }
  put(box, h('div', { class: 'card muted small' }, 'Kaynak özeti hazırlanıyor…'));
  try {
    const r = await suggestQuestions(nb.id);
    await db.notebooks.update(nb.id, { summary: r });
    drawSummary(box, r);
  } catch (e) { put(box, h('div', { class: 'card muted small' }, 'Özet için model bağlantısı gerekli. ', h('button', { class: 'link', onclick: openSettings }, 'Ayarları açın'))); }
}
function drawSummary(box, r) {
  put(box, h('div', { class: 'card summary' }, h('p', {}, r.summary),
    h('div', { class: 'row gap wrap' }, (r.questions || []).map((q) => h('button', { class: 'chip', onclick: () => document.getElementById('chat')._send(q) }, q)))));
}

function msgEl(m) {
  if (m.role === 'user') return h('div', { class: 'msg user' }, m.content);
  const g = m.grounding;
  return h('div', { class: 'msg assistant' }, renderMarkdown(m.content, m.refs || []),
    h('div', { class: 'msg-actions' },
      g?.total ? h('span', { class: 'chip ' + (g.pct >= 90 ? 'ok-chip' : 'warn-chip'), title: `${g.total} bilgi cümlesinin ${g.cited} tanesi kaynak numarası taşıyor` }, g.pct >= 90 ? '✓ kaynaklı' : `⚠ %${g.pct} kaynaklı`) : null,
      h('button', { class: 'btn ghost small', onclick: async () => { await createNote(m.content.split('\n')[0].replace(/[#*]/g, '').slice(0, 60) || 'Sohbet notu', m.content, m.refs); toast('Notlara kaydedildi'); } }, icon('note', 15), ' Notlara kaydet'),
      h('button', { class: 'icon-btn small', 'aria-label': 'Kopyala', onclick: () => { navigator.clipboard.writeText(m.content); toast('Kopyalandı'); } }, icon('copy', 15)),
      h('button', { class: 'icon-btn small', 'aria-label': 'Sil', onclick: async (e) => { await db.messages.delete(m.id); e.target.closest('.msg').remove(); } }, icon('trash', 15))));
}

// ---------- Model bağlantısı: önceden kontrol ve kurulum yardımcısı ----------
let connCache = { at: 0, ok: false, error: '' };
const isNetErr = (m) => /Failed to fetch|NetworkError|Load failed|CORS|ERR_/i.test(String(m));
async function checkLLM(force = false) {
  if (!force && Date.now() - connCache.at < 60000) return connCache;
  const cfg = await loadConfig();
  try {
    if (!cfg.model) throw new Error('Model seçilmedi.');
    if (cfg.provider !== 'anthropic') await listModels(cfg);
    connCache = { at: Date.now(), ok: true, error: '' };
  } catch (e) { connCache = { at: Date.now(), ok: false, error: String(e.message || e) }; }
  return connCache;
}
const OLLAMA_PS = `$o = "${location.origin}"
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", $o, "User")
$env:OLLAMA_ORIGINS = $o
Get-Process "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Start-Process "$env:LOCALAPPDATA\\Programs\\Ollama\\ollama app.exe"`;
const OLLAMA_SERVE = `$env:OLLAMA_ORIGINS = "${location.origin}"; ollama serve`;
// Ollama çalışıyor mu, yoksa çalışıp bu siteyi mi reddediyor? (no-cors isteği CORS'tan bağımsız ulaşır)
async function probeOllama(base) {
  try { await fetch(base.replace(/\/$/, '') + '/api/version', { mode: 'no-cors' }); return 'blocked'; } catch { return 'down'; }
}
let connOpen = false;
async function connectionModal(err) {
  if (connOpen) return; connOpen = true;
  const cfg = await loadConfig();
  const out = h('div', { class: 'small', role: 'status' });
  const copy = (txt) => h('button', { class: 'btn ghost small', onclick: () => { navigator.clipboard.writeText(txt).then(() => toast('Kopyalandı'), () => toast('Kopyalanamadı; metni seçip kopyalayın', 'error')); } }, icon('copy', 15), ' Kopyala');
  const gKey = h('input', { class: 'input', type: 'password', placeholder: 'Gemini API anahtarı (aistudio.google.com › Get API key)', autocomplete: 'off' });
  const isOllama = cfg.provider === 'ollama';
  const probe = isOllama ? await probeOllama(cfg.baseUrl || 'http://localhost:11434') : null;
  const diag = probe === 'blocked'
    ? h('div', { class: 'card diag warn' }, h('b', {}, 'Ollama çalışıyor ama bu siteyi engelliyor. '), 'İzin ayarı Ollama’ya ulaşmamış. Sık neden: ayarı yaptıktan sonra Ollama aynı pencereden başlatılınca yeni ayarı görmez. Aşağıdaki komut bunu da düzeltir.')
    : probe === 'down' ? h('div', { class: 'card diag no' }, h('b', {}, 'Ollama’ya ulaşılamıyor. '), 'Ollama kapalı olabilir ya da Chrome yerel ağ erişimine izin vermemiş olabilir.') : null;
  const body = h('div', { class: 'conn' },
    h('p', {}, h('b', {}, 'Yapay zeka modeline bağlanılamadı. '), h('span', { class: 'muted' }, err ? String(err).slice(0, 160) : '')),
    diag,
    isOllama ? h('div', { class: 'card' },
      h('h3', {}, 'Bilgisayarınızdaki Ollama’yı bağlayın (ücretsiz)'),
      h('ol', { class: 'conn-steps' },
        h('li', {}, 'Ollama kurulu ve açık olmalı: ', h('a', { href: 'https://ollama.com/download', target: '_blank', rel: 'noopener' }, 'ollama.com/download'), '. Kontrol: ', h('a', { href: 'http://localhost:11434', target: '_blank', rel: 'noopener' }, 'localhost:11434'), ' sayfasında "Ollama is running" yazmalı.'),
        h('li', {}, 'Bu siteye izin verin. PowerShell’i (yönetici olmasına gerek yok) açıp bu 6 satırı yapıştırın ve Enter’a basın:',
          h('pre', { class: 'src-text' }, OLLAMA_PS), copy(OLLAMA_PS),
          h('div', { class: 'muted small' }, 'Ya da ', h('a', { href: 'https://github.com/aseydaaksakal/defter-studio/raw/main/tools/ollama-baglan.bat' }, 'ollama-baglan.bat'), ' dosyasını indirip çift tıklayın.')),
        h('li', {}, 'Hâlâ olmazsa: görev çubuğundaki Ollama simgesine sağ tıklayıp ', h('b', {}, 'Quit'), ' deyin, sonra PowerShell’de şunu çalıştırın ve pencereyi açık bırakın:',
          h('pre', { class: 'src-text' }, OLLAMA_SERVE), copy(OLLAMA_SERVE)),
        h('li', {}, `Model indirilmiş olmalı: `, h('code', {}, `ollama pull ${cfg.model || 'qwen3.8:27b'}`), ' ', copy(`ollama pull ${cfg.model || 'qwen3.8:27b'}`)),
        h('li', {}, 'Chrome "yerel ağ erişimi" izni sorarsa İzin ver deyin.'),
        h('li', {}, h('b', {}, 'Ayarsız yol: '), 'depodaki ', h('code', {}, 'server/baslat.bat'), ' dosyasını çalıştırın; uygulama ', h('a', { href: 'http://localhost:8765/', target: '_blank', rel: 'noopener' }, 'localhost:8765'), ' adresinde açılır. Bu adreste Ollama izin ayarı gerekmez, verileriniz için yeni bir defter alanı kullanılır (yedekle / içe aktar ile taşıyabilirsiniz).'))) : null,
    h('div', { class: 'card' }, h('h3', {}, 'Ya da hemen buluta geçin: Gemini (ücretsiz kota)'),
      h('p', { class: 'muted small' }, 'Anahtar yalnız bu tarayıcıda saklanır. Aynı anahtar doğal Türkçe çok sesli seslendirme için de kullanılır.'),
      h('div', { class: 'row gap' }, gKey, h('button', { class: 'btn primary', onclick: async () => {
        const key = gKey.value.trim(); if (!key) return;
        out.textContent = 'Gemini modelleri alınıyor…';
        try {
          const base = PROVIDERS.gemini.baseUrl;
          const ms = await listModels({ provider: 'gemini', baseUrl: base, apiKey: key });
          const pick = ms.filter((m) => /flash/.test(m) && !/tts|image|embed|audio|live|lite/.test(m)).sort().pop() || ms.find((m) => /gemini/.test(m));
          await saveConfig({ ...cfg, provider: 'gemini', baseUrl: base, apiKey: key, model: pick, embedModel: '' });
          connCache.at = 0; out.textContent = '✓ Gemini bağlandı: ' + pick; updateStatus(); toast('Gemini bağlandı', 'ok');
        } catch (e) { out.textContent = '✗ ' + e.message; }
      } }, 'Gemini’ye geç'))),
    out);
  modal({ title: 'Model bağlantısı', wide: true, body, onClose: () => (connOpen = false), actions: [
    { label: 'Ayarlar', run: (c) => { c(); openSettings(); } },
    { label: 'Tekrar dene', primary: true, run: async (c) => { const r = await checkLLM(true); if (r.ok) { c(); toast('Bağlantı kuruldu', 'ok'); renderChat(true); } else out.textContent = '✗ Hâlâ bağlanılamıyor: ' + r.error; } }] });
}

function connectionHelp(e) {
  const msg = String(e.message || e);
  const isNet = /Failed to fetch|NetworkError|Load failed/i.test(msg);
  return h('div', {}, h('b', {}, 'Model yanıt vermedi. '), msg,
    isNet ? h('div', { class: 'small' }, 'Tarayıcı modele ulaşamadı. ', h('button', { class: 'link', onclick: () => connectionModal(msg) }, 'Bağlantı yardımcısını aç')) : null);
}

async function createNote(title, markdown, refs = []) {
  await db.artifacts.add({ notebookId: state.nb.id, type: 'note', title, status: 'done', content: { markdown, refs }, createdAt: now(), updatedAt: now() });
  renderStudio();
}

// ---------- Studio ----------
async function renderStudio() {
  const pane = document.getElementById('studio'); if (!pane) return;
  const arts = await db.artifacts.where('notebookId').equals(state.nb.id).reverse().sortBy('createdAt');
  put(pane, 
    h('div', { class: 'pane-head' }, h('h2', {}, 'Studio')),
    arts.filter((a) => a.status === 'error').length > 1 ? h('div', { class: 'row gap wrap err-bar' },
      h('span', { class: 'grow small' }, `${arts.filter((a) => a.status === 'error').length} içerik üretilemedi`),
      h('button', { class: 'btn ghost small', onclick: async () => { const st = await checkLLM(true); if (!st.ok) return connectionModal(st.error); for (const a of arts.filter((x) => x.status === 'error')) runJob(a.id); } }, icon('refresh', 15), ' Tümünü yeniden dene'),
      h('button', { class: 'btn ghost small', onclick: async () => { for (const a of arts.filter((x) => x.status === 'error')) await deleteArtifact(a.id); renderStudio(); } }, icon('trash', 15), ' Hatalıları sil')) : null,
    h('div', { class: 'tiles' }, Object.entries(TOOLS).map(([k, t]) => h('button', { class: 'tile t-' + k, onclick: () => openCustomize(k) }, icon(t.icon), h('span', {}, t.label)))),
    bankCard(state.nb.id, { open: (id) => { renderStudio(); location.hash = `#/n/${state.nb.id}/a/${id}`; } }),
    arts.length ? h('div', { class: 'row gap art-tools' }, h('span', { class: 'muted small grow' }, `${arts.length} içerik`),
      h('button', { class: 'icon-btn', 'aria-label': 'Tüm içerikleri sil', title: 'Üretilen tüm içerikleri sil', onclick: async () => {
        if (!(await confirmBox('Üretilen tüm içerikler silinsin mi?', `Bu defterdeki ${arts.length} Studio içeriği (podcast, slayt, video, test, kart…), sürümleri ve ses dosyaları kalıcı olarak silinir. Kaynaklar, sohbet ve soru bankası kalır.`, 'Hepsini sil'))) return;
        for (const a of arts) { aborts[a.id]?.abort(); await deleteArtifact(a.id); }
        closeViewer(); renderStudio(); toast('Tüm içerikler silindi');
      } }, icon('trash', 18))) : null,
    h('div', { class: 'art-list', role: 'list' }, arts.map(artRow)),
    !arts.length ? h('div', { class: 'empty small muted' }, 'Studio çıktıları burada listelenir. Bir araç seçerek başlayın; tüm geçmiş içerikler burada saklanır, açılır, düzenlenir ve silinir.') : null,
    h('button', { class: 'btn note-btn', onclick: async () => { const t = await promptBox('Not başlığı', 'Yeni not'); if (t) { await createNote(t, ''); const a = await db.artifacts.where('notebookId').equals(state.nb.id).last(); location.hash = `#/n/${state.nb.id}/a/${a.id}`; } } }, icon('note', 16), ' Not ekle'));
}

function artRow(a) {
  const meta = `${a.sourceTitles?.length ?? '—'} kaynak · ${timeAgo(a.createdAt)}`;
  if (a.status === 'error') {
    return h('div', { class: 'art-row error', role: 'listitem' }, h('span', { class: 'art-ic' }, '!'),
      h('div', { class: 'art-main' }, h('div', { class: 'art-title' }, `${TYPE_LABEL[a.type]} üretilemedi`), h('div', { class: 'muted small', title: a.error }, a.error?.slice(0, 120))),
      h('button', { class: 'btn ghost small', onclick: async () => { const st = await checkLLM(true); if (!st.ok) return connectionModal(st.error); runJob(a.id); } }, 'Yeniden dene'),
      h('button', { class: 'btn ghost small', onclick: async () => { await deleteArtifact(a.id); renderStudio(); } }, 'Sil'));
  }
  if (a.status === 'running' || a.status === 'queued') {
    return h('div', { class: 'art-row running', role: 'listitem' }, h('span', { class: 'art-ic spin' }, icon(TYPE_ICON[a.type])),
      h('div', { class: 'art-main' }, h('div', { class: 'art-title' }, `${TYPE_LABEL[a.type]} oluşturuluyor…`), h('div', { class: 'muted small' }, a.status === 'queued' ? 'Sırada bekliyor' : a.progress || 'Çalışıyor')),
      h('button', { class: 'btn ghost small', onclick: () => cancelJob(a.id) }, 'İptal'));
  }
  return h('div', { class: 'art-row', role: 'listitem', tabindex: 0, onclick: () => (location.hash = `#/n/${state.nb.id}/a/${a.id}`), onkeydown: (e) => e.key === 'Enter' && (location.hash = `#/n/${state.nb.id}/a/${a.id}`) },
    h('span', { class: 'art-ic t-' + a.type }, icon(TYPE_ICON[a.type])),
    h('div', { class: 'art-main' }, h('div', { class: 'art-title' }, a.title), h('div', { class: 'muted small' }, TYPE_LABEL[a.type] + ' · ' + meta)),
    a.type === 'podcast' ? h('button', { class: 'icon-btn small', 'aria-label': 'Dinle', onclick: (e) => { e.stopPropagation(); location.hash = `#/n/${state.nb.id}/a/${a.id}`; } }, icon('play', 16)) : null,
    h('button', { class: 'icon-btn small', 'aria-label': 'Diğer işlemler', onclick: (e) => { e.stopPropagation(); artMenu(a, e.currentTarget); } }, icon('more', 18)));
}

function artMenu(a, anchor) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const item = (label, ic, run, danger) => h('button', { class: 'menu-i' + (danger ? ' danger' : ''), onclick: () => { menu.remove(); run(); } }, icon(ic, 16), ' ', label);
  const menu = h('div', { class: 'menu', role: 'menu' },
    item('Aç', 'expand', () => (location.hash = `#/n/${state.nb.id}/a/${a.id}`)),
    item('Yeniden adlandır', 'edit', async () => { const t = await promptBox('Yeni ad', a.title); if (t) { await db.artifacts.update(a.id, { title: t }); renderStudio(); } }),
    item('Sürüm geçmişi', 'history', () => openVersions(a.id)),
    a.type !== 'note' ? item('Aynı ayarlarla yeniden üret', 'refresh', () => regenerate(a.id)) : null,
    item('Metin olarak indir', 'download', () => download(slug(a.title) + '.md', VIEWS[a.type].toText(a), 'text/markdown')),
    item('JSON indir', 'download', () => download(slug(a.title) + '.json', JSON.stringify(a, null, 2), 'application/json')),
    item('Sil', 'trash', async () => { if (await confirmBox('Silinsin mi?', `"${a.title}" ve tüm sürümleri silinecek.`)) { await deleteArtifact(a.id); renderStudio(); } }, true));
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 4) + 'px';
  menu.style.left = Math.max(8, r.right - menu.offsetWidth) + 'px';
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function openCustomize(type, preset = {}) {
  const t = TOOLS[type];
  const vals = {};
  getSetting('lastOpts:' + type, {}).then(async (last) => {
    const lang = await getSetting('lang', 'Türkçe');
    const srcs = await enabledSources(state.nb.id);
    const body = h('div', { class: 'cust' });
    const roster = type === 'podcast' ? (await loadTTS()).cast || [] : [];
    for (const o of t.options) {
      vals[o.key] = preset[o.key] ?? last[o.key] ?? (o.type === 'lang' ? lang : o.default ?? '');
      if (type === 'podcast' && o.key === 'voices' && roster.length >= 2 && !preset[o.key] && (last[o.key] == null || last[o.key] === 'fm')) vals[o.key] = 'cast'; // Ses stüdyosunda karakter kurulduysa varsayılan onlar
      if (o.type === 'cards') {
        const wrap = h('div', { class: 'opt-cards', role: 'radiogroup', 'aria-label': o.label });
        const paint = () => wrap.querySelectorAll('.opt-card').forEach((c) => { c.classList.toggle('on', c.dataset.v === vals[o.key]); c.setAttribute('aria-checked', String(c.dataset.v === vals[o.key])); });
        o.choices.forEach((c) => wrap.append(h('button', { class: 'opt-card', role: 'radio', 'data-v': c.v, onclick: () => { vals[o.key] = c.v; paint(); } }, h('b', {}, c.t), h('span', {}, c.d))));
        paint(); body.append(h('div', { class: 'field' }, h('label', {}, o.label), wrap));
      } else if (o.type === 'seg') {
        const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': o.label });
        const paint = () => wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === vals[o.key]));
        o.choices.forEach((c) => wrap.append(h('button', { 'data-v': c.v, onclick: () => { vals[o.key] = c.v; paint(); } }, c.t)));
        paint(); body.append(h('div', { class: 'field inline' }, h('label', {}, o.label), wrap));
      } else if (o.type === 'select') {
        body.append(h('div', { class: 'field inline' }, h('label', {}, o.label), h('select', { class: 'input', onchange: (e) => (vals[o.key] = e.target.value) }, o.choices.map((c) => h('option', { value: c.v, selected: c.v === vals[o.key] ? true : null }, c.t)))));
      } else if (o.type === 'count') {
        if (!(parseInt(vals[o.key], 10) > 0)) vals[o.key] = o.default; // eski 'few/std/more' kayıtları
        const num = h('input', { class: 'input count-in', type: 'number', min: o.min || 1, max: o.max || 200, value: vals[o.key], 'aria-label': o.label });
        const wrap = h('div', { class: 'seg' });
        const est = h('span', { class: 'muted small' });
        const paint = () => { wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === +vals[o.key])); est.textContent = +vals[o.key] > 20 ? `≈ ${Math.ceil(+vals[o.key] / 8)} parti hâlinde üretilir; arka planda çalışır, sayfayı kullanmaya devam edebilirsiniz.` : ''; };
        o.choices.forEach((c) => wrap.append(h('button', { 'data-v': c, onclick: () => { vals[o.key] = c; num.value = c; paint(); } }, String(c))));
        num.oninput = () => { const n = parseInt(num.value, 10); if (n > 0) vals[o.key] = Math.max(o.min || 1, Math.min(o.max || 200, n)); paint(); };
        num.onchange = () => { num.value = vals[o.key]; };
        paint(); body.append(h('div', { class: 'field inline' }, h('label', {}, o.label), h('div', { class: 'row gap wrap' }, wrap, num)), est);
      } else if (o.type === 'lang') {
        body.append(h('div', { class: 'field inline' }, h('label', {}, o.label), h('select', { class: 'input', onchange: (e) => (vals[o.key] = e.target.value) }, LANGS.map((l) => h('option', { selected: l === vals[o.key] ? true : null }, l)))));
      } else {
        const ta = h('textarea', { class: 'input', rows: 3, placeholder: o.placeholder, oninput: (e) => (vals[o.key] = e.target.value) }, vals[o.key] || '');
        body.append(h('div', { class: 'field' }, h('label', {}, o.label), ta));
      }
    }
    body.append(h('p', { class: 'muted small' }, `Kaynaklar: ${srcs.length} seçili kaynak (${srcs.map((s) => s.title).join(', ').slice(0, 160) || '—'})`));
    modal({ title: t.title, wide: true, body, actions: [
      { label: 'Vazgeç', run: (c) => c() },
      { label: 'Hemen oluştur', primary: true, run: async (c) => {
        if (!srcs.length) { toast('Önce en az bir kaynak seçin.', 'error'); return; }
        const st = t.noLLM ? { ok: true } : await checkLLM();
        if (!st.ok) { c(); connectionModal(st.error); return; }
        c();
        const { focus, ...keep } = vals; await setSetting('lastOpts:' + type, keep);
        if (vals.lang) await setSetting('lang', vals.lang);
        const id = await db.artifacts.add({ notebookId: state.nb.id, type, title: t.label, status: 'queued', owner: TAB, options: { ...vals }, sourceIds: srcs.map((s) => s.id), sourceTitles: srcs.map((s) => s.title), createdAt: now(), updatedAt: now() });
        renderStudio(); runJob(id);
      } }] });
  });
}

// İş kuyruğu: lokal GPU'yu boğmamak için üretimler sırayla çalışır
let queue = Promise.resolve();
const aborts = {};
function runJob(id) {
  db.artifacts.update(id, { status: 'queued', error: null, owner: TAB }).then(renderStudio);
  queue = queue.then(() => doJob(id)).catch(() => {});
  return queue;
}
async function doJob(id) {
  const a = await db.artifacts.get(id);
  if (!a || a.status !== 'queued' || ownedElsewhere(a.owner)) return;
  aborts[id] = new AbortController();
  await db.artifacts.update(id, { status: 'running', progress: 'Kaynaklar okunuyor…' }); renderStudio();
  let lastPaint = 0;
  const progress = async (p) => { await db.artifacts.update(id, { progress: p }); if (state.nb?.id === a.notebookId) renderStudio(); };
  try {
    const r = await TOOLS[a.type].generate(a.notebookId, a.options, { signal: aborts[id].signal, progress,
      onToken: (_, all) => { if (Date.now() - lastPaint > 1500) { lastPaint = Date.now(); progress(`Yazılıyor… ${all.length.toLocaleString('tr')} karakter`); } } });
    if (IMAGE_TOOLS.has(a.type)) { // içerik hazır: kaynakla ilgili yapay zeka görsellerini üret (kapalıysa ya da sağlayıcı yoksa atlanır; hata içeriği bozmaz)
      await progress('Görseller üretiliyor…');
      const ir = await autoIllustrate(a.type, r.content, { signal: aborts[id].signal, onProgress: (d, n) => progress(`Görseller üretiliyor ${d}/${n}`) });
      if (ir?.failed) toast(`${ir.failed} görsel üretilemedi: ${ir.errors[0]}. Görüntüleyicide "Görselleri üret" ile yeniden deneyebilirsiniz.`, 'error', 8000);
    }
    const prev = await db.artifacts.get(id);
    if (prev.content) await db.versions.add({ artifactId: id, content: prev.content, title: prev.title, note: 'Yeniden üretimden önceki sürüm', createdAt: prev.updatedAt });
    if (a.type === 'podcast') { // senaryo hazır: doğal sesi de şimdi üret (hata olursa oynatıcı tarayıcı sesine düşer)
      await db.artifacts.update(id, { content: r.content, title: r.title });
      try { await synthesize(id, r.content.lines, r.content.speakers, r.content.lang, { format: r.content.format, onProgress: progress }); }
      catch (e) { toast('Ses dosyası üretilemedi: ' + e.message, 'error', 6000); }
    }
    await db.artifacts.update(id, { status: 'done', title: r.title, content: r.content, updatedAt: now(), progress: null, versionNote: 'Üretildi' });
    toast(`${TYPE_LABEL[a.type]} hazır: ${r.title}`, 'ok');
    notify(`${TYPE_LABEL[a.type]} hazır`, r.title);
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'İptal edildi.' : String(e.message || e);
    await db.artifacts.update(id, { status: 'error', error: isNetErr(msg) ? 'Modele bağlanılamadı. Bağlantıyı kurup "Yeniden dene"ye basın.' : msg });
    if (isNetErr(msg)) {
      connCache = { at: Date.now(), ok: false, error: msg };
      await db.artifacts.where('status').equals('queued').modify({ status: 'error', error: 'Modele bağlanılamadı; sırada bekleyen iş durduruldu.' });
      connectionModal(msg);
    }
  }
  delete aborts[id];
  if (state.nb?.id === a.notebookId) renderStudio();
}
async function cancelJob(id) { aborts[id]?.abort(); await db.artifacts.update(id, { status: 'error', error: 'İptal edildi.' }); renderStudio(); }
async function regenerate(id, extra = {}) {
  const a = await db.artifacts.get(id);
  await db.artifacts.update(id, { options: { ...a.options, ...extra }, status: 'queued' });
  if (state.viewer === id) closeViewer();
  runJob(id);
}
function notify(title, body) { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); }

// ---------- Görüntüleyici ----------
async function openViewer(id) {
  const a = await db.artifacts.get(id);
  const v = document.getElementById('viewer');
  if (!a || !v) return;
  if (a.status !== 'done') { toast('Bu içerik henüz hazır değil.'); location.hash = '#/n/' + state.nb.id; return; }
  state.cleanup?.(); state.viewer = id;
  const body = h('div', { class: 'viewer-body' });
  const info = h('div', { class: 'card small', hidden: true },
    h('div', {}, h('b', {}, 'Ayarlar: '), Object.entries(a.options || {}).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join(' · ') || '—'),
    h('div', {}, h('b', {}, 'Kaynaklar: '), (a.sourceTitles || []).join(', ') || '—'));
  const rate = (r) => h('button', { class: 'btn ghost small' + (a.rating === r ? ' on' : ''), onclick: async (e) => { await db.artifacts.update(id, { rating: r }); e.currentTarget.classList.add('on'); toast('Geri bildirim kaydedildi'); } }, r === 1 ? '👍 İyi içerik' : '👎 Kötü içerik');
  put(v, 
    h('div', { class: 'viewer-head' },
      h('div', { class: 'crumb muted' }, h('button', { class: 'link', onclick: () => closeViewer() }, 'Studio'), ' › ', TYPE_LABEL[a.type]),
      h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Sürüm geçmişi', title: 'Sürüm geçmişi', onclick: () => openVersions(id) }, icon('history')),
      a.type !== 'note' ? h('button', { class: 'icon-btn', 'aria-label': 'Yeniden üret', title: 'Yeniden üret', onclick: () => regenerate(id) }, icon('refresh')) : null,
      h('button', { class: 'icon-btn', 'aria-label': 'Diğer', onclick: (e) => artMenu(a, e.currentTarget) }, icon('more')),
      h('button', { class: 'icon-btn', 'aria-label': 'Tam ekran', onclick: () => v.classList.toggle('full') }, icon('expand')),
      h('button', { class: 'icon-btn', 'aria-label': 'Kapat', onclick: () => closeViewer() }, icon('close'))),
    h('div', { class: 'viewer-title' },
      h('h2', { contenteditable: 'true', spellcheck: 'false', onblur: async (e) => { await db.artifacts.update(id, { title: e.target.innerText.trim() }); renderStudio(); } }, a.title),
      a.type !== 'note' ? h('button', { class: 'chip', onclick: () => (info.hidden = !info.hidden) }, `İstemi ve ${a.sourceTitles?.length || 0} kaynağı göster`) : null),
    info, body,
    a.type !== 'note' ? h('div', { class: 'viewer-foot' }, rate(1), rate(-1), h('span', { class: 'muted small' }, `Son değişiklik ${timeAgo(a.updatedAt)}`)) : null);
  v.hidden = false; document.querySelector('.nb')?.classList.add('viewing');
  if (a.type === 'note') renderNoteEditor(body, a);
  else state.cleanup = VIEWS[a.type].render(body, a, viewerApi(a)) || null;
}

function viewerApi(a) {
  return {
    save: async (content, note) => { if (note) await saveArtifactContent(a.id, content, note); else await db.artifacts.update(a.id, { content, updatedAt: now() }); a.content = content; },
    ask: (text) => askInChat(text),
    regenerate: (extra) => regenerate(a.id, extra),
    editJSON: () => editJSON(a),
    reopen: () => openViewer(a.id),
    openSettings: () => openSettings(),
    openVoiceStudio: (o) => openVoiceStudio(o),
    renderEmbedded: async (id, box) => {
      const e = await db.artifacts.get(id);
      if (!e || e.status !== 'done') { box.append(h('p', { class: 'muted' }, 'Gömülü içerik bulunamadı.')); return; }
      box.append(h('div', { class: 'muted small' }, TYPE_LABEL[e.type] + ' · ' + e.title));
      VIEWS[e.type].render(box, e, viewerApi(e));
    },
    pickArtifact: () => new Promise(async (res) => {
      const list = (await db.artifacts.where('notebookId').equals(a.notebookId).toArray()).filter((x) => x.status === 'done' && x.id !== a.id && !['podcast', 'video', 'report'].includes(x.type));
      let done = false;
      modal({ title: 'Gömülecek Studio içeriği', onClose: () => !done && res(null), body: list.length ? h('div', { class: 'pick' }, list.map((x) => h('button', { class: 'art-row', onclick: (e) => { done = true; res(x.id); e.target.closest('.modal-back').remove(); } }, h('span', { class: 'art-ic t-' + x.type }, icon(TYPE_ICON[x.type])), h('span', {}, x.title, h('br'), h('small', { class: 'muted' }, TYPE_LABEL[x.type]))))) : h('p', {}, 'Gömülebilecek içerik yok (test, kart, zihin haritası, tablo, infografik, slayt).') });
    })
  };
}

function renderNoteEditor(body, a) {
  const ta = h('textarea', { class: 'input md-edit', placeholder: 'Notunuzu Markdown ile yazın…' }, a.content.markdown || '');
  const prev = h('div', { class: 'note-prev' }, renderMarkdown(a.content.markdown || '', a.content.refs || []));
  let editing = !a.content.markdown;
  const toggle = h('button', { class: 'btn ghost small' });
  const paint = () => { ta.hidden = !editing; prev.hidden = editing; put(toggle, icon(editing ? 'check' : 'edit', 16), editing ? ' Kaydet' : ' Düzenle'); };
  toggle.onclick = async () => {
    if (editing) { await saveArtifactContent(a.id, { ...a.content, markdown: ta.value }, 'Not düzenlendi'); a.content.markdown = ta.value; put(prev, renderMarkdown(ta.value, a.content.refs || [])); }
    editing = !editing; paint();
  };
  body.append(h('div', { class: 'row gap' }, h('span', { class: 'grow' }), toggle,
    h('button', { class: 'btn ghost small', onclick: async () => { await db.sources.add({ notebookId: a.notebookId, title: a.title, kind: 'text', text: ta.value, chars: ta.value.length, enabled: 1, createdAt: now() }).then((sid) => chunkText(a.notebookId, sid, ta.value)); renderSources(); toast('Not kaynak olarak eklendi'); } }, icon('plus', 16), ' Kaynağa dönüştür')), ta, prev);
  paint();
}

function closeViewer(nav = true) {
  state.cleanup?.(); state.cleanup = null; state.viewer = null;
  const v = document.getElementById('viewer'); if (v) { v.hidden = true; v.classList.remove('full'); put(v, ); }
  document.querySelector('.nb')?.classList.remove('viewing');
  if (nav && state.nb && /\/a\//.test(location.hash)) location.hash = '#/n/' + state.nb.id;
}

async function openVersions(id) {
  const a = await db.artifacts.get(id);
  const vs = await db.versions.where('artifactId').equals(id).reverse().sortBy('createdAt');
  modal({ title: 'Sürüm geçmişi · ' + a.title, wide: true, body: h('div', { class: 'versions' },
    h('div', { class: 'ver cur' }, h('b', {}, 'Şu anki sürüm'), h('span', { class: 'muted small' }, ` ${a.versionNote || ''} · ${new Date(a.updatedAt).toLocaleString('tr')}`)),
    vs.length ? vs.map((v) => h('div', { class: 'ver' },
      h('div', { class: 'grow' }, h('b', {}, v.note || 'Sürüm'), h('div', { class: 'muted small' }, new Date(v.createdAt).toLocaleString('tr') + ' · ' + (v.title || ''))),
      h('button', { class: 'btn ghost small', onclick: () => modal({ title: 'Önizleme', wide: true, body: h('pre', { class: 'src-text' }, VIEWS[a.type].toText({ ...a, content: v.content })) }) }, 'Önizle'),
      h('button', { class: 'btn primary small', onclick: async (e) => {
        await saveArtifactContent(id, v.content, 'Eski sürüme dönüldü (' + new Date(v.createdAt).toLocaleString('tr') + ')');
        e.target.closest('.modal-back').remove(); toast('Sürüm geri yüklendi'); if (state.viewer === id) openViewer(id);
      } }, 'Bu sürüme dön'),
      h('button', { class: 'icon-btn small', 'aria-label': 'Sürümü sil', onclick: async (e) => { await db.versions.delete(v.id); e.target.closest('.ver').remove(); } }, icon('trash', 15)))) : h('p', { class: 'muted' }, 'Henüz eski sürüm yok. Her düzenleme ve yeniden üretimde önceki hâl burada saklanır.')) });
}

function editJSON(a) {
  const ta = h('textarea', { class: 'input code', spellcheck: 'false' }, JSON.stringify(a.content, null, 2));
  modal({ title: 'İçeriği düzenle (JSON)', wide: true, body: h('div', {}, h('p', { class: 'muted small' }, 'Metinleri doğrudan değiştirebilirsiniz. Kaydettiğinizde önceki hâl sürüm geçmişine eklenir.'), ta),
    actions: [{ label: 'Vazgeç', run: (c) => c() }, { label: 'Kaydet', primary: true, run: async (c) => {
      try { const j = JSON.parse(ta.value); await saveArtifactContent(a.id, j, 'Elle düzenlendi'); c(); openViewer(a.id); toast('Kaydedildi'); } catch (e) { toast('JSON hatalı: ' + e.message, 'error'); }
    } }] });
}

// ===================== Ayarlar =====================
async function openSettings() {
  const cfg = await loadConfig();
  const prov = h('select', { class: 'input' }, Object.entries(PROVIDERS).map(([k, p]) => h('option', { value: k, selected: k === cfg.provider ? true : null }, p.label)));
  const base = h('input', { class: 'input', value: cfg.baseUrl || '' });
  const key = h('input', { class: 'input', type: 'password', value: cfg.apiKey || '', placeholder: 'Gerekmiyorsa boş bırakın', autocomplete: 'off' });
  const model = h('input', { class: 'input', value: cfg.model || '', list: 'model-list', placeholder: 'Model adı' });
  const fastM = h('input', { class: 'input', value: cfg.fastModel || '', list: 'model-list', placeholder: 'İsteğe bağlı, örn. qwen3.5:9b' });
  const embedM = h('input', { class: 'input', value: cfg.embedModel || '', list: 'model-list', placeholder: 'İsteğe bağlı, örn. bge-m3 (anlamsal arama)' });
  const dl = h('datalist', { id: 'model-list' });
  const ctx = h('select', { class: 'input' }, [8192, 16384, 32768, 65536, 131072].map((n) => h('option', { value: n, selected: n === (cfg.numCtx || 32768) ? true : null }, (n / 1024) + 'K token')));
  const temp = h('input', { class: 'input', type: 'number', step: '0.1', min: 0, max: 1.5, value: cfg.temperature ?? 0.6 });
  const hint = h('p', { class: 'muted small' });
  const out = h('div', { class: 'small', role: 'status' });
  const srvIn = h('input', { class: 'input', value: await serverBase(), placeholder: 'http://localhost:8765' });
  const srvOut = h('div', { class: 'small' });
  const updOut = h('div', { class: 'small' });
  const showUpd = (u) => {
    if (!u) { updOut.textContent = 'Sunucuya ulaşılamadı.'; return; }
    if (u.error && !u.latest) { updOut.textContent = `Güncelleme denetlenemedi (internet?): ${u.error}`; return; }
    if (!u.available) { updOut.textContent = `✓ Sunucu güncel (${u.current}).`; return; }
    put(updOut, h('span', {}, `Yeni sürüm var: ${u.current} → ${u.latest} (${u.n} dosya${u.pip ? ', paketler' : ''}). `),
      h('button', { class: 'btn small', onclick: async () => {
        updOut.textContent = 'Güncelleniyor…';
        try {
          const r = await updateApply();
          if (r.hatalar?.length) { updOut.textContent = '⚠ ' + r.hatalar.join(' · '); return; }
          if (r.restart === 'auto') { updOut.textContent = `✓ ${r.yazilan.length} dosya yazıldı; sunucu yeniden başlıyor…`; setTimeout(async () => { await serverUrl(true); updateStatus(); updOut.textContent = '✓ Güncellendi ve yeniden başladı.'; }, 6000); }
          else if (r.restart === 'manual') updOut.textContent = `✓ ${r.yazilan.length} dosya yazıldı. Sunucu penceresini kapatıp yeniden açın (tools\\kur.bat ile kurduysanız kendiliğinden açılır).`;
          else updOut.textContent = '✓ Güncellendi (yeniden başlatma gerekmedi).';
        } catch (e) { updOut.textContent = 'Güncellenemedi: ' + e.message; }
      } }, 'Sunucuyu güncelle'));
  };
  const keyRow = h('div', { class: 'field' }, h('label', {}, 'API anahtarı'), key);
  const sync = () => { const p = PROVIDERS[prov.value]; hint.textContent = p.hint; keyRow.hidden = !p.needsKey && prov.value !== 'custom'; };
  prov.onchange = () => { const p = PROVIDERS[prov.value]; base.value = p.baseUrl; model.value = p.model; embedM.value = p.embedModel; sync(); };
  sync();
  const read = () => ({ provider: prov.value, baseUrl: base.value.trim(), apiKey: key.value.trim(), model: model.value.trim(), fastModel: fastM.value.trim(), embedModel: embedM.value.trim(), numCtx: +ctx.value, temperature: +temp.value });
  const vset = await voiceSettings();
  const ttsBlock = vset.el;
  const imgBlock = (await imageSettings()).el;
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const SITE = 'https://aseydaaksakal.github.io/defter-studio';
  const kurCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr ${SITE}/tools/kur.bat -OutFile $env:TEMP\\kur.bat; cmd /c $env:TEMP\\kur.bat"`;
  const kurOut = h('div', { class: 'small' });
  const kurBox = h('details', { class: 'vsec' }, h('summary', {}, 'İlk kurulum (bir kez) · güncelleme'),
    h('div', { class: 'stack vpad' },
      h('p', { class: 'small' }, 'Bilgisayarınıza yardımcı sunucuyu kurar (Python yoksa sorar), isterseniz açılışta arka planda başlatır. Kurulduktan sonra zip indirmek ya da bat çalıştırmak gerekmez: sunucu kendini günceller, burada “Sunucuyu güncelle” çıkar.'),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn primary small', onclick: async () => {
          kurOut.textContent = 'İndiriliyor…';
          try { const r = await fetch(`${SITE}/tools/kur.bat?t=${Date.now()}`); if (!r.ok) throw new Error('HTTP ' + r.status); download('kur.bat', new Blob([await r.blob()], { type: 'application/octet-stream' })); kurOut.textContent = 'kur.bat indirildi: Chrome “yaygın olmayan dosya” derse Sakla\'yı seçin, çift tıklayıp çalıştırın.'; } catch (e) { kurOut.textContent = '✗ ' + e.message; }
        } }, 'kur.bat dosyasını indir'),
        h('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(kurCmd); kurOut.textContent = 'Komut kopyalandı: Windows tuşu › “PowerShell” yazıp açın, yapıştırıp Enter’a basın (indirme uyarısı çıkmaz).'; } catch { kurOut.textContent = kurCmd; } } }, 'Tek satır komutu kopyala')),
      kurOut));
  modal({ title: 'Ayarlar', wide: true, body: h('div', { class: 'settings' },
    h('h3', {}, 'Bilgisayarım (RTX GPU)'),
    h('p', { class: 'muted small' }, 'Sesler, döküm ve görseller bilgisayarınızdaki sunucuda üretilir: ücretsiz ve sınırsız. Site Pages’ten açılsa da aynı sunucuya bağlanır; Chrome yerel ağ izni sorarsa İzin ver deyin.'),
    h('div', { class: 'row gap' }, srvIn, h('button', { class: 'btn primary small', onclick: async () => {
      if (!srvIn.value.trim()) srvIn.value = 'http://localhost:8765';
      await setServerBase(srvIn.value.trim()); const u = await serverUrl(true); const i = serverInfo();
      if (u) srvOut.textContent = `✓ Bağlandı · Ses: ${i?.tts?.engines?.filter((e) => e !== 'piper').join(', ') || 'motor kurulu değil'} · Döküm: ${i?.stt || '—'}`;
      else put(srvOut, h('div', { class: 'card stack small' }, h('b', {}, '✗ Sunucu bulunamadı: bilgisayarınızda yardımcı sunucu çalışmıyor.'),
        h('p', {}, 'Aşağıdaki “İlk kurulum” bölümünden kur.bat’ı bir kez çalıştırın. Zaten kurduysanız bilgisayarı yeniden başlatın ya da başlat menüsünden “Defter Studio” sunucusunu açın; sonra tekrar basın.')));
      updateStatus();
      if (u) updateCheck(true).then(showUpd).catch(() => {});
    } }, 'Bağlan / kontrol et')), srvOut, updOut, kurBox,
    h('h3', {}, 'Dil modeli'),
    h('div', { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, 'Sağlayıcı'), prov),
      h('div', { class: 'field' }, h('label', {}, 'Model'), h('div', { class: 'row gap' }, model, h('button', { class: 'btn ghost small', onclick: async () => {
        out.textContent = 'Modeller alınıyor…';
        try { const ms = await listModels(read()); put(dl, ...ms.map((m) => h('option', { value: m }))); out.textContent = `${ms.length} model bulundu. Model kutusuna tıklayıp seçebilirsiniz.`; } catch (e) { put(out, connectionHelp(e)); }
      } }, 'Listele'))),
      keyRow),
    h('details', { class: 'vsec' }, h('summary', {}, 'Gelişmiş model ayarları'),
      h('div', { class: 'grid2 vpad' },
        h('div', { class: 'field' }, h('label', {}, 'Adres (Base URL)'), base),
        h('div', { class: 'field' }, h('label', {}, 'Hızlı model (özet, öneri, plan)'), fastM),
        h('div', { class: 'field' }, h('label', {}, 'Embedding modeli'), embedM),
        h('div', { class: 'field' }, h('label', {}, 'Bağlam uzunluğu'), ctx),
        h('div', { class: 'field' }, h('label', {}, 'Sıcaklık (yaratıcılık)'), temp))),
    dl, hint,
    h('div', { class: 'row gap' }, h('button', { class: 'btn ghost', onclick: async () => {
      out.textContent = 'Deneniyor…';
      try { const t = await chat({ cfg: read(), messages: [{ role: 'user', content: 'Tek kelimeyle "hazır" yaz.' }] }); put(out, h('span', { class: 'ok-t' }, '✓ Bağlantı çalışıyor: '), t.slice(0, 80)); } catch (e) { put(out, connectionHelp(e)); }
    } }, 'Bağlantıyı test et'), out),
    ttsBlock,
    imgBlock,
    h('h3', {}, 'Veriler'),
    h('p', { class: 'muted small' }, 'Tüm defterler bu tarayıcının IndexedDB veritabanında saklanır. ', est ? `Kullanılan alan: ${(est.usage / 1048576).toFixed(1)} MB / ${(est.quota / 1073741824).toFixed(1)} GB.` : ''),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn ghost small', onclick: async () => { const p = await navigator.storage?.persist?.(); toast(p ? 'Kalıcı depolama açıldı' : 'Tarayıcı kalıcı depolamayı onaylamadı'); } }, 'Kalıcı depolama iste'),
      h('button', { class: 'btn ghost small', onclick: () => Notification?.requestPermission?.() }, 'Hazır olunca bildirim gönder'),
      h('button', { class: 'btn ghost small', onclick: async () => { await seedDemo(); toast('Örnek defter eklendi'); location.hash = '#/'; renderHome(); } }, 'Örnek defteri yeniden ekle'),
      h('button', { class: 'btn danger small', onclick: async () => { if (await confirmBox('Tüm veriler silinsin mi?', 'Bütün defterler, kaynaklar ve Studio içerikleri bu tarayıcıdan kalıcı olarak silinir.', 'Hepsini sil')) { await db.delete(); location.hash = '#/'; location.reload(); } } }, 'Tüm verileri sil'))),
  actions: [{ label: 'Vazgeç', run: (c) => c() }, { label: 'Kaydet', primary: true, run: async (c) => { await saveConfig(read()); await saveTTS({ ...(await loadTTS()), ...vset.read() }); c(); toast('Ayarlar kaydedildi'); updateStatus(); } }] });
}

boot().catch((e) => { console.error(e); put(app, h('pre', { class: 'fatal' }, 'Başlatılamadı: ' + e.message)); });
