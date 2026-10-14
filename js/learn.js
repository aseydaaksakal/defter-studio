// Defter Studio — öğrenme motoru: puan/seri/rozet, kutlama, hata defteri, günlük plan, öğrenme bilimi
import { db, getSetting, setSetting } from './db.js';
import { tekrar, eskidenDurum, sakla } from './srs.js';
import { h, icon, toast } from './ui.js';

const today = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export async function getStats() {
  return { xp: 0, streak: 0, best: 0, lastDay: null, days: {}, badges: [], goal: 100, ...(await getSetting('stats', {})) };
}

export const BADGES = {
  first_quiz: ['🎯', 'İlk test', 'İlk testini bitirdin'],
  perfect: ['💯', 'Kusursuz', 'Bir testte %100 aldın'],
  target: ['🏁', 'Hedefe ulaştın', 'Hedef puanını geçtin'],
  streak3: ['🔥', '3 gün seri', '3 gün üst üste çalıştın'],
  streak7: ['🌟', '7 gün seri', 'Bir hafta boyunca her gün çalıştın'],
  streak30: ['🏆', '30 gün seri', 'Bir ay kesintisiz'],
  cards50: ['🃏', 'Kart ustası', '50 kartı tekrar ettin'],
  teach80: ['🧑‍🏫', 'Hoca', 'Öğreterek öğren puanın 80+'],
  reader: ['⚡', 'Hızlı okur', 'Etkin okuma hızın 400 kelime/dk'],
  typist: ['⌨️', '10 parmak', 'Klavyede 40 kelime/dk ve %95 doğruluk'],
  memory: ['🧠', 'Hafıza sarayı', 'Hafıza sarayındaki tüm durakları hatırladın'],
  level5: ['🎓', 'Seviye 5', '5. seviyeye ulaştın']
};

export const levelOf = (xp) => Math.floor(Math.sqrt(xp / 50)) + 1;
export const xpForLevel = (l) => 50 * (l - 1) ** 2;

// Puan ver: seri, günlük hedef ve rozetleri günceller
export async function award(points, reason = '', badge = null, { silent = false } = {}) {
  const s = await getStats();
  const d = today();
  if (s.lastDay !== d) {
    s.streak = s.lastDay && dayDiff(s.lastDay, d) === 1 ? s.streak + 1 : 1;
    s.lastDay = d;
  }
  const beforeLevel = levelOf(s.xp);
  s.xp += points;
  s.days[d] = (s.days[d] || 0) + points;
  s.best = Math.max(s.best, s.streak);
  const newBadges = [];
  const give = (b) => { if (b && !s.badges.includes(b)) { s.badges.push(b); newBadges.push(b); } };
  give(badge);
  if (s.streak >= 3) give('streak3');
  if (s.streak >= 7) give('streak7');
  if (s.streak >= 30) give('streak30');
  if (levelOf(s.xp) >= 5) give('level5');
  await setSetting('stats', s);
  updateXpPill(s);
  s.cards = (s.cards || 0) + (reason === 'kart' ? 1 : 0);
  if (s.cards >= 50) give('cards50');
  await setSetting('stats', s);
  if (points > 0 && !silent) toast(`+${points} puan${reason ? ' · ' + reason : ''}`, 'ok', 2200);
  for (const b of newBadges) { celebrate(); toast(`${BADGES[b][0]} Yeni rozet: ${BADGES[b][1]}`, 'ok', 5000); }
  if (levelOf(s.xp) > beforeLevel) { celebrate(); toast(`🎉 Seviye ${levelOf(s.xp)}!`, 'ok', 4000); }
  return s;
}

export async function updateXpPill(s) {
  s = s || await getStats();
  const el = document.getElementById('xp-pill');
  if (!el) return;
  const streakOk = s.lastDay && dayDiff(s.lastDay, today()) <= 1;
  el.textContent = `🔥 ${streakOk ? s.streak : 0} · Sv ${levelOf(s.xp)} · ${s.days[today()] || 0}/${s.goal} puan`;
}

// ---------- Duygu: doğru cevapta kutlama, yanlışta hafif uyarı ----------
let actx = null;
function tone(freqs, dur = 0.12, type = 'sine', vol = 0.08) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      const t = actx.currentTime + i * dur;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.8);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur * 2);
    });
  } catch {}
}
const soundOn = () => localStorage.getItem('ds-sound') !== 'off';
export function correctFx(el) { if (soundOn()) tone([660, 880], 0.09); el?.classList.add('pop'); setTimeout(() => el?.classList.remove('pop'), 500); }
export function wrongFx(el) { if (soundOn()) tone([220, 180], 0.12, 'triangle', 0.06); el?.classList.add('shake'); setTimeout(() => el?.classList.remove('shake'), 500); }

