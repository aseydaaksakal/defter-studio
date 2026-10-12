// Soru bankası: sorular bir kez (tercihen lokal modelle, ücretsiz) üretilip saklanır; sonra istenen sayıda test
// token harcamadan anında oluşturulur. Doldurma arka planda, kaynağın baştan sonuna dilim dilim ilerler ve
// sayfa kapansa da kaldığı yerden devam eder. Cevaplar aralıklı tekrar (gün aralıkları) ile planlanır.
import { db, getSetting, setSetting, now } from './db.js';
import { sliceContexts } from './sources.js';
import { oneBatch } from './studio/batch.js';
import { questionSpec, shuffleOpts } from './studio/gen.js';
import { norm, summarize } from './verify.js';

const DAY = 864e5;
const INTERVALS = [1, 3, 7, 16, 35, 80]; // doğru üst üste cevaplandıkça büyüyen aralıklar (gün)

export async function bankStats(nb) {
  const qs = await db.questions.where('notebookId').equals(nb).toArray();
  const t = Date.now();
  const s = { total: qs.length, unseen: 0, solved: 0, mastered: 0, weak: 0, due: 0, answered: 0, correct: 0, topics: {} };
  for (const q of qs) {
    if (!q.seen) s.unseen++; else { s.solved++; s.answered += q.seen; s.correct += q.correct || 0; }
    if ((q.streak || 0) >= 2) s.mastered++;
    if (q.seen && !q.lastOk) s.weak++;
    if (q.seen && q.due && q.due <= t) s.due++;
    const T = s.topics[q.topic || 'Genel'] ||= { total: 0, unseen: 0, correct: 0, answered: 0 };
    T.total++; if (!q.seen) T.unseen++; else { T.answered += q.seen; T.correct += q.correct || 0; }
  }
  s.accuracy = s.answered ? Math.round((s.correct / s.answered) * 100) : null;
  return s;
}

export async function addQuestions(nb, items, ctxRefs, meta = {}) {
  const have = new Set((await db.questions.where('notebookId').equals(nb).toArray()).map((x) => norm(x.q)));
  const rows = [];
  for (const q of items) {
    const k = norm(q.q); if (!k || have.has(k)) continue; have.add(k);
    const r = ctxRefs?.find((x) => x.n === +q.ref);
    rows.push({ notebookId: nb, q: q.q, options: q.options, answer: q.answer, explanation: q.explanation || '', hint: q.hint || '', topic: q.topic || 'Genel',
      evidence: q.evidence || '', verified: q.verified || '', ref: r ? { title: r.title, page: r.page, text: r.text.slice(0, 500) } : null,
      slice: meta.slice ?? null, preset: meta.preset || 'genel', level: meta.level || 'mid', createdAt: now(), seen: 0, correct: 0, wrong: 0, streak: 0, lastOk: null, lastAt: 0, due: 0 });
  }
  if (rows.length) await db.questions.bulkAdd(rows);
  return rows.length;
}

