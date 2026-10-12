// Türkçe seslendirme için metin normalleştirme
// Sayıları, yüzdeleri, birimleri ve kısaltmaları bir insanın okuyacağı biçime çevirir.
// "1 Şubat 1999" → "bir Şubat bin dokuz yüz doksan dokuz", "%20" → "yüzde yirmi", "GMDSS" → "ge me de se se"

const BIR = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const ON = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const BUYUK = ['', 'bin', 'milyon', 'milyar', 'trilyon'];

function uc(n) { // 0-999
  const y = Math.floor(n / 100), o = Math.floor((n % 100) / 10), b = n % 10;
  return [y ? (y === 1 ? 'yüz' : BIR[y] + ' yüz') : '', ON[o], BIR[b]].filter(Boolean).join(' ');
}

export function sayiyiYaz(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'sıfır';
  const parts = [];
  let i = 0;
  while (n > 0 && i < BUYUK.length) {
    const g = n % 1000;
    if (g) parts.unshift(i === 1 && g === 1 ? 'bin' : [uc(g), BUYUK[i]].filter(Boolean).join(' '));
    n = Math.floor(n / 1000); i++;
  }
  return parts.join(' ');
}

function ondalik(str) { // "121,5" veya "156.525"
  const [a, b] = str.split(/[.,]/);
  const bas = sayiyiYaz(+a);
  if (b === undefined) return bas;
  const sifirlar = (b.match(/^0+/) || [''])[0].length;
  return `${bas} virgül ${'sıfır '.repeat(sifirlar)}${+b ? sayiyiYaz(+b) : ''}`.trim();
}

// Harf harf okunacak kısaltmalarda Türkçe harf adları
const HARF = { A: 'a', B: 'be', C: 'ce', Ç: 'çe', D: 'de', E: 'e', F: 'fe', G: 'ge', Ğ: 'yumuşak ge', H: 'he', I: 'ı', İ: 'i', J: 'je', K: 'ke', L: 'le', M: 'me', N: 'ne', O: 'o', Ö: 'ö', P: 'pe', Q: 'kü', R: 're', S: 'se', Ş: 'şe', T: 'te', U: 'u', Ü: 'ü', V: 've', W: 'dabıl ve', X: 'iks', Y: 'ye', Z: 'ze' };
// Kelime gibi okunan kısaltmalar (sözlük kullanıcı tarafından genişletilebilir)
const OKUNUS = {
  GMDSS: 'ge me de se se', SOLAS: 'solas', NAVTEX: 'navteks', IMO: 'imo', EPIRB: 'e pirb', SART: 'sart', MAYDAY: 'meydey',
  PAN: 'pan', SECURITE: 'sekürite', NATO: 'nato', DSC: 'de se ce', VHF: 've he fe', MF: 'me fe', HF: 'he fe', AIS: 'a i se',
  RCC: 're ce ce', MSI: 'me se i', NBDP: 'ne be de pe', RMSS: 're me se se', RLS: 're le se', COLREG: 'kolreg', STCW: 'se te ce dabıl ve',
  UAB: 'u a be', GOC: 'ge o ce', ROC: 're o ce', REO: 're e o', SRC: 'se re ce', LRC: 'le re ce', TYT: 'te ye te', AYT: 'a ye te',
  YKS: 'ye ke se', LGS: 'le ge se', KPSS: 'ke pe se se', ALES: 'ales', YDS: 'ye de se', ABD: 'a be de', AB: 'a be', TBMM: 'te be me me',
  NASA: 'nasa', UNESCO: 'yunesko', COVID: 'kovid', PDF: 'pe de fe', GPS: 'ge pe se', DNA: 'de ne a', RNA: 're ne a', SAR: 'sar',
  ARPA: 'arpa', ECDIS: 'ekdis', GT: 'gros ton', TL: 'Türk lirası', USD: 'dolar', EUR: 'avro'
};
const BIRIM = [
  [/(\d)\s?kHz\b/g, '$1 kilohertz'], [/(\d)\s?MHz\b/g, '$1 megahertz'], [/(\d)\s?GHz\b/g, '$1 gigahertz'], [/(\d)\s?Hz\b/g, '$1 hertz'],
  [/(\d)\s?nm\b/g, '$1 deniz mili'], [/(\d)\s?km\b/g, '$1 kilometre'], [/(\d)\s?kg\b/g, '$1 kilogram'], [/(\d)\s?cm\b/g, '$1 santimetre'],
  [/(\d)\s?mm\b/g, '$1 milimetre'], [/(\d)\s?m\b/g, '$1 metre'], [/(\d)\s?GT\b/g, '$1 gros ton'], [/(\d)\s?W\b/g, '$1 vat'],
  [/(\d)\s?°C\b/g, '$1 derece'], [/(\d)\s?°/g, '$1 derece'], [/(\d)\s?sn\b/g, '$1 saniye'], [/(\d)\s?dk\b/g, '$1 dakika'],
  [/\bvb\./g, 've benzeri'], [/\bvs\./g, 've saire'], [/\börn\./gi, 'örneğin'], [/\bNo\.\s?(\d)/g, 'numara $1'], [/\bs\.\s?(\d)/g, 'sayfa $1']
];

export function normalizeTR(text, { spellAcronyms = true } = {}) {
  let t = ' ' + String(text || '') + ' ';
  t = t.replace(/\[\d+\]/g, ''); // kaynak numaraları okunmaz
  t = t.replace(/[*_#`>|]/g, ' ');
  for (const [re, rep] of BIRIM) t = t.replace(re, rep);
  t = t.replace(/\b([A-ZÇĞİÖŞÜ])(\d{1,2})\b/g, (_, h, n) => `${HARF[h] || h} ${sayiyiYaz(+n)}`); // A1 → a bir
  t = t.replace(/%\s?(\d+(?:[.,]\d+)?)/g, (_, n) => 'yüzde ' + ondalik(n));
  t = t.replace(/(\d+(?:[.,]\d+)?)\s?%/g, (_, n) => 'yüzde ' + ondalik(n));
  t = t.replace(/(\d{1,2}):(\d{2})/g, (_, a, b) => `${sayiyiYaz(+a)} ${+b ? sayiyiYaz(+b) : 'sıfır sıfır'}`);
  t = t.replace(/(\d+)\s?[-–]\s?(\d+)/g, (_, a, b) => `${sayiyiYaz(+a)} ile ${sayiyiYaz(+b)}`);
  t = t.replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (m) => sayiyiYaz(+m.replace(/\./g, ''))); // 1.500.000
  t = t.replace(/\b(\d+)[.,](\d+)\b/g, (m) => ondalik(m));
  t = t.replace(/\b\d+\b/g, (m) => sayiyiYaz(+m));
  t = t.replace(/[A-ZÇĞİÖŞÜ]{2,8}\b/g, (w) => {
    if (OKUNUS[w]) return OKUNUS[w];
    if (!spellAcronyms) return w;
    return w.split('').map((c) => HARF[c] || c).join(' ');
  });
  t = t.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ');
  return t.trim();
}

export const SOZLUK = OKUNUS; // ayarlar sayfasından genişletilebilir