export function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (soundOn()) tone([523, 659, 784, 1047], 0.1);
  const cv = h('canvas', { class: 'confetti' });
  document.body.append(cv);
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ['#8ab4ff', '#5fd39a', '#f6c26b', '#f48fb1', '#b39ddb', '#80cbc4'];
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 4, r: Math.random() * 6 + 3, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
  let f = 0;
  (function step() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.vx *= 0.99; p.a += 0.2; ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
    if (++f < 110) requestAnimationFrame(step); else cv.remove();
  })();
}

// ---------- Hata defteri: yanlış yapılan sorular aralıklı olarak geri gelir ----------
// FSRS-6 (js/srs.js): her yanlış kararlılığı düşürür, her doğru büyütür; seviye 5 (21+ gün kararlı) olunca defterden çıkar.
const ESKI_GUN = [0, 1, 3, 7, 21, 60]; // 0.8.2'ye dek kutu aralıkları (gün): eski kayıtların ilerlemesi korunur
const durumu = (m) => m.fsrs || (m.box ? eskidenDurum({ gun: ESKI_GUN[Math.min(5, m.box)] || 1, due: m.due }) : null);
function isle(m, dogru) { const st = tekrar(durumu(m), dogru); Object.assign(m, { box: st.box, due: st.due, fsrs: sakla(st) }); }
export async function addMistakes(items) {
  const list = await getSetting('mistakes', []);
  for (const it of items) {
    const ex = list.find((m) => m.q.q === it.q.q);
    if (ex) { isle(ex, false); ex.misses = (ex.misses || 1) + 1; }
    else { const m = { ...it, misses: 1, addedAt: Date.now() }; isle(m, false); list.push(m); }
  }
  await setSetting('mistakes', list.slice(-500));
}
export async function resolveMistake(qText, correct) {
  const list = await getSetting('mistakes', []);
  const m = list.find((x) => x.q.q === qText);
  if (!m) return;
  isle(m, correct);
  if (!correct) m.misses = (m.misses || 1) + 1;
  await setSetting('mistakes', m.box >= 5 ? list.filter((x) => x !== m) : list);
}
export async function dueMistakes() { return (await getSetting('mistakes', [])).filter((m) => (m.due || 0) <= Date.now()); }

// ---------- Hazırlık durumu: defter bazında ustalık ----------
export async function readiness(notebookId) {
  const arts = await db.artifacts.where('notebookId').equals(notebookId).filter((a) => a.status === 'done').toArray();
  let cardTotal = 0, cardScore = 0, due = 0, quizScores = [];
  for (const a of arts) {
    if (a.type === 'flashcards') {
      const cards = a.content.cards || []; const pr = a.content.progress || {};
      cardTotal += cards.length;
      cards.forEach((_, i) => { cardScore += ((pr[i]?.box || 0) / 5); if (!pr[i] || (pr[i].due || 0) <= Date.now()) due++; });
    }
    if (a.type === 'quiz') for (const t of a.content.attempts || []) quizScores.push(t.score / t.total);
  }
  const cards = cardTotal ? cardScore / cardTotal : null;
  const quiz = quizScores.length ? quizScores.slice(-3).reduce((x, y) => x + y, 0) / Math.min(3, quizScores.length) : null;
  const parts = [cards, quiz].filter((x) => x !== null);
  return { score: parts.length ? Math.round((parts.reduce((x, y) => x + y, 0) / parts.length) * 100) : 0, dueCards: due, cardTotal, quizzes: quizScores.length, lastQuiz: quiz !== null ? Math.round(quiz * 100) : null, arts };
}

