// 10 parmak Türkçe Q klavye eğitimi: dersler, parmak renkleri, ekran klavyesi, hız/doğruluk, hatalı tuş analizi
import { h, icon, toast } from './ui.js';
import { getSetting, setSetting, db } from './db.js';
import { award, celebrate } from './learn.js';

// Türkçe Q düzeni ve her tuşa basan parmak (L/R + 1 serçe … 4 işaret)
const ROWS = [
  [['"', 'L1'], ['1', 'L1'], ['2', 'L2'], ['3', 'L3'], ['4', 'L4'], ['5', 'L4'], ['6', 'R4'], ['7', 'R4'], ['8', 'R3'], ['9', 'R2'], ['0', 'R1'], ['*', 'R1'], ['-', 'R1']],
  [['q', 'L1'], ['w', 'L2'], ['e', 'L3'], ['r', 'L4'], ['t', 'L4'], ['y', 'R4'], ['u', 'R4'], ['ı', 'R3'], ['o', 'R2'], ['p', 'R1'], ['ğ', 'R1'], ['ü', 'R1']],
  [['a', 'L1'], ['s', 'L2'], ['d', 'L3'], ['f', 'L4'], ['g', 'L4'], ['h', 'R4'], ['j', 'R4'], ['k', 'R3'], ['l', 'R2'], ['ş', 'R1'], ['i', 'R1'], [',', 'R1']],
  [['<', 'L1'], ['z', 'L1'], ['x', 'L2'], ['c', 'L3'], ['v', 'L4'], ['b', 'L4'], ['n', 'R4'], ['m', 'R4'], ['ö', 'R3'], ['ç', 'R2'], ['.', 'R1']]
];
const FINGER = Object.fromEntries(ROWS.flat().map(([k, f]) => [k, f]));
FINGER[' '] = 'TH';
const FNAME = { L1: 'sol serçe', L2: 'sol yüzük', L3: 'sol orta', L4: 'sol işaret', R4: 'sağ işaret', R3: 'sağ orta', R2: 'sağ yüzük', R1: 'sağ serçe', TH: 'başparmak' };

export const LESSONS = [
  { t: 'Ana sıra: f j', k: 'fj' }, { t: 'd k', k: 'fjdk' }, { t: 's l', k: 'fjdksl' }, { t: 'a ş', k: 'fjdkslaş' },
  { t: 'g h', k: 'fjdkslaşgh' }, { t: 'i (sağ serçe)', k: 'fjdkslaşghi' }, { t: 'r u', k: 'fjdkslaşghiru' },
  { t: 'e ı', k: 'fjdkslaşghirueı' }, { t: 't y', k: 'fjdkslaşghirueıty' }, { t: 'w o', k: 'fjdkslaşghirueıtywo' },
  { t: 'q p', k: 'fjdkslaşghirueıtywoqp' }, { t: 'ğ ü', k: 'fjdkslaşghirueıtywoqpğü' }, { t: 'v m', k: 'fjdkslaşghirueıtywoqpğüvm' },
  { t: 'b n', k: 'fjdkslaşghirueıtywoqpğüvmbn' }, { t: 'c ö', k: 'fjdkslaşghirueıtywoqpğüvmbncö' },
  { t: 'x ç', k: 'fjdkslaşghirueıtywoqpğüvmbncöxç' }, { t: 'z . ,', k: 'fjdkslaşghirueıtywoqpğüvmbncöxçz.,' },
  { t: 'Tüm harfler', k: 'abcçdefgğhıijklmnoöprsştuüvyz' }, { t: 'Büyük harf ve noktalama', k: '*', caps: true },
  { t: 'Sayılar', k: '*', nums: true }, { t: 'Kendi kaynaklarından metin', k: '*', source: true }
];
const WORDS = ('ve bir bu da de ile için gibi daha çok en ama her şey kadar sonra önce gemi deniz kıyı sahil liman telsiz kanal sinyal uydu harita rota rüzgar dalga fener işaret yardım tehlike güvenlik emniyet acil haber bilgi kaynak kitap defter kalem okul sınıf ders sınav test soru cevap öğrenci öğretmen hafıza akıl zihin düşünce fikir kelime cümle metin yazı okuma yazma dinleme konuşma anlama öğrenme tekrar pratik çalışma başarı hedef puan sonuç yol yıl gün saat dakika zaman sabah akşam gece hafta ay şehir köy ülke dünya insan aile anne baba kardeş arkadaş dost el göz kulak kalp beyin su hava ateş toprak ağaç çiçek kuş balık deniz göl nehir dağ orman yeşil mavi kırmızı sarı beyaz siyah büyük küçük uzun kısa yeni eski güzel iyi kötü hızlı yavaş kolay zor sıcak soğuk açık kapalı doğru yanlış ilk son orta ön arka sağ sol üst alt içinde dışında şimdi bugün yarın dün her zaman asla belki evet hayır lütfen teşekkür merhaba hoşça kal sevgi umut mutluluk cesaret sabır azim başla bitir gel git yap et ver al bak gör bil düşün söyle sor anla öğren öğret çalış dinle oku yaz koş yürü otur kalk aç kapa sev gül ağla').split(' ');

