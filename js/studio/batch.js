// Toplu üretim: istenen SAYIDA öğeyi (soru, kart…) kaynağın tamamına yayarak parti parti üretir.
// Her parti farklı bir kaynak diliminden beslenir; tekrarlar elenir; kaynakla doğrulanamayan öğeler atılır ve yerine yenisi üretilir.
import { chatJSON } from '../llm.js';
import { sliceContexts } from '../sources.js';
import { verifyItem, norm } from '../verify.js';

/**
 * spec: { system, prompt(ctx, need, avoid) → string, pick(json) → items[], key(item), answerOf(item) | null, verify (vars. true), temperature, role }
 * Tek bir kaynak diliminden bir parti üretir. Dönen: { items (ref = dilimdeki parça no), dropped }
 */
export async function oneBatch(spec, ctx, need, avoid, { signal, seen = new Set() } = {}) {
  const r = await chatJSON({ system: spec.system, messages: [{ role: 'user', content: spec.prompt(ctx, need + (spec.verify === false ? 0 : 1), avoid) }], signal, role: spec.role, temperature: spec.temperature ?? 0.35 });
  const items = []; let dropped = 0;
  for (const it of (spec.pick(r) || []).filter(Boolean)) {
    if (items.length >= need) break;
    const k = norm(spec.key(it));
    if (!k || seen.has(k)) continue;
    if (spec.verify !== false) {
      const v = verifyItem(it, ctx.refs, spec.answerOf ? spec.answerOf(it) : null);
      if (v.status === 'fail') { dropped++; continue; }
      it.verified = v.status; if (v.n) it.ref = v.n;
    }
    seen.add(k); items.push(it);
  }
  return { items, dropped };
}

/**
 * opts: spec alanları + { nb, focus, total, perBatch, max, signal, progress, label, onItems }
 * Dönen: { items, refs (birleşik [n] listesi), dropped, slices }
 */
export async function generateExact(o) {
  const total = Math.max(1, Math.min(o.max || 300, Math.round(o.total)));
  const slices = await sliceContexts(o.nb, o.focus || '');
  const batches = Math.ceil(total / o.perBatch);
  // Dilim sırası: kaynağın baştan sona eşit aralıklarla kapsanması; yetmezse dilimler yeniden kullanılır
  const spread = slices.length <= batches
    ? Array.from({ length: batches + 8 }, (_, i) => i % slices.length)
    : [...Array.from({ length: batches }, (_, i) => Math.floor((i + 0.5) * slices.length / batches)), ...Array.from({ length: 8 }, (_, i) => (i * 7 + 3) % slices.length)];
  const items = [], refs = [], refIndex = new Map(), seen = new Set();
  let dropped = 0, stall = 0, fails = 0;
  for (const si of spread) {
    if (items.length >= total) break;
    const ctx = slices[si];
    const need = Math.min(o.perBatch, total - items.length);
    o.progress?.(`${o.label} ${items.length}/${total} · kaynak bölümü ${si + 1}/${slices.length}`);
    const avoid = items.slice(-30).map(o.key).filter(Boolean).join(' | ').slice(0, 2500);
    let got;
    try { got = await oneBatch(o, ctx, need, avoid, { signal: o.signal, seen }); fails = 0; } catch (e) {
      if (e.name === 'AbortError' || /fetch|network|bağlan|ECONN/i.test(e.message)) throw e;
      if (++fails > 2) throw e; // model sürekli bozuk JSON veriyorsa dur
      continue;
    }
    dropped += got.dropped;
    for (const it of got.items) {
      const local = ctx.refs.find((x) => x.n === +it.ref);
      if (local) {
        if (!refIndex.has(local.chunkId)) { const n = refs.length + 1; refIndex.set(local.chunkId, n); refs.push({ n, sourceId: local.sourceId, title: local.title, page: local.page, text: local.text.slice(0, 700) }); }
        it.ref = refIndex.get(local.chunkId);
      } else delete it.ref;
      items.push(it);
    }
    stall = got.items.length ? 0 : stall + 1;
    o.onItems?.(items, ctx);
    if (stall >= 4) break; // kaynak tükendi: daha fazla farklı öğe çıkmıyor
  }
  return { items, refs, dropped, slices: slices.length };
}

// Kısa "neden eksik" notu
export const shortNote = (want, got, dropped) => (got < want ? `İstenen ${want}, üretilen ${got}. Kaynakta daha fazla farklı ve doğrulanabilir bilgi bulunamadı${dropped ? ` (${dropped} doğrulanamayan öğe elendi)` : ''}.` : dropped ? `${dropped} doğrulanamayan öğe elendi ve yerine yenisi üretildi.` : '');