// ---------- Öğrenme bilimi sayfası ----------
export function sciencePage() {
  const item = (emoji, t, d, how) => h('div', { class: 'card sci' }, h('div', { class: 'sci-ic' }, emoji), h('div', {}, h('h3', {}, t), h('p', {}, d), h('p', { class: 'muted small' }, h('b', {}, 'Uygulamada: '), how)));
  return h('div', { class: 'science' },
    h('h1', {}, 'Kalıcı öğrenmenin bilimi'),
    h('p', { class: 'lead' }, 'Defter Studio, bilişsel bilimin en güçlü kanıtlara sahip tekniklerini bir arada kullanır. Amaç bilgiyi bir kez görmek değil, yıllar sonra da geri çağırabilmektir.'),
    h('div', { class: 'sci-grid' },
      item('🔁', 'Aralıklı tekrar', 'Bilgi unutulmaya başladığı anda tekrar edilince hafıza her seferinde güçlenir. Tek oturumda yoğun çalışmak yerine günlere yaymak çok daha kalıcıdır.', 'Bilgi kartları, hata defteri ve soru bankası FSRS-6 ile planlanır: her bilginin unutulma hızı ayrı hesaplanır, hatırlama olasılığı %90’a düşmeden geri gelir; "Bugün" sekmesi ne zaman neyi tekrar edeceğini söyler.'),
      item('🎯', 'Geri çağırma pratiği', 'Okumak yerine hatırlamaya çalışmak (kendini test etmek) öğrenmenin en güçlü yollarından biridir. Zorlanarak hatırlamak izi derinleştirir.', 'Testler, kartlar, hafıza sarayı testi ve sözlü sınav provası.'),
      item('🧑‍🏫', 'Öğreterek öğrenme', 'Bir konuyu başkasına anlatmaya hazırlanmak ve anlatmak, boşlukları ortaya çıkarır ve anlamayı derinleştirir.', '"Öğreterek Öğren" aracında konuyu sesli ya da yazılı anlatırsın; yapay zeka öğrenci gibi dinleyip puanlar ve eksikleri söyler.'),
      item('🖼️', 'İkili kodlama', 'Söz ile görüntü birlikte kodlandığında hatırlama kolaylaşır.', 'İnfografik, zihin haritası, video özet ve hafıza tekniklerindeki emoji/imge sahneleri.'),
      item('🏛️', 'Hafıza sarayı (loci)', 'Bilgileri iyi bildiğin bir mekânda sırayla yerleştirip zihinde yürümek, hafıza şampiyonlarının temel yöntemidir.', '"Hafıza Teknikleri" aracı evine, gemiye veya okuluna kişisel bir saray kurar.'),
      item('💥', 'Duygu ve şaşırtıcılık', 'Güçlü duygu ve beklenmedik, abartılı imgeler hatırlamayı artırır. Bu yüzden ipuçları komik, dramatik ya da çarpıcı yazılır.', '"Hikâyeyle öğren" podcast biçimi, hafıza sahneleri, doğru cevapta kutlama ve seri/rozet sistemi.'),
      item('🔀', 'Karışık çalışma', 'Konuları karıştırarak çalışmak, hangi bilginin ne zaman kullanılacağını ayırt etmeyi öğretir.', 'Deneme sınavı farklı konulardan karışık soru getirir; kartlarda "Karıştır".'),
      item('🗣️', 'Tartışma ve açıklama', '"Neden?" ve "Nasıl?" sorularıyla bilgiyi kendi cümlelerinle bağlamak anlamayı kalıcılaştırır.', 'İstişare, münazara ve tartışma podcast biçimleri; sohbette "Bunu bana açıkla".'),
      item('😴', 'Uyku ve mola', 'Öğrenilenler uykuda pekişir. 25-50 dakikalık oturumlar ve kısa molalar dikkati korur.', 'Günlük hedef ve seri sistemi her gün az ama düzenli çalışmayı teşvik eder.')
    ),
    masteryArt(),
    methodsLibrary(),
    h('div', { class: 'card note-myth' }, h('h3', {}, 'Öğrenme piramidi yüzdeleri hakkında'),
      h('p', {}, '"Okuduğumuzun %10’unu, öğrettiğimizin %90’ını hatırlarız" gibi yüzdeler Edgar Dale’in Yaşantı Konisi’ne sonradan eklenmiştir; Dale’in kendisi yüzde vermemiştir ve bu rakamlar kontrollü araştırmalarla desteklenmez. Yine de ana fikir doğru yöndedir: aktif katılım, kendini test etme ve başkasına öğretme pasif okumadan daha kalıcıdır. Uygulama bu yüzden yüzdelere değil, kanıtlanmış tekniklere dayanır.')),
    h('div', { class: 'card' }, h('h3', {}, 'Sınav hedefi'),
      h('p', {}, 'Hiçbir araç belirli bir puanı garanti edemez; sonucu çalışma süresi ve düzen belirler. Defter Studio şunu sağlar: hedef puanını (ör. 70) seçersin, deneme sınavlarıyla nerede olduğunu görürsün, yanlışların hata defterine düşer ve ustalaşana kadar geri gelir. Hazırlık göstergesi hedefi geçtiğinde sınava hazır olduğunu anlarsın.')));
}

