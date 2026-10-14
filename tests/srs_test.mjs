// FSRS-6 zamanlayıcı testi (node tests/srs_test.mjs). Altın değerler py-fsrs 6 (Scheduler: öğrenme adımı yok, bulanıklık yok)
// ile üretildi (15.10.2026): aynı tekrar dizisinde kararlılık ve zorluk 1e-4 içinde tutmalı. Varsayılan çıktı yalnız ✗ + özet.
import { tekrar, hatirlama, aralik, seviye, eskidenDurum, W, sakla } from '../js/srs.js';

const AYRINTI = process.argv.includes('-v');
let gecen = 0, toplam = 0;
const ok = (ad, kosul, bilgi = '') => { toplam++; if (kosul) gecen++; if (!kosul || AYRINTI) console.log((kosul ? '✓ ' : '✗ ') + ad + (bilgi ? ' — ' + bilgi : '')); };
const GUN = 864e5, T0 = Date.UTC(2026, 0, 1);
const yakin = (a, b) => Math.abs(a - b) < 1e-4;

const ALTIN = [
  [[3, 3, 3, 1, 3], [[2.3065, 2.118104], [13.826904, 2.111214], [44.818187, 2.104331], [2.77909, 7.389976], [6.351435, 7.377814]]],
  [[1, 3, 3], [[0.212, 6.4133], [2.760965, 6.402115], [14.684243, 6.390941]]],
  [[3, 1, 1, 3], [[2.3065, 2.118104], [0.636851, 7.394503], [0.318026, 9.128819], [2.625641, 9.114919]]],
];
const ARA = [0, 3, 9, 30, 2];
for (const [dizi, beklenen] of ALTIN) {
  let st = null, t = T0; const fark = [];
  dizi.forEach((g, k) => { t += ARA[k] * GUN; st = tekrar(st, g, t); const [s, d] = beklenen[k]; if (!yakin(st.s, s) || !yakin(st.d, d)) fark.push(`${k}: ${st.s.toFixed(6)}/${st.d.toFixed(6)} ≠ ${s}/${d}`); });
  ok(`py-fsrs ile aynı: notlar ${dizi.join(',')}`, !fark.length, fark.join('; '));
}
let a = tekrar(null, 3, T0); a = tekrar(a, 3, T0 + 2 * 36e5);
ok('Aynı gün doğru cevap kararlılığı düşürmez (py-fsrs: 2.3065 / 2.111214)', yakin(a.s, 2.3065) && yakin(a.d, 2.111214), `${a.s} ${a.d}`);
ok('R(S, S) = 0,9 ve 0,9 hedefinde aralık = S', yakin(hatirlama(7, 7), 0.9) && yakin(aralik(7), 7));
const ilk = tekrar(null, true, T0), yanlis = tekrar(null, false, T0);
ok('İkili cevap: doğru = İyi, yanlış = Tekrar', yakin(ilk.s, W[2]) && yakin(yanlis.s, W[0]) && yanlis.unutma === 1 && ilk.unutma === 0);
ok('Vade: doğruda yaklaşık S gün sonra, yanlışta en az 10 dk sonra', Math.abs((ilk.due - T0) / GUN - W[2]) < 1e-6 && yanlis.due - T0 >= 10 * 60000);
let b = tekrar(null, true, T0), t = T0;
for (let i = 0; i < 6; i++) { t = b.due; b = tekrar(b, true, t); }
ok('Vadesinde hep doğru: aralık büyür, seviye 5 (öğrenildi)', b.s > 60 && b.box === 5, `S=${b.s.toFixed(1)}`);
const once = b.s; b = tekrar(b, false, b.due);
ok('Unutma: kararlılık düşer ve önceki değeri aşmaz', b.s < once / Math.exp(W[17] * W[18]) + 1e-9 && b.unutma === 1);
ok('Seviye eşikleri (eski kutu 1–5)', [0.5, 2, 5, 10, 30].map(seviye).join('') === '12345');
const es = eskidenDurum({ gun: 7, due: T0 + 7 * GUN, simdi: T0 });
const es2 = tekrar(es, true, T0 + 7 * GUN);
ok('Eski aralıktan geçiş: 7 günlük kart vadesinde doğruyla 7 günü aşar', es.s === 7 && es2.s > 7 && es2.sayi === 2);
ok('Saklanan alanlar yalnız durum', JSON.stringify(Object.keys(sakla(es2))) === '["s","d","son","sayi","unutma"]');
console.log(`\n${gecen}/${toplam} FSRS kontrolü geçti`);
process.exit(gecen === toplam ? 0 : 1);
