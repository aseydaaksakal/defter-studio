// Defter Studio — öğrenme motoru: puan/seri/rozet, kutlama, hata defteri, günlük plan, öğrenme bilimi
import { db, getSetting, setSetting } from './db.js';
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
export async function addMistakes(items) {
  const list = await getSetting('mistakes', []);
  for (const it of items) {
    const ex = list.find((m) => m.q.q === it.q.q);
    if (ex) { ex.box = 1; ex.due = Date.now() + 864e5; ex.misses = (ex.misses || 1) + 1; }
    else list.push({ ...it, box: 1, due: Date.now() + 36e5, misses: 1, addedAt: Date.now() });
  }
  await setSetting('mistakes', list.slice(-500));
}
export async function resolveMistake(qText, correct) {
  const list = await getSetting('mistakes', []);
  const m = list.find((x) => x.q.q === qText);
  if (!m) return;
  if (correct) { m.box = (m.box || 1) + 1; m.due = Date.now() + [0, 1, 3, 7, 21, 60][Math.min(5, m.box)] * 864e5; }
  else { m.box = 1; m.due = Date.now() + 864e5; m.misses++; }
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
      item('🔁', 'Aralıklı tekrar', 'Bilgi unutulmaya başladığı anda tekrar edilince hafıza her seferinde güçlenir. Tek oturumda yoğun çalışmak yerine günlere yaymak çok daha kalıcıdır.', 'Bilgi kartları ve hata defteri 1-3-7-21-60 gün aralıklarla geri gelir; "Bugün" sekmesi ne zaman neyi tekrar edeceğini söyler.'),
      item('🎯', 'Geri çağırma pratiği', 'Okumak yerine hatırlamaya çalışmak (kendini test etmek) öğrenmenin en güçlü yollarından biridir. Zorlanarak hatırlamak izi derinleştirir.', 'Testler, kartlar, hafıza sarayı testi ve sözlü sınav provası.'),
      item('🧑‍🏫', 'Öğreterek öğrenme', 'Bir konuyu başkasına anlatmaya hazırlanmak ve anlatmak, boşlukları ortaya çıkarır ve anlamayı derinleştirir.', '"Öğreterek Öğren" aracında konuyu sesli ya da yazılı anlatırsın; yapay zeka öğrenci gibi dinleyip puanlar ve eksikleri söyler.'),
      item('🖼️', 'İkili kodlama', 'Söz ile görüntü birlikte kodlandığında hatırlama kolaylaşır.', 'İnfografik, zihin haritası, video özet ve hafıza tekniklerindeki emoji/imge sahneleri.'),
      item('🏛️', 'Hafıza sarayı (loci)', 'Bilgileri iyi bildiğin bir mekânda sırayla yerleştirip zihinde yürümek, hafıza şampiyonlarının temel yöntemidir.', '"Hafıza Teknikleri" aracı evine, gemiye veya okuluna kişisel bir saray kurar.'),
      item('💥', 'Duygu ve şaşırtıcılık', 'Güçlü duygu ve beklenmedik, abartılı imgeler hatırlamayı artırır. Bu yüzden ipuçları komik, dramatik ya da çarpıcı yazılır.', '"Hikâyeyle öğren" podcast biçimi, hafıza sahneleri, doğru cevapta kutlama ve seri/rozet sistemi.'),
      item('🔀', 'Karışık çalışma', 'Konuları karıştırarak çalışmak, hangi bilginin ne zaman kullanılacağını ayırt etmeyi öğretir.', 'Deneme sınavı farklı konulardan karışık soru getirir; kartlarda "Karıştır".'),
      item('🗣️', 'Tartışma ve açıklama', '"Neden?" ve "Nasıl?" sorularıyla bilgiyi kendi cümlelerinle bağlamak anlamayı kalıcılaştırır.', 'İstişare, münazara ve tartışma podcast biçimleri; sohbette "Bunu bana açıkla".'),
      item('😴', 'Uyku ve mola', 'Öğrenilenler uykuda pekişir. 25-50 dakikalık oturumlar ve kısa molalar dikkati korur.', 'Günlük hedef ve seri sistemi her gün az ama düzenli çalışmayı teşvik eder.')
    ),
    h('div', { class: 'card note-myth' }, h('h3', {}, 'Öğrenme piramidi yüzdeleri hakkında'),
      h('p', {}, '"Okuduğumuzun %10’unu, öğrettiğimizin %90’ını hatırlarız" gibi yüzdeler Edgar Dale’in Yaşantı Konisi’ne sonradan eklenmiştir; Dale’in kendisi yüzde vermemiştir ve bu rakamlar kontrollü araştırmalarla desteklenmez. Yine de ana fikir doğru yöndedir: aktif katılım, kendini test etme ve başkasına öğretme pasif okumadan daha kalıcıdır. Uygulama bu yüzden yüzdelere değil, kanıtlanmış tekniklere dayanır.')),
    h('div', { class: 'card' }, h('h3', {}, 'Sınav hedefi'),
      h('p', {}, 'Hiçbir araç belirli bir puanı garanti edemez; sonucu çalışma süresi ve düzen belirler. Defter Studio şunu sağlar: hedef puanını (ör. 70) seçersin, deneme sınavlarıyla nerede olduğunu görürsün, yanlışların hata defterine düşer ve ustalaşana kadar geri gelir. Hazırlık göstergesi hedefi geçtiğinde sınava hazır olduğunu anlarsın.')));
}