// ---------------- Yöntemler kütüphanesi: kanıt düzeyiyle ----------------
const EV = { y: ['Yüksek kanıt', 'ev-y'], o: ['Orta kanıt', 'ev-o'], d: ['Düşük (tek başına)', 'ev-d'], m: ['Bilimsel değil', 'ev-m'] };
const METHODS = [
  ['Kanıtı en güçlü teknikler (Dunlosky ve ark., 2013)', [
    ['y', 'Kendini test etme (geri çağırma)', 'Okumak yerine hatırlamaya çalışmak, uzun süreli hatırlamayı en çok artıran tekniktir (test etkisi).', 'Test, bilgi kartları, soru bankası, sözlü sınav provası.'],
    ['y', 'Aralıklı tekrar', 'Aynı süreyi günlere yaymak tek oturumdan çok daha kalıcıdır. Unutmaya başladığınız anda tekrar etmek en verimlisidir.', 'Soru bankası, kartlar ve hata defteri FSRS-6 ile soruları tam unutmak üzereyken geri getirir; doğru cevaplandıkça aralık büyür.'],
    ['o', 'Karışık çalışma (interleaving)', 'Konuları karıştırmak hangi bilginin ne zaman kullanılacağını ayırt etmeyi öğretir; özellikle problem türlerinde güçlü.', 'Deneme sınavı ve bankadan “Tümünden karışık” test.'],
    ['o', 'Neden-nasıl sorgulama', '“Bu neden doğru?” sorusunu sormak bilgiyi bildiklerinize bağlar.', 'Sohbette “neden?” diye sorun; münazara ve istişare podcastleri.'],
    ['o', 'Kendine açıklama', 'Bir adımı ya da örneği kendi cümlelerinizle açıklamak anlamayı derinleştirir.', 'Öğreterek Öğren aracı (Feynman tekniği) ve puanlı geri bildirim.'],
    ['d', 'Özet çıkarma, altını çizme, tekrar okuma', 'Tek başına zayıftır: tanıdıklık hissi verir ama hatırlamayı az artırır. Testle birleştirince işe yarar.', 'Rapor ve notları okuduktan sonra mutlaka kısa bir test çözün.']]],
  ['Yapılandırılmış yöntemler', [
    ['o', 'Feynman tekniği', 'Konuyu hiç bilmeyen birine basitçe anlatın; tıkandığınız yer eksiğinizdir. Kaynağa dönün, yeniden anlatın.', 'Öğreterek Öğren aracı.'],
    ['o', 'Hatırla ve yaz (blurting)', 'Kitabı kapatıp konu hakkında hatırladığınız her şeyi yazın, sonra kaynakla karşılaştırıp eksikleri işaretleyin.', 'Öğreterek Öğren aracında “yazılı anlat” seçeneği eksik noktaları listeler.'],
    ['o', 'Cornell not alma ve SQ3R', 'Göz at → soru çıkar → oku → kendin anlat → tekrar et. Notları soru-cevap biçiminde tutmak testi kolaylaştırır.', 'Notlar + bilgi kartları (soru–cevap / boşluk doldurma).'],
    ['o', 'Pomodoro', '25 dakika kesintisiz odak + 5 dakika mola. Dikkati korur ve başlamayı kolaylaştırır; kanıtı dikkat ve mola araştırmalarına dayanır.', 'Üst çubuktaki ⏱ düğmesi.'],
    ['y', 'Çözümlü örnek ve ön test', 'Yeni konuda önce çözümlü örnek incelemek, öğrenmeden önce kısa bir ön test çözmek sonraki öğrenmeyi güçlendirir.', 'Konuya başlamadan bankadan 10 soruluk test çözün; yanlışlar hata defterine düşer.'],
    ['o', 'İkili kodlama', 'Söz ve görüntüyü birlikte kullanmak hatırlamayı kolaylaştırır.', 'İnfografik, zihin haritası, video özet, slaytlardaki grafik ve tablolar.']]],
  ['Hafıza şampiyonlarının yöntemleri', [
    ['y', 'Hafıza sarayı (loci)', 'Bilgileri iyi bildiğiniz bir mekânda sırayla yerleştirip zihinde yürürsünüz. 40 günlük loci eğitimi, hiç deneyimi olmayanların hatırlamasını belirgin artırmıştır (Dresler ve ark., 2017).', 'Hafıza Teknikleri aracı.'],
    ['o', 'Major sistemi ve PAO', 'Rakamları ünsüzlere çevirip kelime yapma (Major) ve her iki haneyi Kişi-Eylem-Nesne imgesine dönüştürme (PAO): sayı, tarih, frekans ezberinin temeli.', 'Hafıza Teknikleri aracında sayı ve frekanslar için imge önerileri.'],
    ['o', 'Parçalama (chunking)', 'Uzun diziyi anlamlı küçük gruplara bölmek çalışma belleğinin sınırını aşmanızı sağlar (ör. 0532 412 76 89).', 'Kartlarda uzun listeleri parçalara bölün.'],
    ['m', '“Fotoğrafik hafıza”', 'Yetişkinlerde bir sayfayı fotoğraf gibi saklayıp okuyabilme (eidetik hafıza) bilimsel olarak gösterilememiştir. Şampiyonlar bunu doğuştan değil, yukarıdaki tekniklerle ve çok çalışarak yapar.', 'Hedefi “fotoğraf çekmek” değil, loci + aralıklı tekrar olarak koyun.']]],
  ['Çok sayıda kitap ve uzun metin ezberleme', [
    ['o', 'Hafızlık usulü: yeni + yakın + eski', 'Her gün az miktarda yeni metin, son günlerin tekrarı ve eskilerin dönüşümlü tekrarı. Bu, aralıklı tekrarın geleneksel ve çok etkili bir biçimidir.', 'Soru bankasının “Akıllı tekrar” modu: önce vadesi gelenler, sonra yeniler.'],
    ['o', 'Anlam önce, ezber sonra', 'Ezberlemeden önce bölümü anlamak, yapısını (başlıklar, ana fikirler) çıkarmak ezberi kolaylaştırır.', 'Zihin haritası ve rapor → sonra kartlar ve test.'],
    ['d', 'Hızlı okuma ile ezber', 'Dakikada ~400 kelimenin çok üstündeki hızlarda anlama düşer (Rayner ve ark., 2016). Hızlı okuma göz gezdirme için yararlıdır, ezber için değil.', 'Hızlı Okuma aracı her metinden sonra anlama testi yapar.']]],
  ['Dil öğrenme: bebek gibi mi, yetişkin gibi mi?', [
    ['y', 'Anlaşılır girdi (bebek yolu)', 'Bebekler binlerce saat, bağlam içinde anladıkları konuşmayı dinleyerek ve etkileşerek öğrenir; ses dizilerindeki örüntüleri istatistiksel olarak yakalarlar (Saffran ve ark., 1996).', 'Dinleyerek Öğren › Dinleme banyosu: metne bakmadan dinleyin, sonra metni açın.'],
    ['y', 'Açık öğretim + bol girdi (yetişkin yolu)', 'Yetişkinler kural ve kelimeyi açıkça öğrenince başta çocuklardan hızlı ilerler; açık öğretimin etkisi meta-analizlerle gösterilmiştir (Norris ve Ortega, 2000). En iyisi ikisini birleştirmektir.', 'Rapor/kartlarla kuralı öğrenin, dikte ve gölgelemeyle pekiştirin.'],
    ['o', 'Gölgeleme (shadowing) ve dikte', 'Dinlediğini hemen tekrar etmek telaffuz ve akıcılığı, duyduğunu yazmak dinlediğini anlamayı geliştirir.', 'Dinleyerek Öğren › Gölgeleme ve Dikte; hızı 0,6×’ten 1,25×’e çıkarın.'],
    ['o', 'Yaşın etkisi', 'Doğal aksan için erken yaş avantajlıdır; dilbilgisini anadil düzeyinde öğrenme yeteneği geç ergenliğe kadar yüksek kalır (Hartshorne ve ark., 2018). Yetişkinler yine de çok iyi düzeye ulaşabilir.', 'Her gün az ama düzenli dinleme + aralıklı tekrar.']]],
  ['Yaygın mitler', [
    ['m', 'Öğrenme stilleri (görsel/işitsel/kinestetik)', 'Öğretimi kişinin “stiline” uydurmanın öğrenmeyi artırdığına dair güvenilir kanıt yoktur (Pashler ve ark., 2008). İçeriğe uygun biçim (ör. harita için görsel) önemlidir.', 'Her konuda birkaç biçimi birlikte kullanın.'],
    ['m', 'Öğrenme piramidi yüzdeleri', '“Okuduğumuzun %10’u, öğrettiğimizin %90’ı” rakamları araştırmaya dayanmaz. Ana fikir (aktif > pasif) ise doğrudur.', 'Okuduktan sonra test edin ve anlatın.'],
    ['m', '“Beynimizin %10’unu kullanırız”', 'Beyin görüntüleme çalışmaları beynin neredeyse tamamının etkin olduğunu gösterir.', '—']]]
];
export function methodsLibrary() {
  return h('div', { class: 'methods' },
    h('h2', {}, 'Yöntemler kütüphanesi'),
    h('p', { class: 'muted' }, 'Dünyada en çok kullanılan öğrenme ve ezber yöntemleri, kanıt düzeyleriyle. Etiketler: ', ...Object.values(EV).map(([t, c]) => h('span', { class: 'ev ' + c }, t))),
    ...METHODS.map(([title, items]) => h('section', {}, h('h3', {}, title), h('div', { class: 'm-grid' }, items.map(([ev, t, d, how]) =>
      h('div', { class: 'card m-item' }, h('div', { class: 'row gap' }, h('b', { class: 'grow' }, t), h('span', { class: 'ev ' + EV[ev][1] }, EV[ev][0])), h('p', {}, d), h('p', { class: 'muted small' }, h('b', {}, 'Uygulamada: '), how)))))),
    h('details', { class: 'card' }, h('summary', {}, 'Kaynaklar'),
      h('ul', { class: 'small' },
        h('li', {}, 'Dunlosky, J. ve ark. (2013). Improving students’ learning with effective learning techniques. Psychological Science in the Public Interest, 14(1).'),
        h('li', {}, 'Roediger, H. L. ve Karpicke, J. D. (2006). Test-enhanced learning. Psychological Science, 17(3).'),
        h('li', {}, 'Dresler, M. ve ark. (2017). Mnemonic training reshapes brain networks to support superior memory. Neuron, 93(5).'),
        h('li', {}, 'Rayner, K. ve ark. (2016). So much to read, so little time. Psychological Science in the Public Interest, 17(1).'),
        h('li', {}, 'Saffran, J. R., Aslin, R. N. ve Newport, E. L. (1996). Statistical learning by 8-month-old infants. Science, 274.'),
        h('li', {}, 'Norris, J. M. ve Ortega, L. (2000). Effectiveness of L2 instruction: A research synthesis. Language Learning, 50(3).'),
        h('li', {}, 'Hartshorne, J. K., Tenenbaum, J. B. ve Pinker, S. (2018). A critical period for second language acquisition. Cognition, 177.'),
        h('li', {}, 'Pashler, H. ve ark. (2008). Learning styles: Concepts and evidence. Psychological Science in the Public Interest, 9(3).'))));
}

