// Aralıklı tekrar zamanlayıcısı: FSRS-6 (open-spaced-repetition; varsayılan 21 parametre, awesome-fsrs wiki "The Algorithm"
// ve py-fsrs ile aynı formüller, 15.10.2026). Bilgi kartları, hata defteri ve soru bankası bu tek modülü kullanır.
// Cevap ikili: doğru = İyi (3), yanlış = Tekrar (1); 1–4 arası not da verilebilir (Zor = 2, Kolay = 4).
// Durum: { s: kararlılık (gün), d: zorluk (1–10), son: son tekrar zamanı (ms), sayi, unutma }. Ağ ve model çağrısı yok.

export const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
  0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
export const HEDEF = 0.9; // istenen hatırlama olasılığı: kart bu olasılığa düşünce geri gelir
const GUN = 864e5;
const DECAY = -W[20];
const FACTOR = 0.9 ** (1 / DECAY) - 1; // R(S, S) = 0,9
const sinirD = (d) => Math.min(10, Math.max(1, d));
const ilkD = (g) => W[4] - Math.exp(W[5] * (g - 1)) + 1;

/** Hatırlama olasılığı: kararlılığı s gün olan bilgi, son tekrardan t gün sonra. */
export const hatirlama = (s, t) => (1 + (FACTOR * t) / s) ** DECAY;
/** Hatırlama olasılığı r'ye düşene kadar geçecek gün. r = 0,9 iken tam s gündür. */
export const aralik = (s, r = HEDEF) => (s / FACTOR) * (r ** (1 / DECAY) - 1);
/** Eski "kutu" (1–5) karşılığı: arayüzdeki "Kutu N", ustalık puanı ve hata defterinden çıkarma (5 = 21+ gün) bunu kullanır. */
export const seviye = (s) => (s < 1 ? 1 : s < 3 ? 2 : s < 7 ? 3 : s < 21 ? 4 : 5);

function sonrakiZorluk(d, g) {
  const fark = -W[6] * (g - 3);
  return sinirD(W[7] * ilkD(4) + (1 - W[7]) * (d + (fark * (10 - d)) / 9)); // doğrusal sönüm + ortalamaya dönüş
}
function hatirlaninca(d, s, r, g) {
  const zor = g === 2 ? W[15] : 1, kolay = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp((1 - r) * W[10]) - 1) * zor * kolay);
}
function unutulunca(d, s, r) {
  const uzun = W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp((1 - r) * W[14]);
  return Math.min(uzun, s / Math.exp(W[17] * W[18])); // unutulan bilgi önceki kararlılığını aşamaz
}
function ayniGun(s, g) {
  let k = Math.exp(W[17] * (g - 3 + W[18])) * s ** -W[19];
  if (g >= 2) k = Math.max(k, 1); // aynı gün doğru cevap kararlılığı düşürmez
  return s * k;
}

/** Eski aralık bilgisinden (Leitner kutusu / üst üste doğru) FSRS durumu: ilerleme kaybolmasın. */
export function eskidenDurum({ gun = 1, due = 0, simdi = Date.now() } = {}) {
  const s = Math.max(0.05, gun);
  return { s, d: 5, son: (due || simdi) - s * GUN, sayi: 1, unutma: 0 };
}

/** Bir tekrarı işler; yeni durumu, vadeyi (due) ve seviyeyi (box) döndürür. durum boşsa ilk tekrardır. */
export function tekrar(durum, dogru, simdi = Date.now()) {
  const g = typeof dogru === 'number' ? Math.min(4, Math.max(1, Math.round(dogru))) : dogru ? 3 : 1;
  let s, d;
  if (!durum || !(durum.s > 0) || !(durum.d > 0)) {
    s = W[g - 1]; d = sinirD(ilkD(g));
  } else {
    const t = Math.max(0, (simdi - (durum.son || simdi)) / GUN);
    if (t < 1) s = ayniGun(durum.s, g);
    else {
      const r = hatirlama(durum.s, t);
      s = g === 1 ? unutulunca(durum.d, durum.s, r) : hatirlaninca(durum.d, durum.s, r, g);
    }
    d = sonrakiZorluk(durum.d, g);
  }
  s = Math.min(36500, Math.max(0.01, s));
  const gun = Math.min(3650, Math.max(g === 1 ? 10 / 1440 : 1 / 24, aralik(s))); // en az 10 dk (yanlış) / 1 saat (doğru)
  return { s, d, son: simdi, sayi: (durum?.sayi || 0) + 1, unutma: (durum?.unutma || 0) + (g === 1 ? 1 : 0), due: simdi + gun * GUN, box: seviye(s) };
}

/** Saklanacak alanlar (due ve box ayrıca tutulur: sorgular ve arayüz onları okur). */
export const sakla = ({ s, d, son, sayi, unutma }) => ({ s, d, son, sayi, unutma });
