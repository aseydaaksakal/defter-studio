// Studio panelindeki "Soru bankası" kartı: kalan/çözülen sayıları, bankadan anında test (0 token), arka planda doldurma.
import { h, icon, toast, modal } from './ui.js';
import { bankStats, bankJob, startBankFill, pauseBankFill, quizFromBank, onBankProgress, isFilling } from './bank.js';
import { EXAMS } from './studio/gen.js';
import { loadConfig } from './llm.js';
import { getSetting, setSetting } from './db.js';

const cards = new Map(); // defter başına tek kart (Studio paneli sık yeniden çizilir)
export function bankCard(nb, { open }) {
  if (cards.has(nb)) { const c = cards.get(nb); c.open = open; c.paint(); return c.el; }
  const el = h('div', { class: 'card bank' });
  const self = { el, open, paint: (m) => paint(m) };
  cards.set(nb, self);
  const line = h('div', { class: 'muted small', role: 'status' });
  async function paint(msg) {
    const [s, st, exam] = await Promise.all([bankStats(nb), bankJob(nb), getSetting('examDate:' + nb, '')]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = exam ? Math.round((new Date(exam + 'T00:00') - today) / 864e5) : null; // takvim günü farkı
    const examTR = exam ? new Date(exam + 'T00:00').toLocaleDateString('tr', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const dateIn = h('input', { class: 'input small-in', type: 'date', value: exam || '', 'aria-label': 'Sınav tarihi', onchange: async (e) => { await setSetting('examDate:' + nb, e.target.value); paint(); } });
    const plan = days === null ? 'Sınav tarihini girin, günlük plan çıkarayım.'
      : days < 0 ? `${examTR} geçti; yeni bir tarih seçin.`
      : days === 0 ? `Sınav bugün (${examTR}): yeni soru yok; yalnız zayıf sorular (${s.weak}) ve kısa bir deneme.`
      : !s.total ? `${examTR}: ${days} gün kaldı. Önce bankayı doldurun.`
      : `${examTR}: ${days} gün kaldı. Her gün ${Math.max(1, Math.ceil(s.unseen / Math.max(1, days - 2)))} yeni soru + tekrar zamanı gelenler (${s.due}). Son 2 gün yalnız tekrar ve deneme sınavı.`;
    const filling = isFilling(nb) || st?.status === 'running';
    const bar = s.total ? h('div', { class: 'meter thin', title: `${s.solved} çözüldü / ${s.total}` }, h('div', { style: { width: Math.round((s.solved / s.total) * 100) + '%' } })) : null;
    line.textContent = msg || (filling ? `Arka planda üretiliyor ${s.total}/${st.target}…` : st?.error ? '⚠ ' + st.error : st?.status === 'done' ? `Hedef ${st.target} soruya ulaşıldı.` : '');
    el.replaceChildren(
      h('div', { class: 'row gap' }, icon('quiz', 18), h('b', { class: 'grow' }, 'Soru bankası'), h('span', { class: 'chip ghosty' }, s.total + ' soru')),
      s.total ? h('div', { class: 'bank-nums' },
        h('span', {}, h('b', {}, s.unseen), ' henüz çözülmedi'), h('span', {}, h('b', {}, s.solved), ' çözüldü'),
        s.due ? h('span', {}, h('b', {}, s.due), ' tekrar zamanı') : null, s.weak ? h('span', {}, h('b', {}, s.weak), ' zayıf') : null,
        s.accuracy != null ? h('span', {}, 'doğruluk ', h('b', {}, '%' + s.accuracy)) : null) : h('p', { class: 'muted small' }, 'Soruları bir kez (lokal modelle ücretsiz) üretin; sonra istediğiniz sayıda test token harcamadan anında hazırlansın.'),
      bar, line,
      h('div', { class: 'row gap wrap small' }, h('span', {}, '📅 Sınav tarihi'), dateIn, h('span', { class: 'muted grow' }, plan)),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn primary small', disabled: s.total ? null : true, onclick: () => testDialog(s) }, icon('play', 15), ' Bankadan test (0 token)'),
        filling ? h('button', { class: 'btn ghost small', onclick: async () => { await pauseBankFill(nb); paint(); } }, '⏸ Duraklat')
          : h('button', { class: 'btn ghost small', onclick: () => fillDialog(s, st) }, icon('plus', 15), st?.status === 'paused' ? ' Devam et / doldur' : ' Bankayı doldur')));
  }
  function testDialog(s) {
    let count = Math.min(20, s.total), mode = s.due ? 'smart' : s.unseen ? 'unseen' : 'smart', topic = '', exam = false;
    const num = h('input', { class: 'input count-in', type: 'number', min: 1, max: s.total, value: count, oninput: (e) => (count = Math.max(1, Math.min(s.total, +e.target.value || 1))) });
    const modes = [['smart', `Akıllı tekrar (önce tekrar zamanı gelenler ve yanlışlar)`], ['unseen', `Hiç çözülmemiş (${s.unseen})`], ['wrong', `Yanlış cevaplananlar (${s.weak})`], ['all', 'Tümünden karışık']];
    const body = h('div', { class: 'cust' },
      h('div', { class: 'field inline' }, h('label', {}, 'Soru sayısı'), h('div', { class: 'row gap wrap' }, h('div', { class: 'seg' }, [10, 20, 50, 100].filter((n) => n <= s.total).map((n) => h('button', { onclick: () => { count = n; num.value = n; } }, String(n)))), num)),
      h('div', { class: 'field inline' }, h('label', {}, 'Hangi sorular'), h('select', { class: 'input', onchange: (e) => (mode = e.target.value) }, modes.map(([v, t]) => h('option', { value: v, selected: v === mode ? true : null }, t)))),
      h('div', { class: 'field inline' }, h('label', {}, 'Konu'), h('select', { class: 'input', onchange: (e) => (topic = e.target.value) }, h('option', { value: '' }, 'Tüm konular'), Object.entries(s.topics).sort((a, b) => b[1].total - a[1].total).map(([t, v]) => h('option', { value: t }, `${t} (${v.total}, ${v.unseen} çözülmedi)`)))),
      h('label', { class: 'row gap small' }, h('input', { type: 'checkbox', onchange: (e) => (exam = e.target.checked) }), 'Deneme sınavı modu (süreli, cevaplar sonda)'));
    modal({ title: 'Bankadan test', body, actions: [{ label: 'Vazgeç', run: (c) => c() }, { label: 'Testi başlat', primary: true, run: async (c) => {
      try { const id = await quizFromBank(nb, { count, mode, topic, exam }); c(); self.open(id); } catch (e) { toast(e.message, 'error'); }
    } }] });
  }
  async function fillDialog(s, st) {
    const cfg = await loadConfig();
    const local = ['ollama', 'lmstudio'].includes(cfg.provider);
    let target = Math.max(st?.target || 0, s.total + 100, 100), preset = st?.preset || 'genel', level = st?.level || 'mid', focus = st?.focus || '';
    const lang = await getSetting('lang', 'Türkçe');
    const num = h('input', { class: 'input count-in', type: 'number', min: s.total + 1, max: 5000, value: target, oninput: (e) => (target = +e.target.value || target) });
    const body = h('div', { class: 'cust' },
      h('p', { class: local ? 'ok-t small' : 'muted small' }, local ? `✓ Lokal model (${cfg.model}) kullanılacak: ücretsiz, token harcamaz. Bu bilgisayarda 10 doğrulanmış soru yaklaşık 40 saniyede üretildi (saatte yüzlerce soru).` : `Uyarı: şu an bulut modeli (${cfg.provider}) seçili; her soru token harcar. Ücretsiz doldurmak için Ayarlar’dan Ollama seçin.`),
      h('div', { class: 'field inline' }, h('label', {}, 'Hedef soru sayısı'), h('div', { class: 'row gap wrap' }, h('div', { class: 'seg' }, [100, 200, 500, 1000].map((n) => h('button', { onclick: () => { target = Math.max(n, s.total + 1); num.value = target; } }, String(n)))), num)),
      h('div', { class: 'field inline' }, h('label', {}, 'Sınav türü'), h('select', { class: 'input', onchange: (e) => (preset = e.target.value) }, EXAMS.map((e) => h('option', { value: e.v, selected: e.v === preset ? true : null }, e.t)))),
      h('div', { class: 'field inline' }, h('label', {}, 'Zorluk'), h('select', { class: 'input', onchange: (e) => (level = e.target.value) }, [['easy', 'Kolay'], ['mid', 'Orta (ikinci turda zor)'], ['hard', 'Zor']].map(([v, t]) => h('option', { value: v, selected: v === level ? true : null }, t)))),
      h('div', { class: 'field' }, h('label', {}, 'Odak (isteğe bağlı)'), h('textarea', { class: 'input', rows: 2, placeholder: 'Boş bırakırsanız kaynağın tamamı baştan sona taranır', oninput: (e) => (focus = e.target.value) }, focus)),
      h('p', { class: 'muted small' }, 'Üretim arka planda kaynak bölümlerini sırayla dolaşır, her soru kaynaktan alıntıyla doğrulanır. Sayfayı kapatsanız da bir sonraki açılışta kaldığı yerden devam eder.'));
    modal({ title: 'Soru bankasını doldur', body, actions: [{ label: 'Vazgeç', run: (c) => c() }, { label: 'Başlat', primary: true, run: async (c) => { c(); await startBankFill(nb, { target, preset, level, lang, focus }); paint(); toast('Soru bankası arka planda dolduruluyor'); } }] });
  }
  onBankProgress((id, st) => { if (id === nb && el.isConnected) paint(st?.msg); });
  paint();
  return el;
}