// ---------------- Ustalık sanatı: öğrenmenin mimarisi ----------------
// Kaynak fikirler: Eric S. Raymond, "How To Become A Hacker" (tutum, yaparak öğrenme, usta-çırak ilişkisi);
// Japon dövüş sanatlarındaki Shu-Ha-Ri; İbn Haldun'un Mukaddime'deki tedrîc (adım adım) ve tekrar ilkesi; hafızlık geleneği;
// Talmud'daki havruta (eşli tartışmalı çalışma); Sokrates'in soru yöntemi; Feynman; Ericsson'un bilinçli pratik araştırmaları.
const MASTERY_STAGES = [
  ['守 Shu — İzle (çırak)', 'Ustaya bak, ustayı izle. Kuralları ve temelleri olduğu gibi, eksiksiz öğren; ezberle, kopyala, tekrar et. Eleştirmeden önce anla.', 'Rapor ve slaytlarla konuyu gör; bilgi kartları ve dikteyle kelimesi kelimesine öğren; hafızlık usulü tekrar.'],
  ['破 Ha — Kır (kalfa)', 'Ustayla yürü. Kuralları farklı durumlarda dene, nerede işe yaradığını ve nerede yaramadığını keşfet; başka ustaların yollarını karşılaştır.', 'Karışık testler, münazara ve istişare podcastleri, "neden?" sorularıyla sohbet, zor seviyede soru bankası.'],
  ['離 Ri — Aş (usta)', 'Usta gibi gör, ustalaş. Kurallar artık sendedir; yeni durumlarda kendi çözümünü üretir, başkasına öğretirsin.', 'Öğreterek Öğren (beş yaşındaki bir çocuğa anlat), kendi notlarınla yeni kaynak yaz, deneme sınavında hedefin üstüne çık.']
];
const MASTERY_ATTITUDE = [
  ['Problemler büyüleyicidir', 'Usta, bir problemi çözmekten zevk alır; merak öğrenmenin yakıtıdır. Konuyu sevmenin yolu onunla oynamaktır.'],
  ['Aynı problem iki kez çözülmez', 'Öğrendiğini kaydet ve paylaş: not, kart, banka sorusu. Bir kez çözdüğün şeyi yeniden keşfetmekle vakit kaybetme.'],
  ['Sıkıcılık ve tekrar eden angarya kötüdür', 'Mekanik işi araçlara bırak (soru bankası, aralıklı tekrar), zihnini anlamaya ve üretmeye ayır.'],
  ['Tutum yetkinliğin yerini tutmaz', 'İstek tek başına yetmez; her gün pratik, ölçüm ve geri bildirim gerekir. Puanı değil, gerçekten yapabildiğini ölç.'],
  ['Yaparak öğren', 'Okuyarak değil, yaparak öğrenilir: soru çöz, anlat, yaz, kendini test et. Okumak yalnız başlangıçtır.'],
  ['Usta ve topluluk', 'Bir usta bul, çevrene öğrenen insanlar topla, öğrendiğini topluluğa geri ver. Öğretmek ustalığın son basamağıdır.']
];
const CHANNELS = [
  ['✍️ Yazarak', 'Defter tutmak, özet ve kopya çalışması. Benjamin Franklin sevdiği yazıları ezberden yeniden yazıp aslıyla karşılaştırarak üslubunu geliştirdi. Tolstoy ve Leonardo ömür boyu defter ve günlük tuttu.', 'Dikte, notlar, "hatırla ve yaz".'],
  ['👂 Dinleyerek', 'Bebekler dili binlerce saat dinleyerek edinir. Sözlü gelenekte ve hafızlıkta önce ustadan dinlenir, sonra tekrar edilir. Mozart çocukluğunda babasının ve büyük bestecilerin eserlerini sürekli dinleyip kopyaladı.', 'Podcast, dinleme banyosu, gölgeleme.'],
  ['🗣️ Konuşarak ve tartışarak', 'Sokrates soru sorarak öğretti. Medrese ve havruta geleneğinde iki öğrenci metni tartışarak çalışır. Münazara bilgiyi savunmayı ve sınamayı öğretir.', 'Münazara/istişare podcasti, sohbette "neden?", sözlü sınav provası.'],
  ['👁️ Görerek ve gözlemleyerek', 'Sherlock Holmes (kurgusal da olsa) dikkatli gözlemi ve "zihin sarayı"nı simgeler. Mentalist dizisindeki Patrick Jane hafıza sarayı ve gözlem kullanır. Gerçek hafıza şampiyonları da imgelerle çalışır.', 'Zihin haritası, infografik, video, hafıza sarayı.'],
  ['🛠️ Yaparak', 'Raymond: "Kod yazarak öğrenilir." Usta-çırak ilişkisinde iş başında, gerçek problemle öğrenilir. Agatha Christie eczanede çalışırken öğrendiği zehir bilgisini romanlarına taşıdı.', 'Soru çöz, problem uygula, deneme sınavı.'],
  ['🧑‍🏫 Öğreterek', 'Feynman: bir şeyi beş yaşındaki bir çocuğa anlatamıyorsan tam anlamamışsındır. Öğretmeye hazırlanmak boşlukları ortaya çıkarır.', 'Öğreterek Öğren aracı.'],
  ['🔥 Zorlanarak', 'Kolay gelen kalıcı olmaz: kendini test etmek, aralıklı ve karışık çalışmak "istenen zorluklar"dır. Acı çektirmek değil, sınırında çalışmak öğretir.', 'Zor seviye, hata defteri, yalnız yanlışlar testi.'],
  ['🌿 Huzurla ve uykuyla', 'Akış hâli (Csikszentmihalyi) zorlukla beceri dengelendiğinde gelir. Öğrenilenler uykuda pekişir; mola dikkati korur.', 'Pomodoro, günlük hedef, düzenli uyku.']
];
const MASTERS = [
  ['Hafızlar', 'Her gün az yeni sayfa + yakın sayfaların tekrarı + eski cüzlerin dönüşümlü tekrarı; önce ustadan dinleme, sesli okuma, ustaya sunma. Yüzlerce sayfa yıllarca bozulmadan kalır.', 'Soru bankası "akıllı tekrar", dikte, sesli dinleme.'],
  ['İbn Haldun', 'Öğretim adım adım (tedrîc) olmalı: önce konunun özü, sonra ayrıntı, sonra derinlik; aynı konu birkaç turda tekrar edilir. Tek seferde her şeyi yüklemek öğrenciyi yorar.', 'Kısa özet → rapor → test → zor test sırası.'],
  ['Mozart', 'Erken yaşta yoğun dinleme ve kopyalama, babasının sürekli geri bildirimi, binlerce saat bilinçli pratik. "Dâhi" etiketi bu emeği gizler.', 'Her gün düzenli pratik, geri bildirimli test.'],
  ['Feynman', 'Konuyu sade dille anlat, tıkandığın yeri bul, kaynağa dön, yeniden anlat. Bilmediğini bilmek ustalığın başıdır.', 'Öğreterek Öğren.'],
  ['Hacker kültürü (E. S. Raymond)', 'Yaparak öğren, ustaların işini oku, topluluğa katkı ver, sorunları sevgiyle çöz, tekrar eden işi otomatikleştir.', 'Banka ve aralıklı tekrar mekanik işi üstlenir.'],
  ['Tolstoy, Leonardo, Franklin', 'Günlük, defter, kendine kurallar; okuduğunu yazarak işlemek; kendi kendini eğitmek.', 'Notlar, kartlar, hatırla ve yaz.'],
  ['Hafıza şampiyonları', '"Fotoğrafik hafıza" değil, yöntem: hafıza sarayı, sayı-imge sistemleri, çok tekrar. 40 günlük eğitim sıradan insanların hatırlamasını belirgin artırmıştır.', 'Hafıza Teknikleri aracı.'],
  ['Havruta ve medrese geleneği', 'İki kişi aynı metni sesli okur, birbirine sorar, itiraz eder; hoca cevap yerine yeni soru verir.', 'Münazara ve sözlü sınav podcastleri, sohbet.']
];
export function masteryArt() {
  return h('div', { class: 'methods mastery' },
    h('h2', {}, 'Ustalık sanatı: öğrenmenin mimarisi'),
    h('blockquote', { class: 'zen' }, 'Yolu izlemek için: ustaya bak, ustayı izle, ustayla yürü, usta gibi gör, ustalaş.'),
    h('p', { class: 'muted' }, 'Hacker kültüründen hafızlığa, Shu-Ha-Ri\'den Feynman\'a kadar ustalık geleneklerinin ortak mimarisi. Her aşama, uygulamadaki bir araçla eşleşir.'),
    h('section', {}, h('h3', {}, '1. Üç aşama: çıraklık → kalfalık → ustalık'), h('div', { class: 'm-grid' }, MASTERY_STAGES.map(([t, d, how]) => h('div', { class: 'card m-item' }, h('b', {}, t), h('p', {}, d), h('p', { class: 'muted small' }, h('b', {}, 'Uygulamada: '), how))))),
    h('section', {}, h('h3', {}, '2. Ustanın tutumu'), h('div', { class: 'm-grid' }, MASTERY_ATTITUDE.map(([t, d]) => h('div', { class: 'card m-item' }, h('b', {}, t), h('p', {}, d))))),
    h('section', {}, h('h3', {}, '3. Öğrenmenin sekiz kanalı (ustalar nasıl öğrendi?)'), h('div', { class: 'm-grid' }, CHANNELS.map(([t, d, how]) => h('div', { class: 'card m-item' }, h('b', {}, t), h('p', {}, d), h('p', { class: 'muted small' }, h('b', {}, 'Uygulamada: '), how))))),
    h('section', {}, h('h3', {}, '4. Ustaların yolları'), h('div', { class: 'm-grid' }, MASTERS.map(([t, d, how]) => h('div', { class: 'card m-item' }, h('b', {}, t), h('p', {}, d), h('p', { class: 'muted small' }, h('b', {}, 'Uygulamada: '), how))))),
    h('section', {}, h('h3', {}, '5. Günlük ustalık döngüsü'),
      h('ol', { class: 'card' },
        h('li', {}, 'Isın (5 dk): dünkü yanlışlar ve tekrar zamanı gelen sorular (soru bankası › akıllı tekrar).'),
        h('li', {}, 'Dinle ve gör (15 dk): yeni bölümün podcasti ya da videosu; metne bakmadan dinle.'),
        h('li', {}, 'Çalış (25 dk Pomodoro): rapor/slayt, sonra kitabı kapat ve hatırladığını yaz.'),
        h('li', {}, 'Sına (15 dk): yeni konudan 10–20 soru; yanlışlar hata defterine.'),
        h('li', {}, 'Öğret (10 dk): konuyu beş yaşındaki bir çocuğa anlatır gibi Öğreterek Öğren\'de anlat.'),
        h('li', {}, 'Dinlen: mola ve uyku öğrenilenleri pekiştirir. Haftada bir deneme sınavı.'))),
    h('p', { class: 'muted small' }, 'Not: Sherlock Holmes ve Patrick Jane kurgusal karakterlerdir; yöntemleri gerçek hafıza tekniklerine dayandığı için örnek verilmiştir. Kaynaklar: E. S. Raymond, "How To Become A Hacker" (catb.org/~esr/faqs/hacker-howto.html, Türkçe: belgeler.org); İbn Haldun, Mukaddime; K. A. Ericsson ve ark. (1993) bilinçli pratik; Dresler ve ark. (2017).'));
}