function drill(keys, n = 28) {
  const set = new Set(keys);
  let ws = WORDS.filter((w) => [...w].every((c) => set.has(c)));
  const out = [];
  for (let i = 0; i < n; i++) {
    if (ws.length > 6 && Math.random() < 0.7) out.push(ws[Math.floor(Math.random() * ws.length)]);
    else { const len = 2 + Math.floor(Math.random() * 4); out.push(Array.from({ length: len }, () => keys[Math.floor(Math.random() * keys.length)]).join('')); }
  }
  return out.join(' ');
}

async function sourceText() {
  const srcs = await db.sources.toArray();
  if (!srcs.length) return 'Kaynak eklediğinizde bu derste kendi ders notlarınızı yazarak hem klavyeyi hem konuyu çalışırsınız.';
  const s = srcs[Math.floor(Math.random() * srcs.length)];
  const sents = s.text.replace(/\[\[s\.\d+\]\]/g, '').replace(/\s+/g, ' ').match(/[^.!?]{30,180}[.!?]/g) || [s.text.slice(0, 300)];
  const st = Math.floor(Math.random() * Math.max(1, sents.length - 3));
  return sents.slice(st, st + 3).join(' ').trim();
}

export async function typingPage() {
  const prog = { lesson: 0, best: {}, errors: {}, ...(await getSetting('typing', {})) };
  let li = Math.min(prog.lesson, LESSONS.length - 1);
  let target = '', pos = 0, errors = 0, started = 0, keyErr = {};
  const textEl = h('div', { class: 'ty-text', 'aria-live': 'polite' });
  const kb = h('div', { class: 'ty-kb', 'aria-hidden': 'true' });
  const statsEl = h('div', { class: 'ty-stats' });
  const hint = h('div', { class: 'ty-hint muted' });
  const lessonSel = h('select', { class: 'input small', 'aria-label': 'Ders', onchange: (e) => { li = +e.target.value; newText(); } });
  const input = h('input', { class: 'ty-input', 'aria-label': 'Yazma alanı', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });

  function paintLessons() {
    lessonSel.replaceChildren(...LESSONS.map((l, i) => h('option', { value: i, selected: i === li ? true : null, disabled: i > prog.lesson + 1 ? true : null }, `${i + 1}. ${l.t}${prog.best[i] ? ` · ${prog.best[i].wpm} k/dk` : ''}${i > prog.lesson + 1 ? ' 🔒' : ''}`)));
  }
  ROWS.forEach((row, r) => kb.append(h('div', { class: 'ty-row r' + r }, row.map(([k, f]) => h('span', { class: 'ty-key f-' + f, 'data-k': k }, k)))));
  kb.append(h('div', { class: 'ty-row' }, h('span', { class: 'ty-key space f-TH', 'data-k': ' ' }, 'boşluk')));

  async function newText() {
    const L = LESSONS[li];
    if (L.source) target = await sourceText();
    else if (L.nums) target = Array.from({ length: 14 }, () => Math.floor(Math.random() * 9999)).join(' ');
    else if (L.caps) target = drill('abcçdefgğhıijklmnoöprsştuüvyz'.split(''), 14).split(' ').map((w, i) => (i % 3 === 0 ? w[0].toLocaleUpperCase('tr') + w.slice(1) : w)).join(' ').replace(/(\w+) (\w+) (\w+)/g, '$1 $2, $3.');
    else target = drill(L.k.split(''));
    pos = 0; errors = 0; started = 0; keyErr = {};
    input.value = ''; paint(); input.focus();
    paintLessons();
  }
  function paint() {
    textEl.replaceChildren(...[...target].map((c, i) => h('span', { class: i < pos ? 'ok' : i === pos ? 'cur' : '' }, c === ' ' ? ' ' : c)));
    const next = target[pos] || '';
    const k = next.toLocaleLowerCase('tr');
    kb.querySelectorAll('.ty-key').forEach((n) => n.classList.toggle('next', n.dataset.k === k));
    const f = FINGER[k];
    hint.textContent = next ? `Sıradaki: "${next === ' ' ? 'boşluk' : next}" → ${FNAME[f] || ''} parmak${next !== k ? ' + Shift (karşı el serçe)' : ''}` : '';
    const mins = started ? (Date.now() - started) / 60000 : 0;
    const wpm = mins > 0 ? Math.round((pos / 5) / mins) : 0;
    const acc = pos + errors ? Math.round((pos / (pos + errors)) * 100) : 100;
    statsEl.replaceChildren(stat(wpm, 'kelime/dk'), stat('%' + acc, 'doğruluk'), stat(errors, 'hata'), stat(`${pos}/${target.length}`, 'karakter'));
    return { wpm, acc };
  }
  const stat = (v, l) => h('div', { class: 'ty-stat' }, h('b', {}, v), h('span', {}, l));

  input.addEventListener('keydown', async (e) => {
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (!started) started = Date.now();
    const exp = target[pos];
    const keyEl = kb.querySelector(`.ty-key[data-k="${CSS.escape(e.key.toLocaleLowerCase('tr'))}"]`);
    if (e.key === exp) { pos++; keyEl?.classList.add('hit'); setTimeout(() => keyEl?.classList.remove('hit'), 120); }
    else { errors++; keyErr[exp] = (keyErr[exp] || 0) + 1; keyEl?.classList.add('miss'); setTimeout(() => keyEl?.classList.remove('miss'), 200); textEl.classList.add('shake'); setTimeout(() => textEl.classList.remove('shake'), 300); }
    const { wpm, acc } = paint();
    if (pos >= target.length) {
      for (const [k, v] of Object.entries(keyErr)) prog.errors[k] = (prog.errors[k] || 0) + v;
      const prev = prog.best[li];
      if (!prev || wpm > prev.wpm) prog.best[li] = { wpm, acc };
      const passed = acc >= 95 && wpm >= Math.min(12 + li, 35);
      if (passed && li >= prog.lesson) { prog.lesson = Math.min(LESSONS.length - 1, li + 1); celebrate(); toast('Ders geçildi, sıradaki ders açıldı!', 'ok'); }
      else if (!passed) toast(`Dersi geçmek için %95 doğruluk ve ${Math.min(12 + li, 35)} kelime/dk gerekli.`, 'info', 4500);
      await setSetting('typing', prog);
      await award(passed ? 15 : 5, 'klavye', wpm >= 40 && acc >= 95 ? 'typist' : null);
      paintWeak();
      setTimeout(newText, 900);
    }
  });
  const weak = h('div', { class: 'ty-weak' });
  function paintWeak() {
    const top = Object.entries(prog.errors).sort((a, b) => b[1] - a[1]).slice(0, 8);
    weak.replaceChildren(h('b', {}, 'En çok hata yaptığın tuşlar: '), top.length ? top.map(([k, v]) => h('span', { class: 'chip' }, `${k === ' ' ? 'boşluk' : k} · ${v}`)) : h('span', { class: 'muted' }, 'henüz yok'),
      top.length ? h('button', { class: 'btn ghost small', onclick: () => { target = drill(top.map(([k]) => k).filter((k) => k !== ' ').concat(['a', 'e', 'i']), 24); pos = 0; errors = 0; started = 0; input.value = ''; paint(); input.focus(); } }, 'Zayıf tuşları çalış') : null);
  }
  paintWeak();
  const page = h('div', { class: 'typing' },
    h('div', { class: 'row gap wrap' }, h('h1', { class: 'grow' }, '10 parmak klavye · Türkçe Q'), lessonSel,
      h('button', { class: 'btn ghost small', onclick: newText }, icon('refresh', 16), ' Yeni metin')),
    h('p', { class: 'muted' }, 'Parmaklarını ana sıraya koy: sol el a s d f, sağ el j k l ş. F ve J tuşlarındaki çıkıntıları hisset. Ekrana değil metne bak; renkler hangi parmağın basacağını gösterir.'),
    statsEl,
    h('div', { class: 'ty-box', onclick: () => input.focus() }, textEl, input),
    hint, kb,
    h('div', { class: 'ty-legend' }, Object.entries(FNAME).map(([f, n]) => h('span', { class: 'chip' }, h('i', { class: 'sw f-' + f }), n))),
    weak);
  setTimeout(newText, 0);
  return page;
}
