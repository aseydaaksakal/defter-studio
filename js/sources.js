// Defter Studio — kaynak ekleme, metin çıkarma, parçalama ve arama (RAG)
import { db, now, touchNotebook } from './db.js';
import { embed, loadConfig } from './llm.js';
import * as pdfjs from './vendor/pdf.min.mjs';
import { serverUrl } from './server.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

// ---------- Metin çıkarma ----------
async function pdfToText(file, onProgress) {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let last = null, line = '';
    const lines = [];
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (last !== null && Math.abs(y - last) > 2) { lines.push(line); line = ''; }
      line += it.str + (it.hasEOL ? '' : '');
      last = y;
    }
    lines.push(line);
    pages.push(lines.join('\n').replace(/[ \t]+/g, ' ').trim());
    onProgress && onProgress(i / doc.numPages);
  }
  return { text: pages.map((p, i) => `[[s.${i + 1}]]\n${p}`).join('\n\n'), pages: doc.numPages };
}

async function docxToText(file) {
  if (!window.mammoth) {
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = new URL('./vendor/mammoth.browser.min.js', import.meta.url).href;
      s.onload = ok; s.onerror = fail; document.head.appendChild(s);
    });
  }
  const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { text: r.value };
}

function htmlToText(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,nav,footer,header,noscript').forEach((n) => n.remove());
  return (d.body?.innerText || d.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function fileToText(file, onProgress) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return { kind: 'pdf', ...(await pdfToText(file, onProgress)) };
  if (name.endsWith('.docx')) return { kind: 'docx', ...(await docxToText(file)) };
  if (name.endsWith('.html') || name.endsWith('.htm')) return { kind: 'web', text: htmlToText(await file.text()) };
  if (/\.(mp3|wav|m4a|ogg|webm|mp4|mkv|flac)$/.test(name)) return { kind: 'audio', text: await transcribe(file) };
  return { kind: 'text', text: await file.text() };
}

async function transcribe(file) {
  const base = await serverUrl();
  if (!base) throw new Error('Ses/video dökümü için lokal yardımcı sunucu gerekli (server/ klasörü).');
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(base + '/transcribe', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Döküm başarısız: ' + r.status);
  return (await r.json()).text;
}

export async function urlToText(url) {
  const base = await serverUrl();
  if (/youtube\.com|youtu\.be/.test(url)) {
    if (!base) throw new Error('YouTube dökümü için lokal yardımcı sunucu gerekli.');
    const r = await fetch(base + '/youtube?url=' + encodeURIComponent(url));
    if (!r.ok) throw new Error('YouTube dökümü alınamadı');
    const j = await r.json();
    return { kind: 'youtube', title: j.title, text: j.text };
  }
  if (base) {
    const r = await fetch(base + '/fetch?url=' + encodeURIComponent(url));
    if (r.ok) { const j = await r.json(); return { kind: 'web', title: j.title, text: j.text }; }
  }
  // Sunucu yoksa: ücretsiz okuyucu servisi (r.jina.ai) sayfayı düz metne çevirir
  const r = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'text/plain' } });
  if (!r.ok) throw new Error('Sayfa okunamadı (' + r.status + ')');
  const text = await r.text();
  const title = (text.match(/^Title:\s*(.+)$/m) || [])[1] || url;
  return { kind: 'web', title, text };
}

// ---------- Parçalama ----------
export function splitChunks(text, size = 1400, overlap = 200) {
  const paras = text.split(/\n{2,}/);
  const chunks = [];
  let cur = '', page = null, curPage = null;
  for (const p of paras) {
    const m = p.match(/^\[\[s\.(\d+)\]\]/);
    if (m) page = +m[1];
    const clean = p.replace(/^\[\[s\.\d+\]\]\n?/, '').trim();
    if (!clean) continue;
    if (cur && (cur.length + clean.length) > size) {
      chunks.push({ text: cur, page: curPage });
      cur = cur.slice(-overlap) + '\n';
      curPage = page;
    }
    if (!cur.trim()) curPage = page;
    if (clean.length > size) {
      for (let i = 0; i < clean.length; i += size - overlap) chunks.push({ text: clean.slice(i, i + size), page });
      cur = '';
    } else cur += (cur ? '\n' : '') + clean;
  }
  if (cur.trim()) chunks.push({ text: cur, page: curPage });
  return chunks;
}

