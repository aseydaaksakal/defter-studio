// Taranmış PDF'ler için metin tanıma (OCR): Tesseract.js + Türkçe dil verisi, tamamen tarayıcıda ve arka plan iş parçacığında.
// Uzun kitaplar sayfa sayfa işlenir; ilerleme kaydedilir, sayfa kapansa da kaldığı yerden devam eder.
import { db } from './db.js';
import * as pdfjs from './vendor/pdf.min.mjs';

const BASE = new URL('./vendor/ocr/', import.meta.url).href;
let workerP = null;
const jobs = {}; // sourceId → { stop }
const listeners = new Set();
export const onOcrProgress = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (sid, st) => listeners.forEach((f) => { try { f(sid, st); } catch {} });

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('OCR motoru yüklenemedi')); document.head.append(s); });
}
async function getWorker() {
  if (!workerP) workerP = (async () => {
    if (!window.Tesseract) await loadScript(BASE + 'tesseract.min.js');
    return window.Tesseract.createWorker('tur', 1, { workerPath: BASE + 'worker.min.js', corePath: BASE, langPath: BASE, gzip: true, cacheMethod: 'write' });
  })().catch((e) => { workerP = null; throw e; });
  return workerP;
}

// Sayfa başına ortalama karakter azsa PDF taranmış kabul edilir
export const looksScanned = (text, pages) => pages > 0 && (text.replace(/\[\[s\.\d+\]\]/g, '').replace(/\s+/g, '').length / pages) < 120;

export function ocrRunning(sid) { return !!jobs[sid]; }
export function stopOcr(sid) { jobs[sid]?.stop(); }

/** Bir kaynağı (PDF blob'u kayıtlı) OCR et. onDone(text) tüm metin hazır olunca çağrılır. */
export async function runOcr(sid, { from = 1, to = null, onPages } = {}) {
  if (jobs[sid]) return;
  const src = await db.sources.get(sid);
  const rec = await db.blobs.where('artifactId').equals('src:' + sid).first();
  if (!src || !rec) throw new Error('Kaynağın PDF dosyası bulunamadı; dosyayı yeniden yükleyin.');
  let stopped = false;
  jobs[sid] = { stop: () => (stopped = true) };
  const st = { ...(src.ocr || {}), status: 'running' };
  try {
    const doc = await pdfjs.getDocument({ data: await rec.blob.arrayBuffer() }).promise;
    const total = Math.min(to || doc.numPages, doc.numPages);
    const pages = st.pages || {};
    st.total = total; st.from = from;
    const worker = await getWorker();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (let p = from; p <= total && !stopped; p++) {
      if (pages[p]) continue;
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      canvas.width = vp.width; canvas.height = vp.height;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const { data } = await worker.recognize(canvas);
      pages[p] = (data.text || '').replace(/-\n(?=\p{Ll})/gu, '').replace(/[ \t]+\n/g, '\n').trim() || ' ';
      st.pages = pages; st.done = Object.keys(pages).length;
      emit(sid, { ...st, pages: undefined });
      if (st.done % 10 === 0) { await db.sources.update(sid, { ocr: st }); onPages?.(); }
      page.cleanup();
    }
    st.status = stopped ? 'paused' : 'done';
    await db.sources.update(sid, { ocr: st });
    const text = Object.keys(pages).map(Number).sort((a, b) => a - b).map((p) => `[[s.${p}]]\n${pages[p]}`).join('\n\n');
    await onPages?.(text, st.status === 'done');
    emit(sid, { ...st, pages: undefined });
    return text;
  } catch (e) {
    st.status = 'error'; st.error = String(e.message || e);
    await db.sources.update(sid, { ocr: st });
    emit(sid, { ...st, pages: undefined });
    throw e;
  } finally { delete jobs[sid]; }
}

// OCR'ın sonuçlarından kaynak metnini oluştur
export function ocrText(src) {
  const pages = src.ocr?.pages || {};
  return Object.keys(pages).map(Number).sort((a, b) => a - b).map((p) => `[[s.${p}]]\n${pages[p]}`).join('\n\n');
}