export async function recordAnswer(id, ok) {
  const q = await db.questions.get(id); if (!q) return;
  const streak = ok ? (q.streak || 0) + 1 : 0;
  const days = ok ? INTERVALS[Math.min(INTERVALS.length - 1, streak - 1)] : 0.5;
  await db.questions.update(id, { seen: (q.seen || 0) + 1, correct: (q.correct || 0) + (ok ? 1 : 0), wrong: (q.wrong || 0) + (ok ? 0 : 1), streak, lastOk: ok, lastAt: now(), due: now() + days * DAY });
  emit(q.notebookId, null); // Studio'daki banka kartı kalan/çözülen sayısını güncellesin
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// mode: 'smart' (vadesi gelen yanlışlar → hiç çözülmeyenler → vadesi gelenler → diğerleri) | 'unseen' | 'wrong' | 'all'
export async function pickQuestions(nb, { count = 20, mode = 'smart', topic = '' } = {}) {
  let qs = await db.questions.where('notebookId').equals(nb).toArray();
  if (topic) qs = qs.filter((q) => (q.topic || 'Genel') === topic);
  const t = Date.now();
  if (mode === 'unseen') return shuffle(qs.filter((q) => !q.seen)).slice(0, count);
  if (mode === 'wrong') return shuffle(qs.filter((q) => q.seen && !q.lastOk)).slice(0, count);
  if (mode === 'all') return shuffle(qs).slice(0, count);
  const dueWrong = qs.filter((q) => q.seen && !q.lastOk && q.due <= t), unseen = qs.filter((q) => !q.seen);
  const dueOk = qs.filter((q) => q.seen && q.lastOk && q.due <= t), rest = qs.filter((q) => q.seen && q.due > t).sort((a, b) => a.due - b.due);
  return [...shuffle(dueWrong), ...shuffle(unseen), ...shuffle(dueOk), ...rest].slice(0, count);
}

// Bankadan anında Test oluştur (0 token). Dönen: yeni artifact kimliği
export async function quizFromBank(nb, { count = 20, mode = 'smart', topic = '', exam = false, target = 70, minPerQ = 1.2 } = {}) {
  const qs = await pickQuestions(nb, { count, mode, topic });
  if (!qs.length) throw new Error(mode === 'wrong' ? 'Bankada yanlış cevaplanmış soru yok.' : mode === 'unseen' ? 'Bankada hiç çözülmemiş soru kalmadı.' : 'Soru bankası boş. Önce “Bankayı doldur” ile soru üretin.');
  const refs = [];
  const questions = qs.map((q) => {
    let ref; if (q.ref) { refs.push({ n: refs.length + 1, ...q.ref }); ref = refs.length; }
    return shuffleOpts({ bankId: q.id, topic: q.topic, q: q.q, options: q.options, answer: q.answer, hint: q.hint, explanation: q.explanation, evidence: q.evidence, verified: q.verified, ref });
  });
  const label = { smart: 'Akıllı tekrar', unseen: 'Çözülmemiş', wrong: 'Yanlışlar', all: 'Karışık' }[mode] || '';
  return db.artifacts.add({ notebookId: nb, type: 'quiz', title: `Soru bankası · ${label} · ${questions.length} soru`, status: 'done', options: { fromBank: true, count, mode, topic },
    content: { questions, refs, mode: exam ? 'exam' : 'practice', target, minutes: exam ? Math.max(5, Math.round(questions.length * minPerQ)) : 0, verify: summarize(questions), fromBank: true, note: 'Bu test soru bankasından token harcamadan oluşturuldu.' },
    sourceTitles: [], createdAt: now(), updatedAt: now() });
}

// ---------------- Arka planda doldurma ----------------
const running = {};
const listeners = new Set();
export const onBankProgress = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (nb, st) => listeners.forEach((f) => { try { f(nb, st); } catch {} });
export const bankJob = (nb) => getSetting('bank:' + nb, null);
export const isFilling = (nb) => !!running[nb];

export async function startBankFill(nb, { target = 200, preset = 'genel', level = 'mid', lang = 'Türkçe', focus = '' } = {}) {
  const old = await bankJob(nb);
  const st = { target, preset, level, lang, focus, status: 'running', cursor: old?.focus === focus ? old.cursor || 0 : 0, pass: old?.pass || 0, startedAt: now(), error: null };
  await setSetting('bank:' + nb, st);
  runFill(nb);
}
export async function pauseBankFill(nb) {
  const st = await bankJob(nb); if (st) { st.status = 'paused'; await setSetting('bank:' + nb, st); emit(nb, st); }
  running[nb]?.abort();
}
export async function resumeBankFills() {
  for (const row of await db.settings.where('key').startsWith('bank:').toArray()) if (row.value?.status === 'running') runFill(+row.key.slice(5));
}

async function runFill(nb) {
  if (running[nb]) return;
  const ctl = new AbortController(); running[nb] = ctl;
  let fails = 0, empty = 0;
  try {
    const st0 = await bankJob(nb);
    const slices = await sliceContexts(nb, st0?.focus || '');
    for (;;) {
      const st = await bankJob(nb);
      if (!st || st.status !== 'running') break;
      const have = await db.questions.where('notebookId').equals(nb).count();
      if (have >= st.target) { st.status = 'done'; st.doneAt = now(); await setSetting('bank:' + nb, st); emit(nb, { ...st, have }); break; }
      const si = (st.cursor || 0) % slices.length;
      const ctx = slices[si];
      const spec = questionSpec({ preset: st.preset, level: st.pass > 0 && st.level === 'mid' ? 'hard' : st.level, lang: st.lang, focus: st.focus });
      emit(nb, { ...st, have, msg: `Soru bankası ${have}/${st.target} · kaynak bölümü ${si + 1}/${slices.length}${st.pass ? ` (${st.pass + 1}. tur)` : ''}` });
      const avoid = (await db.questions.where('notebookId').equals(nb).filter((q) => q.slice === si).toArray()).map((q) => q.q).join(' | ').slice(0, 2500);
      try {
        const r = await oneBatch(spec, ctx, Math.min(8, st.target - have), avoid, { signal: ctl.signal });
        const added = await addQuestions(nb, r.items, ctx.refs, { slice: si, preset: st.preset, level: st.level });
        fails = 0; empty = added ? 0 : empty + 1;
      } catch (e) {
        if (e.name === 'AbortError') break;
        const net = /fetch|network|bağlan|Failed/i.test(e.message);
        if (net || ++fails >= 3) { st.status = 'paused'; st.error = net ? 'Modele bağlanılamadı; model açılınca “Devam et”e basın.' : e.message; await setSetting('bank:' + nb, st); emit(nb, { ...st, have }); break; }
        continue;
      }
      st.cursor = (st.cursor || 0) + 1;
      if (st.cursor % slices.length === 0) st.pass = (st.pass || 0) + 1;
      if (empty >= slices.length + 2) { st.status = 'done'; st.error = 'Kaynaktan yeni ve farklı soru çıkmıyor; banka bu kaynak için doldu.'; }
      await setSetting('bank:' + nb, st);
    }
  } finally { delete running[nb]; emit(nb, await bankJob(nb)); }
}