export async function chunkText(notebookId, sourceId, text) {
  const parts = splitChunks(text);
  const rows = parts.map((c, i) => ({ notebookId, sourceId, ord: i, text: c.text, page: c.page, tokens: tokenize(c.text) }));
  // Anlamsal arama vektörleri (embedding modeli ayarlıysa)
  try {
    const cfg = await loadConfig();
    if (cfg.embedModel) {
      for (let i = 0; i < rows.length; i += 32) {
        const vecs = await embed(rows.slice(i, i + 32).map((r) => r.text), cfg);
        if (!vecs) break;
        vecs.forEach((v, k) => { rows[i + k].vec = v; });
      }
    }
  } catch (e) { console.warn('Embedding atlandı:', e.message); }
  await db.chunks.bulkAdd(rows);
  return rows.length;
}

export async function addSource(notebookId, { title, kind, text, meta = {}, allowEmpty = false }) {
  text = (text || '').trim();
  if (!text && !allowEmpty) throw new Error('Kaynakta okunabilir metin yok.');
  const id = await db.sources.add({ notebookId, title, kind, text, chars: text.length, enabled: 1, createdAt: now(), ...meta });
  await chunkText(notebookId, id, text);
  await touchNotebook(notebookId);
  return id;
}

// ---------- Arama: BM25 (+ isteğe bağlı vektör) ----------
const STOP = new Set('ve veya ile bir bu şu o da de ki mi mu mı mü için gibi olan olarak daha en çok ama fakat ise ne her the of and to in a is for on that with as are by be or an'.split(' '));
export function tokenize(t) {
  return (t.toLocaleLowerCase('tr').match(/[\p{L}\p{N}]+/gu) || [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 6 && /\p{L}/u.test(w) ? w.slice(0, 6) : w)); // Türkçe ekler için kaba gövdeleme
}

function cosine(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na * nb) || 1);
}

// Kaynak metnini değiştir ve yeniden dizinle (OCR sonrası)
export async function replaceSourceText(sid, text) {
  const s = await db.sources.get(sid);
  await db.chunks.where('sourceId').equals(sid).delete();
  await db.sources.update(sid, { text, chars: text.length });
  await chunkText(s.notebookId, sid, text);
}

export async function enabledSources(notebookId) {
  return (await db.sources.where('notebookId').equals(notebookId).toArray()).filter((s) => s.enabled);
}

export async function search(notebookId, query, k = 12) {
  const srcIds = new Set((await enabledSources(notebookId)).map((s) => s.id));
  const chunks = (await db.chunks.where('notebookId').equals(notebookId).toArray()).filter((c) => srcIds.has(c.sourceId));
  if (!chunks.length) return [];
  const q = tokenize(query);
  const N = chunks.length;
  const avg = chunks.reduce((a, c) => a + c.tokens.length, 0) / N;
  const df = {};
  for (const c of chunks) for (const w of new Set(c.tokens)) df[w] = (df[w] || 0) + 1;
  const scores = chunks.map((c) => {
    const tf = {};
    for (const w of c.tokens) tf[w] = (tf[w] || 0) + 1;
    let s = 0;
    for (const w of q) {
      if (!tf[w]) continue;
      const idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5));
      s += idf * (tf[w] * 2.2) / (tf[w] + 1.2 * (0.25 + 0.75 * c.tokens.length / avg));
    }
    return s;
  });
  // Vektör skoru varsa birleştir
  if (chunks[0].vec) {
    try {
      const [qv] = await embed([query]);
      const max = Math.max(...scores, 1e-9);
      chunks.forEach((c, i) => { if (c.vec) scores[i] = 0.5 * (scores[i] / max) + 0.5 * cosine(qv, c.vec); });
    } catch {}
  }
  return chunks.map((c, i) => ({ c, s: scores[i] })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.c);
}

