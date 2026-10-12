// Kaynak doğrulama (halüsinasyon denetimi): üretilen her öğe kaynaktan kelimesi kelimesine bir alıntı ("evidence") taşır.
// Alıntı kaynak parçalarında aranır; cevap bu alıntıyla desteklenmiyorsa öğe "şüpheli" sayılır ve elenir.
// Hiçbir model çağrısı yapmaz (token harcamaz).
import { tokenize } from './sources.js';

export const norm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFKC')
  .replace(/[­​]/g, '').replace(/-\s*\n\s*/g, '').replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();

// Alıntıyı parçalarda ara → { status: 'exact'|'partial'|'fail', n (parça no), score }
export function findQuote(quote, refs, preferN) {
  const q = norm(quote);
  const words = q.split(' ').filter(Boolean);
  if (words.length < 3) return { status: 'fail', n: null, score: 0 };
  const order = preferN ? [...refs.filter((r) => r.n === preferN), ...refs.filter((r) => r.n !== preferN)] : refs;
  const normed = order.map((r) => ({ n: r.n, t: norm(r.text) }));
  for (const r of normed) if (r.t.includes(q)) return { status: 'exact', n: r.n, score: 1 };
  // kısmi: 4 kelimelik pencerelerin kaçı bulunuyor (OCR hataları, ufak yeniden yazımlar için)
  const win = [];
  for (let i = 0; i + 4 <= words.length; i += 2) win.push(words.slice(i, i + 4).join(' '));
  if (!win.length) win.push(words.join(' '));
  let best = { n: null, score: 0 };
  for (const r of normed) {
    const hit = win.filter((w) => r.t.includes(w)).length / win.length;
    if (hit > best.score) best = { n: r.n, score: hit };
  }
  return best.score >= 0.6 ? { status: 'partial', ...best } : { status: 'fail', ...best };
}

// Cevap metninin içerik kelimeleri alıntıda/parçada geçiyor mu? (doğru şık gerçekten kaynakla destekleniyor mu)
export function supports(answer, evidence, refText = '') {
  const a = new Set(tokenize(answer));
  if (!a.size) return true; // "Hepsi", sayı vb. kısa cevaplar: alıntı kontrolü yeterli
  const pool = new Set([...tokenize(evidence), ...tokenize(refText)]);
  let hit = 0; for (const t of a) if (pool.has(t)) hit++;
  return hit / a.size >= (a.size <= 2 ? 0.5 : 0.34);
}

// Bir öğeyi doğrula. answerText: soru için doğru şık metni, kart için arka yüz.
export function verifyItem(item, refs, answerText) {
  const ev = item.evidence || item.quote || '';
  if (!ev) return { status: 'fail', reason: 'alıntı yok' };
  const f = findQuote(ev, refs, +item.ref || null);
  if (f.status === 'fail') return { status: 'fail', reason: 'alıntı kaynakta bulunamadı' };
  const ref = refs.find((r) => r.n === f.n);
  if (answerText != null && !supports(answerText, ev, ref?.text)) return { status: 'fail', reason: 'cevap alıntıyla desteklenmiyor', n: f.n };
  return { status: f.status, n: f.n };
}

// İçerik geneli için özet rozet: { checked, ok, partial }
export const summarize = (items) => ({
  checked: items.length,
  ok: items.filter((x) => x.verified === 'exact').length,
  partial: items.filter((x) => x.verified === 'partial').length
});
export const badgeText = (v) => (v?.checked ? `Kaynakla doğrulandı: %${Math.round(((v.ok + v.partial) / v.checked) * 100)} (${v.ok} birebir, ${v.partial} kısmi alıntı)` : '');