// Model bağlamı: kaynaklar sığıyorsa tamamı, sığmıyorsa en ilgili parçalar + her kaynaktan dengeli örnek
export async function buildContext(notebookId, focus = '', { budgetChars } = {}) {
  const cfg = await loadConfig();
  budgetChars = budgetChars || Math.floor((cfg.numCtx || 32768) * 2.6 * 0.6);
  const sources = await enabledSources(notebookId);
  if (!sources.length) throw new Error('Önce en az bir kaynak ekleyin ve seçili olduğundan emin olun.');
  const titles = Object.fromEntries(sources.map((s) => [s.id, s.title]));
  const total = sources.reduce((a, s) => a + s.text.length, 0);
  let picked;
  if (total <= budgetChars) {
    picked = [];
    for (const s of sources) {
      const ch = await db.chunks.where('sourceId').equals(s.id).sortBy('ord');
      picked.push(...ch.map((c) => ({ ...c, _keepOverlap: true })));
    }
  } else {
    const rel = focus ? await search(notebookId, focus, 60) : [];
    const map = new Map(rel.map((c) => [c.id, c]));
    for (const s of sources) { // her kaynaktan eşit aralıklı örnekler
      const ch = await db.chunks.where('sourceId').equals(s.id).sortBy('ord');
      const step = Math.max(1, Math.floor(ch.length / 12));
      for (let i = 0; i < ch.length; i += step) map.set(ch[i].id, ch[i]);
    }
    picked = [];
    let used = 0;
    const ordered = [...rel, ...[...map.values()].filter((c) => !rel.includes(c))];
    for (const c of ordered) {
      if (used + c.text.length > budgetChars) continue;
      picked.push(c); used += c.text.length;
    }
    picked.sort((a, b) => a.sourceId - b.sourceId || a.ord - b.ord);
  }
  const refs = picked.map((c, i) => ({ n: i + 1, chunkId: c.id, sourceId: c.sourceId, title: titles[c.sourceId], page: c.page, text: c.text }));
  const text = refs.map((r) => `[${r.n}] (${r.title}${r.page ? ', s.' + r.page : ''})\n${r.text}`).join('\n\n');
  return { text, refs, sources };
}

// Kaynağın tamamını kapsayan ardışık bağlam dilimleri (toplu üretim ve soru bankası için).
// Her dilim kendi [1..n] numaralarını taşır; odak verilirse yalnız ilgili parçalar kullanılır.
export async function sliceContexts(notebookId, focus = '', { budgetChars } = {}) {
  const cfg = await loadConfig();
  budgetChars = budgetChars || Math.max(6000, Math.min(Math.floor((cfg.numCtx || 32768) * 2.6 * 0.45), 26000));
  const sources = await enabledSources(notebookId);
  if (!sources.length) throw new Error('Önce en az bir kaynak ekleyin ve seçili olduğundan emin olun.');
  const titles = Object.fromEntries(sources.map((s) => [s.id, s.title]));
  let pool = [];
  for (const s of sources) pool.push(...await db.chunks.where('sourceId').equals(s.id).sortBy('ord'));
  if (focus && pool.length * 1400 > budgetChars * 2) {
    const rel = await search(notebookId, focus, Math.max(30, Math.ceil(pool.length / 3)));
    const keep = new Set(rel.map((c) => c.id));
    pool = pool.filter((c) => keep.has(c.id));
  }
  const slices = []; let cur = [], used = 0;
  for (const c of pool) {
    if (cur.length && used + c.text.length > budgetChars) { slices.push(cur); cur = []; used = 0; }
    cur.push(c); used += c.text.length;
  }
  if (cur.length) slices.push(cur);
  return slices.map((cs, k) => {
    const refs = cs.map((c, i) => ({ n: i + 1, chunkId: c.id, sourceId: c.sourceId, title: titles[c.sourceId], page: c.page, text: c.text }));
    return { slice: k, of: slices.length, refs, sources, text: refs.map((r) => `[${r.n}] (${r.title}${r.page ? ', s.' + r.page : ''})\n${r.text}`).join('\n\n') };
  });
}
