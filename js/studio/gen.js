// Defter Studio — Studio üreticileri (istemler + JSON şemaları)
// Her üretici kaynak bağlamını alır, modelden yapılandırılmış JSON ister ve artifact içeriğini döndürür.
import { chat, chatJSON } from '../llm.js';
import { buildContext, sliceContexts } from '../sources.js';
import { generateExact, shortNote } from './batch.js';
import { summarize } from '../verify.js';
import { loadTTS } from '../tts.js';

export const LANGS = ['Türkçe', 'English', 'Deutsch', 'Français', 'Español', 'العربية', 'Русский', 'Italiano', 'Nederlands', '日本語'];

const BASE_RULES = (lang) => `Kurallar:
- Yalnızca verilen KAYNAKLAR'daki bilgiye dayan. Kaynakta olmayan bilgiyi uydurma.
- Tarih, sayı, frekans ve kısaltmaları kaynaktaki gibi doğru aktar.
- Çıktı dili: ${lang}.
- Yalnızca istenen JSON nesnesini döndür; önüne ya da arkasına açıklama yazma.`;

const ctxBlock = (ctx) => `KAYNAKLAR (köşeli parantezdeki numara parçanın kimliğidir):\n\n${ctx.text}`;
const focusLine = (f) => (f ? `\nODAK / KULLANICI İSTEĞİ: ${f}\n` : '');

async function json(system, user, signal, role) {
  return chatJSON({ system, messages: [{ role: 'user', content: user }], signal, role });
}
const refsOf = (ctx) => ctx.refs.map(({ n, sourceId, title, page, text }) => ({ n, sourceId, title, page, text: text.slice(0, 600) }));

// Biçime göre konuşmacı kadrosu. count: 'auto' (biçimin kendi kadrosu) ya da 2-6; roster: Ayarlar'daki "Ses kadrosu"
// ([{name, gender, voice}]); voices === 'cast' ise adlar, cinsiyetler ve kütüphane sesleri oradan gelir.
const ROLES = {
  brief: ['anlatıcı'], lecture: ['hoca', 'öğrenci'], consult: ['moderatör', 'uzman 1', 'uzman 2'],
  munazara: ['moderatör ve hakem', 'lehte konuşmacı', 'aleyhte konuşmacı'], exam: ['sınav görevlisi', 'aday', 'eğitmen'],
  story: ['anlatıcı', 'karakter'], critique: ['baş eleştirmen', 'ikinci uzman'], deep: ['sunucu', 'sunucu'], debate: ['sunucu', 'sunucu']
};
const EXTRA_ROLE = { deep: 'sunucu', debate: 'tartışmacı', lecture: 'öğrenci', consult: 'uzman', munazara: 'jüri üyesi', exam: 'gözlemci', story: 'karakter', critique: 'uzman' };
export const MAX_SPEAKERS = 6;
export function castFor(format, voices = 'fm', count = 'auto', roster = []) {
  const F = ['Deniz', 'Elif', 'Zeynep', 'Ayşe', 'Selin', 'Defne'], M = ['Kaan', 'Emre', 'Murat', 'Can', 'Mert', 'Berk'];
  const base = ROLES[format] || ROLES.deep;
  const useRoster = voices === 'cast' && Array.isArray(roster) && roster.length > 1; // karakter kadrosu kuruluysa 'Otomatik' sayı = kadro büyüklüğü
  const n = format === 'brief' ? 1 : Math.min(MAX_SPEAKERS, Math.max(base.length, count === 'auto' ? (useRoster ? roster.length : base.length) : parseInt(count, 10) || base.length));
  const roles = Array.from({ length: n }, (_, i) => base[i] || (format === 'consult' ? `uzman ${i}` : `${EXTRA_ROLE[format] || 'konuk'} ${i - base.length + 1}`));
  const useCast = voices === 'cast' && Array.isArray(roster) && roster.length > 0;
  return roles.map((role, i) => {
    const r = useCast ? roster[i] : null;
    const g = r ? (r.gender === 'm' ? 'm' : 'f') : voices === 'ff' ? 'f' : voices === 'mm' ? 'm' : i % 2 ? 'm' : 'f';
    const nm = (r?.name || '').trim() || (g === 'f' ? F : M)[i]; // varsayılan adlar eski sürümle aynı (dizine göre)
    return { id: 'ABCDEF'[i], name: nm, gender: g, role, ...(r?.voice ? { serverVoice: r.voice } : {}) };
  });
}

// Sınav türleri: soru tarzı, şık sayısı ve soru başına süre
export const EXAMS = [
  { v: 'genel', t: 'Genel', opts: 4, minPerQ: 1.2, style: 'açık, net, bilgi ölçen sorular' },
  { v: 'lgs', t: 'LGS', opts: 4, minPerQ: 1.5, style: 'MEB LGS tarzı, okuduğunu anlama ve yorum içeren beceri temelli sorular' },
  { v: 'tyt', t: 'YKS · TYT', opts: 5, minPerQ: 1.2, style: 'ÖSYM TYT tarzı, temel yeterlilik, paragraf ve yorum ağırlıklı' },
  { v: 'ayt', t: 'YKS · AYT', opts: 5, minPerQ: 1.8, style: 'ÖSYM AYT tarzı, alan bilgisi derin, çok adımlı akıl yürütme' },
  { v: 'kpss', t: 'KPSS', opts: 5, minPerQ: 1.1, style: 'ÖSYM KPSS tarzı, bilgi ve öncüllü (I, II, III) sorular' },
  { v: 'ales', t: 'ALES / DGS', opts: 5, minPerQ: 1.3, style: 'ÖSYM ALES tarzı sayısal-sözel mantık' },
  { v: 'yds', t: 'YDS / YÖKDİL', opts: 5, minPerQ: 1.2, style: 'ÖSYM YDS tarzı, kelime, dilbilgisi, okuma' },
  { v: 'uni', t: 'Üniversite vize/final', opts: 5, minPerQ: 1.5, style: 'üniversite ders sınavı, kavram ve uygulama' },
  { v: 'master', t: 'Yüksek lisans / doktora yeterlik', opts: 4, minPerQ: 2.5, style: 'derin kavrayış, kuram karşılaştırma, araştırma yorumu' },
  { v: 'uab_goc', t: 'UAB · GMDSS GOC telsiz operatörü', opts: 4, minPerQ: 1.2, style: 'Ulaştırma ve Altyapı Bakanlığı GOC sınavı tarzı; GMDSS, frekanslar, prosedürler, SOLAS IV' },
  { v: 'uab_roc', t: 'UAB · GMDSS ROC', opts: 4, minPerQ: 1.2, style: 'UAB ROC sınavı tarzı; A1 sahası, VHF DSC prosedürleri' },
  { v: 'uab_vardiya', t: 'UAB · Vardiya zabiti (STCW)', opts: 4, minPerQ: 1.3, style: 'UAB gemiadamları sınavı tarzı; seyir, vardiya standartları, STCW' },
  { v: 'colreg', t: 'COLREG (Denizde çatışmayı önleme)', opts: 4, minPerQ: 1.2, style: 'COLREG kuralları, fenerler, işaretler, manevra senaryoları' },
  { v: 'ehliyet', t: 'Sürücü belgesi', opts: 4, minPerQ: 1.0, style: 'MEB sürücü sınavı tarzı' }
];


// Tam sayı seçeneği (eski 'few/std/more' kayıtlarıyla uyumlu)
export const toCount = (v, old, def) => { const n = parseInt(v, 10); if (n > 0) return n; return old?.[v] || def; };
const EVIDENCE_RULE = `- Her öğe için "evidence" alanına, cevabı kanıtlayan cümleyi KAYNAK PARÇASINDAN KELİMESİ KELİMESİNE kopyala (kaynağın kendi dilinde, en fazla 35 kelime) ve "ref" alanına o parçanın numarasını yaz.
- Kaynakta kanıtı olmayan hiçbir öğeyi yazma. Uydurma alıntı yazma; alıntılar program tarafından kaynakla karşılaştırılır.`;
const shuffleOpts = (q) => {
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) };
};
const cleanQ = (q) => (q && Array.isArray(q.options) && q.options.length >= 2 && q.q ? { ...q, options: q.options.map(String), answer: Math.max(0, Math.min(q.options.length - 1, +q.answer || 0)) } : null);

// Çoktan seçmeli soru tanımı (Test aracı ve soru bankası ortak kullanır)
export function questionSpec(o) {
  const ex = EXAMS.find((e) => e.v === o.preset) || EXAMS[0];
  const L = 'ABCDE'.slice(0, ex.opts).split('').join(', ');
  const lvl = { easy: 'kolay', mid: 'orta', hard: 'zor' }[o.level] || 'orta';
  return {
    ex,
    system: `Sınav hazırlayan titiz bir uzmansın. ${BASE_RULES(o.lang || 'Türkçe')}\n- Her sorunun yalnızca bir doğru cevabı olsun ve bu cevap kaynakla birebir doğrulanabilsin.\n- Çeldiriciler makul ama kesinlikle yanlış olsun; tipik öğrenci hatalarını yansıtsın.\n- Açıklamada şık harfi (A, B…) kullanma; şıklar karıştırılacak.\n${EVIDENCE_RULE}`,
    prompt: (ctx, need, avoid) => `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nTam ${need} adet ${ex.opts} şıklı (${L}) çoktan seçmeli soru hazırla. Sınav tarzı: ${ex.style}. Zorluk: ${lvl}. Soruları bu parçalardaki farklı konulara dağıt. Her soruya kısa bir konu etiketi ver.${avoid ? `\nŞu sorulardan FARKLI sorular yaz: ${avoid}` : ''}\nJSON: {"questions": [{"topic": "konu etiketi", "q": "...", "options": ["...", "..."], "answer": 0, "hint": "cevabı vermeyen ipucu", "explanation": "doğru cevabın gerekçesi ve neden diğerleri yanlış", "evidence": "kaynaktan birebir alıntı", "ref": 1}]}`,
    pick: (j) => (j.questions || j.items || (Array.isArray(j) ? j : [])).map(cleanQ),
    key: (q) => q.q,
    answerOf: (q) => q.options[q.answer]
  };
}
export { shuffleOpts };

// Tam sayıda, doğrulanmış, kaynağın tamamına yayılmış soru üret
export async function makeQuestions(nb, o, { count, signal, progress, onItems }) {
  const spec = questionSpec(o);
  const r = await generateExact({ ...spec, nb, focus: o.focus, total: count, perBatch: 8, signal, progress, onItems, label: 'Sorular', max: 300 });
  return { ...r, items: r.items.map(shuffleOpts), ex: spec.ex };
}

// ---------------- Studio araçlarının tanımı ----------------
export const TOOLS = {
  podcast: {
    label: 'Sesli Özet', icon: 'audio', title: "Sesli Özet'i özelleştirin",
    options: [
      { key: 'format', label: 'Biçim', type: 'cards', default: 'deep', choices: [
        { v: 'deep', t: 'Ayrıntılı inceleme', d: 'İki sunucu arasında geçen, kaynaklarınızdaki konuları açıklayıp birbirine bağlayan canlı bir sohbet' },
        { v: 'brief', t: 'Özet', d: 'Kaynaklarınızdaki temel fikirleri hızlıca anlamanıza yardımcı olacak kısa bir özet' },
        { v: 'critique', t: 'Eleştiri', d: 'Materyalinizi iyileştirmenize yardımcı olacak yapıcı geri bildirimler sunan uzman incelemesi' },
        { v: 'debate', t: 'Tartışma', d: 'İki sunucu arasında geçen, farklı bakış açılarını yansıtan düşünceli bir tartışma' },
        { v: 'lecture', t: 'Hoca anlatımı', d: 'Deneyimli bir öğretmen konuyu adım adım anlatır, öğrenci soru sorar; örnek ve tekrarlarla' },
        { v: 'consult', t: 'İstişare', d: 'Üç uzman aynı masada; her biri kendi açısından katkı verir, ortak sonuca varır' },
        { v: 'munazara', t: 'Münazara', d: 'Moderatör, lehte ve aleyhte taraflar; kurallı turlar, çürütmeler ve hakem değerlendirmesi' },
        { v: 'exam', t: 'Sözlü sınav provası', d: 'Sınav görevlisi soruyor, aday cevaplıyor, eğitmen hataları düzeltip ipucu veriyor' },
        { v: 'story', t: 'Hikâyeyle öğren', d: 'Bilgileri duygulu, gerilimli bir hikâyeye yerleştirir; akılda kalıcı sahneler ve hafıza ipuçları' }
      ] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'length', label: 'Uzunluk', type: 'seg', default: 'default', choices: [{ v: 'short', t: 'Kısa' }, { v: 'default', t: 'Varsayılan' }, { v: 'long', t: 'Uzun' }] },
      { key: 'count', label: 'Konuşmacı sayısı', type: 'seg', default: 'auto', choices: [{ v: 'auto', t: 'Otomatik' }, { v: '2', t: '2' }, { v: '3', t: '3' }, { v: '4', t: '4' }, { v: '5', t: '5' }, { v: '6', t: '6' }] },
      { key: 'voices', label: 'Sesler', type: 'seg', default: 'fm', choices: [{ v: 'fm', t: 'Kadın + erkek' }, { v: 'ff', t: 'Kadın' }, { v: 'mm', t: 'Erkek' }, { v: 'cast', t: 'Karakterlerim (Ses stüdyosu)' }] },
      { key: 'focus', label: 'Yapay zeka sunucuları bu bölümde neye odaklanmalı?', type: 'text', placeholder: 'Örn. Deniz sahaları ve zorunlu cihazlar' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const segCount = { short: 2, default: 4, long: 7 }[o.length] || 4;
      let roster = (await loadTTS()).cast;
      if (o.voices === 'cast' && Array.isArray(o.castPick) && o.castPick.length) roster = o.castPick.map((n) => roster.find((c) => c.name === n)).filter(Boolean); // üretim penceresinde işaretlenen karakterler
      const speakers = castFor(o.format, o.voices, o.voices === 'cast' && roster.length > 1 ? 'auto' : o.count, roster);
      const nSp = speakers.length;
      const cast = speakers.map((s) => `${s.id}: ${s.name} (${s.gender === 'm' ? 'erkek' : 'kadın'}, ${s.role})`).join('; ') + (nSp > 2 ? `. Kadroda ${nSp} konuşmacı var: hepsi birkaç kez söz alsın, birbirlerine doğrudan seslensinler ve aynı anda iki kişi konuşmasın` : '');
      const style = {
        deep: 'Sunucular konuyu merakla, örneklerle ve benzetmelerle derinlemesine işler. Kısa araya girmeler ("Evet, tam olarak", "Dur bir saniye…"), şaşırma ve gülme anları olur.',
        brief: 'Tek anlatıcı kısa ve net bir özet sunar.',
        critique: 'İki uzman materyalin güçlü ve zayıf yönlerini, eksiklerini ve nasıl iyileştirileceğini yapıcı biçimde değerlendirir.',
        debate: 'İki sunucu konunun tartışmalı yönlerini farklı bakış açılarıyla saygılı biçimde tartışır, sonunda ortak noktaları özetler.',
        lecture: 'Hoca konuyu kolaydan zora adım adım anlatır, her bölümün sonunda öğrenciye soru sorar; öğrenci bazen yanılır, hoca nazikçe düzeltir ve kalıcı bir hafıza ipucu (kısaltma, benzetme) verir.',
        consult: 'Moderatör sorunu ortaya koyar; iki uzman kendi uzmanlık açılarından görüş bildirir, birbirine soru sorar, sonunda eylem listesine varırlar.',
        munazara: 'Moderatör önergeyi okur. Sırasıyla açılış konuşmaları, çürütme turları ve kapanış yapılır. Taraflar kaynaklardan kanıt gösterir. Sonunda moderatör puanlayıp kazananı ve öğrenilmesi gerekenleri açıklar.',
        exam: 'Sınav görevlisi gerçek sınav tarzında sorular sorar, aday cevaplar (bazen eksik/yanlış), eğitmen doğrusunu açıklar ve sınavda dikkat edilecek tuzakları söyler.',
        story: 'Bilgiler gerçekçi, duygulu bir senaryoya yerleştirilir (ör. tehlikedeki bir gemi). Gerilim ve rahatlama anları, canlı imgeler ve her kritik bilgide akılda kalıcı bir cümle kullanılır.'
      }[o.format];
      progress('Bölüm planı çıkarılıyor…');
      const plan = await json(
        `Bir podcast yapımcısısın. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nBu kaynaklardan bir bölüm planla. Kadro: ${cast}. Tarz: ${style}\n${segCount} bölümlük akış çıkar; sınavda çıkabilecek kritik bilgileri mutlaka kapsa.\nJSON: {"title": "çekici bölüm başlığı", "segments": [{"topic": "bölüm konusu", "points": ["işlenecek nokta", "..."]}]}`,
        signal, 'fast');
      const lines = [];
      const segs = (plan.segments || []).slice(0, segCount);
      const ids = speakers.map((s) => s.id);
      for (let i = 0; i < segs.length; i++) {
        progress(`Senaryo yazılıyor (${i + 1}/${segs.length})…`);
        const prev = lines.slice(-4).map((l) => `${l.speaker}: ${l.text}`).join('\n');
        const part = await json(
          `Doğal, akıcı ve konuşma diline uygun podcast senaryoları yazan bir senaristsin. ${BASE_RULES(o.lang)}\n- Metin yüksek sesle okunacak: sayıları ve kısaltmaları ilk geçtiği yerde açık söyle, cümleleri kısa tut.`,
          `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nKadro: ${cast}\nTarz: ${style}\nBölüm başlığı: ${plan.title}\nŞu an ${i + 1}. / ${segs.length} kısım: ${segs[i].topic}\nİşlenecek noktalar: ${(segs[i].points || []).join('; ')}\n${i === 0 ? 'İlk kısım: dinleyiciyi karşıla, konuşmacılar kendini tanıtsın.' : 'Önceki son replikler:\n' + prev + '\nKaldığın yerden doğal devam et, tekrar selamlama yapma.'}\n${i === segs.length - 1 ? 'Son kısım: ana fikirleri 3 maddede toparla, dinleyiciye kendini test edeceği bir soru bırak ve vedalaş.' : ''}\nYaklaşık ${14 + (nSp - 2) * 4}-${20 + (nSp - 2) * 5} replik. Her replikte konuşan kişinin kimliğini (${ids.join(', ')}) ve kısa bir ton notu ver (ör. "meraklı", "heyecanlı", "sakin", "gülerek").\nJSON: {"lines": [{"speaker": "${ids[0]}", "tone": "meraklı", "text": "..."}]}`,
          signal);
        for (const l of part.lines || []) if (l.text) lines.push({ speaker: ids.includes(l.speaker) ? l.speaker : ids[0], tone: l.tone || '', text: String(l.text) });
      }
      if (!lines.length) throw new Error('Senaryo üretilemedi: model boş ya da geçersiz yanıt verdi. Yeniden deneyin.');
      return { title: plan.title || 'Sesli Özet', content: { format: o.format, lang: o.lang, speakers, lines } };
    }
  },

  slides: {
    label: 'Slayt Sunusu', icon: 'slides', title: 'Slayt sunusunu özelleştirin',
    options: [
      { key: 'format', label: 'Biçim', type: 'cards', default: 'detailed', choices: [
        { v: 'detailed', t: 'Ayrıntılı Sunu', d: 'Tam metin ve ayrıntıları içeren kapsamlı bir sunu. E-posta ile göndermek veya tek başına okumak için idealdir.' },
        { v: 'presenter', t: 'Sunucu Slaytları', d: 'Konuşurken size destek olacak, önemli konuşma noktalarını içeren net, görsel slaytlar.' }
      ] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'count', label: 'Slayt sayısı', type: 'count', default: 10, min: 1, max: 150, choices: [5, 10, 20, 50, 100] },
      { key: 'theme', label: 'Tema', type: 'seg', default: 'ocean', choices: [{ v: 'ocean', t: 'Okyanus' }, { v: 'paper', t: 'Kâğıt' }, { v: 'night', t: 'Gece' }, { v: 'sunset', t: 'Gün batımı' }] },
      { key: 'focus', label: 'Oluşturmak istediğiniz slayt sunusunu açıklayın', type: 'text', placeholder: 'Üst düzey bir taslak ekleyin veya kitle, stil ve odak noktası hakkında bilgi verin' }
    ],
    async generate(nb, o, { signal, progress }) {
      const N = Math.min(150, toCount(o.count, {}, o.length === 'short' ? 7 : 10));
      const fmt = o.format === 'presenter' ? 'Sunucu slaytları: her slaytta en fazla 3 kısa madde, ayrıntılar konuşmacı notlarında.' : 'Ayrıntılı: her slaytta açıklayıcı tam cümleler, 3-5 madde ve kısa bir paragraf.';
      const SCHEMA = `{"layout": "title|bullets|two-col|stat|quote|timeline|process|chart|table", "title": "...", "bullets": ["..."], "body": "kısa paragraf (isteğe bağlı)", "left": {"heading": "...", "bullets": ["..."]}, "right": {"heading": "...", "bullets": ["..."]}, "stat": {"value": "...", "label": "..."}, "quote": "...", "items": [{"label": "tarih/adım", "text": "..."}], "chart": {"labels": ["..."], "values": [1], "unit": ""}, "table": {"columns": ["..."], "rows": [["..."]]}, "icon": "tek emoji", "visual": "görsel için İngilizce, yazı içermeyen, tek cümlelik somut sahne/nesne tarifi (isteğe bağlı)", "notes": "konuşmacı notu (2-4 cümle)", "refs": [1]}`;
      const LAYOUT = 'Düzenleri içeriğe göre çeşitlendir: karşılaştırma için "two-col", çarpıcı tek sayı için "stat", tarihler için "timeline", adımlar için "process", kaynakta sayısal seri varsa "chart", yan yana özellikler için "table", önemli bir ifade için "quote". chart ve table içindeki her değer kaynakta açıkça geçmeli. Kapak, madde, iki sütun, alıntı ve sayı slaytlarına konuyu somut bir nesne ya da sahneyle anlatan İngilizce, yazı içermeyen tek cümlelik "visual" tarifi ekle (örn. "a ship bridge at dusk with radar screens glowing"); grafik, tablo, zaman çizelgesi ve adım slaytlarına visual yazma. Gerçek kişi, marka ya da logo tarif etme.';
      const system = `Usta bir sunum tasarımcısı ve eğitmensin. ${BASE_RULES(o.lang)}`;
      const refs = [], idx = new Map();
      const remap = (ctx, list) => (list || []).map((n) => { const r = ctx.refs.find((x) => x.n === +n); if (!r) return null; if (!idx.has(r.chunkId)) { idx.set(r.chunkId, refs.length + 1); refs.push({ n: refs.length + 1, sourceId: r.sourceId, title: r.title, page: r.page, text: r.text.slice(0, 600) }); } return idx.get(r.chunkId); }).filter(Boolean);
      const clean = (x) => x && (x.title || x.quote || x.stat);
      let title = '', subtitle = '', slides = [];
      if (N <= 12) {
        const ctx = await buildContext(nb, o.focus);
        progress(`${N} slayt hazırlanıyor…`);
        const r = await json(system, `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nTAM OLARAK ${N} slaytlık bir sunu hazırla (ne eksik ne fazla). Biçim: ${fmt}\n${N > 1 ? 'İlk slayt "title" düzeninde, son slayt özet olsun. ' : ''}${LAYOUT}\nJSON: {"title": "...", "subtitle": "...", "slides": [${SCHEMA}]}`, signal);
        title = r.title; subtitle = r.subtitle;
        slides = (r.slides || []).filter(clean).map((x) => ({ ...x, refs: remap(ctx, x.refs) }));
        if (slides.length < N) { // eksik kaldıysa tamamlat
          const r2 = await json(system, `${ctxBlock(ctx)}\nŞu slaytlar hazır: ${slides.map((x) => x.title).join(' | ')}.\nSunuyu tamamlamak için ${N - slides.length} slayt daha yaz (sonuncusu özet). ${LAYOUT}\nJSON: {"slides": [${SCHEMA}]}`, signal);
          const extra = (r2.slides || []).filter(clean).map((x) => ({ ...x, refs: remap(ctx, x.refs) }));
          const last = slides.length > 1 ? slides.pop() : null;
          slides.push(...extra.slice(0, N - slides.length - (last ? 1 : 0))); if (last) slides.push(last);
        }
      } else {
        // 1) Ana hat: kaynağın tamamına yayılmış N başlık
        const ctx0 = await buildContext(nb, o.focus);
        progress(`${N} slaytlık ana hat çıkarılıyor…`);
        const ol = await json(system, `${ctxBlock(ctx0)}\n${focusLine(o.focus)}\nTAM OLARAK ${N} slaytlık bir sununun ana hattını çıkar. Kaynağın tüm bölümlerini sırayla kapsa; her slayt farklı bir alt konu olsun. İlk slayt kapak, son slayt özet.\nJSON: {"title": "...", "subtitle": "...", "outline": [{"title": "slayt başlığı", "goal": "bu slaytta anlatılacak tek cümle"}]}`, signal);
        title = ol.title; subtitle = ol.subtitle;
        let outline = (ol.outline || []).filter((x) => x?.title);
        while (outline.length < N) {
          const more = await json(system, `${ctxBlock(ctx0)}\nMevcut ana hat: ${outline.map((x) => x.title).join(' | ')}\nKaynağın henüz işlenmemiş konularından ${Math.min(40, N - outline.length)} slayt başlığı daha ekle (özet slaytı hariç).\nJSON: {"outline": [{"title": "...", "goal": "..."}]}`, signal);
          const add = (more.outline || []).filter((x) => x?.title && !outline.some((y) => y.title === x.title));
          if (!add.length) break;
          const last = outline.pop(); outline.push(...add.slice(0, N - outline.length - 1), last);
        }
        outline = outline.slice(0, N);
        // 2) İçerik: 6'şar slaytlık partiler, her parti kendi konusuna en uygun kaynak parçalarıyla
        for (let i = 0; i < outline.length; i += 6) {
          const part = outline.slice(i, i + 6);
          progress(`Slaytlar yazılıyor ${i + 1}–${i + part.length} / ${outline.length}`);
          const ctx = await buildContext(nb, `${o.focus || ''} ${part.map((x) => x.title + ' ' + (x.goal || '')).join(' ; ')}`, { budgetChars: 20000 });
          const r = await json(system, `${ctxBlock(ctx)}\nSunu: ${title}. Biçim: ${fmt}\nAşağıdaki ${part.length} slaytı (sunudaki sıra ${i + 1}–${i + part.length}) aynı sırayla yaz; başlıkları koru.${i === 0 ? ' İlki "title" düzeninde kapak.' : ''}${i + part.length >= outline.length ? ' Sonuncusu özet.' : ''} ${LAYOUT}\n${part.map((x, k) => `${i + k + 1}. ${x.title} — ${x.goal || ''}`).join('\n')}\nJSON: {"slides": [${SCHEMA}]}`, signal);
          const got = (r.slides || []).filter(clean);
          part.forEach((x, k) => { const sl = got[k] || { layout: 'bullets', title: x.title, bullets: [x.goal].filter(Boolean) }; slides.push({ ...sl, title: sl.title || x.title, refs: remap(ctx, sl.refs) }); });
        }
      }
      slides = slides.slice(0, N);
      return { title: title || 'Slayt Sunusu', content: { title: title || 'Slayt Sunusu', subtitle: subtitle || '', slides, theme: o.theme, format: o.format, lang: o.lang, refs, note: slides.length < N ? `İstenen ${N}, üretilen ${slides.length} slayt.` : '' } };
    }
  },

  video: {
    label: 'Videolu Özet', icon: 'video', title: "Videolu Özet'i özelleştirin",
    options: [
      { key: 'format', label: 'Biçim', type: 'cards', default: 'short', choices: [
        { v: 'short', t: 'Kısa (dikey)', d: 'Kaynaklarınızdaki temel fikirleri hızlıca anlamanıza yardımcı olacak kısa, dikey bir video' },
        { v: 'explainer', t: 'Açıklayıcı (yatay)', d: 'Kaynaklarınız arasında bağlantı kuran yapılandırılmış ve kapsamlı bir anlatım' }
      ] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'theme', label: 'Görsel stil', type: 'seg', default: 'sketch', choices: [{ v: 'sketch', t: 'Çizim notu' }, { v: 'ocean', t: 'Okyanus' }, { v: 'night', t: 'Gece' }, { v: 'paper', t: 'Kâğıt' }] },
      { key: 'focus', label: 'Video neye odaklanmalı?', type: 'text', placeholder: 'Kendi konunuzu açıklayın' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const n = o.format === 'short' ? '5-7' : '9-12';
      progress('Video senaryosu yazılıyor…');
      const r = await json(
        `Eğitici video senaristi ve storyboard sanatçısısın. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\n${n} sahnelik bir ${o.format === 'short' ? 'kısa, dikey (60-90 sn), merak uyandıran bir hikâyeyle açılan' : 'açıklayıcı, yatay (4-7 dk)'} video senaryosu yaz. Her sahnede ekranda kısa yazılar ve seslendirme metni olsun. Seslendirme doğal konuşma dilinde olsun, kısaltmaları açıkla. Her sahneye konuyu somut bir nesne ya da mekânla anlatan İngilizce, yazı içermeyen tek cümlelik \"visual\" tarifi ekle; gerçek kişi, marka ya da logo tarif etme.\nJSON: {"title": "...", "scenes": [{"title": "ekran başlığı", "icon": "sahneyi anlatan 1-3 emoji", "visual": "görsel için İngilizce, yazı içermeyen, tek cümlelik somut sahne/nesne tarifi", "bullets": ["ekranda en fazla 3 kısa ifade"], "stat": {"value": "", "label": ""}, "narration": "seslendirme metni (2-5 cümle)"}]}`,
        signal);
      return { title: r.title || 'Videolu Özet', content: { ...r, format: o.format, theme: o.theme, lang: o.lang } };
    }
  },

  mindmap: {
    label: 'Zihin Haritası', icon: 'mindmap', title: 'Zihin Haritası',
    options: [
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Konu ne olsun?', type: 'text', placeholder: 'Örn. Zihin haritası yalnızca deniz sahalarına odaklanmalı' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      progress('Kavramlar düzenleniyor…');
      const r = await json(
        `Bilgiyi hiyerarşik kavram haritalarına dönüştüren bir uzmansın. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nKaynakların kapsamlı bir zihin haritasını çıkar: 1 kök, 4-7 ana dal, her dalda 2-6 alt dal, gerektiğinde 3. ve 4. seviye. Etiketler kısa (en fazla 7 kelime) olsun. Her düğüme isteğe bağlı 1 cümlelik "note" ekle.\nJSON: {"title": "...", "root": {"label": "...", "note": "...", "children": [{"label": "...", "note": "...", "children": []}]}}`,
        signal);
      return { title: r.title || r.root?.label || 'Zihin Haritası', content: r };
    }
  },

  report: {
    label: 'Raporlar', icon: 'report', title: 'Rapor oluşturun',
    options: [
      { key: 'template', label: 'Şablon', type: 'cards', default: 'learn', choices: [
        { v: 'learn', t: 'Öğrenmeye Genel Bakış', d: 'Temel kavramları özetleyen, öğrenmeye yardımcı genel bakış' },
        { v: 'brief', t: 'Brifing Belgesi', d: 'Ana temalar, önemli bulgular ve alıntılarla yönetici özeti' },
        { v: 'guide', t: 'Çalışma Kılavuzu', d: 'Kısa sınav soruları, cevap anahtarı ve terimler sözlüğü' },
        { v: 'blog', t: 'Blog Yazısı', d: 'Kaynaklardan akıcı, okunur bir makale' },
        { v: 'custom', t: 'Özel', d: 'İsteğinizi aşağıya yazın' }
      ] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Ek istekler', type: 'text', placeholder: 'Örn. Sınava hazırlık için tarihleri tabloyla ver' }
    ],
    async generate(nb, o, { signal, progress, onToken }) {
      const ctx = await buildContext(nb, o.focus);
      const tpl = {
        learn: 'Öğrenmeye Genel Bakış: Giriş, ana kavramlar (alt başlıklarla), önemli tarihler/sayılar tablosu, sık yapılan hatalar, özet.',
        brief: 'Brifing Belgesi: Yönetici özeti, ana temalar, önemli bulgular, kaynaktan kısa alıntılar, sonuç.',
        guide: 'Çalışma Kılavuzu: 10 kısa cevaplı soru, cevap anahtarı, 5 deneme sorusu (cevapsız), terimler sözlüğü (tablo).',
        blog: 'Blog yazısı: çekici başlık, giriş paragrafı, ara başlıklar, sonuç.',
        custom: 'Kullanıcının isteğine göre yapılandır.'
      }[o.template];
      progress('Rapor yazılıyor…');
      const md = await chat({
        signal, onToken,
        system: `Kaynaklara sadık, iyi yapılandırılmış belgeler yazan bir editörsün.\n- Yalnızca KAYNAKLAR'a dayan.\n- Önemli iddiaların sonuna kaynak numarasını [3] biçiminde ekle.\n- Markdown kullan (başlıklar, tablolar, listeler).\n- Dil: ${o.lang}.`,
        messages: [{ role: 'user', content: `${ctxBlock(ctx)}\n${focusLine(o.focus)}\n${tpl}\nİlk satır "# Başlık" olsun.` }]
      });
      const title = (md.match(/^#\s+(.+)$/m) || [])[1] || 'Rapor';
      return { title, content: { markdown: md, template: o.template, refs: refsOf(ctx) } };
    }
  },

  flashcards: {
    label: 'Bilgi kartları', icon: 'cards', title: 'Bilgi kartları',
    options: [
      { key: 'kind', label: 'Kart türü', type: 'seg', default: 'qa', choices: [{ v: 'qa', t: 'Soru–cevap' }, { v: 'cloze', t: 'Boşluk doldurma' }, { v: 'term', t: 'Terim–tanım' }] },
      { key: 'count', label: 'Kart sayısı', type: 'count', default: 20, min: 1, max: 300, choices: [10, 20, 40, 100] },
      { key: 'level', label: 'Zorluk Seviyesi', type: 'seg', default: 'mid', choices: [{ v: 'easy', t: 'Kolay' }, { v: 'mid', t: 'Orta' }, { v: 'hard', t: 'Zor' }] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Konu ne olsun?', type: 'text', placeholder: 'Ön yüzde sinyal adı, arkada tanımı bulunan kartlar oluşturun.' }
    ],
    async generate(nb, o, { signal, progress }) {
      const n = toCount(o.count, { few: 12, std: 25, more: 40 }, 20);
      const lvl = { easy: 'kolay, temel tanımlar', mid: 'orta', hard: 'zor, ayrıntı ve karşılaştırma' }[o.level] || 'orta';
      const r = await generateExact({
        nb, focus: o.focus, total: n, perBatch: 12, signal, progress, label: 'Kartlar', max: 300,
        system: `Etkili hafıza kartları hazırlayan bir öğretmensin. ${BASE_RULES(o.lang)}\n${EVIDENCE_RULE}`,
        prompt: (ctx, need, avoid) => `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nTam ${need} adet bilgi kartı hazırla. Zorluk: ${lvl}. ${{ cloze: 'Boşluk doldurma kartları: ön yüz kaynaktaki önemli bir cümle, kilit kelime/sayı yerine "_____" konmuş; arka yüz yalnız boşluğa gelen ifade.', term: 'Ön yüz bir terim/kısaltma/ad, arka yüz kaynaktaki tanımı (en fazla 2 cümle).' }[o.kind] || 'Ön yüz kısa bir soru, arka yüz kısa net cevap (en fazla 2 cümle).'} Her karta 1 cümlelik "explain" ekle.${avoid ? `\nŞu kartlardan FARKLI olsun: ${avoid}` : ''}\nJSON: {"cards": [{"front": "...", "back": "...", "explain": "...", "evidence": "kaynaktan birebir alıntı", "ref": 1}]}`,
        pick: (j) => (j.cards || j.items || []).filter((c) => c && c.front && c.back),
        key: (c) => c.front, answerOf: (c) => c.back
      });
      return { title: (o.focus ? o.focus.slice(0, 50) + ' · ' : '') + `${r.items.length} Bilgi Kartı`, content: { cards: r.items, refs: r.refs, verify: summarize(r.items), note: shortNote(n, r.items.length, r.dropped) } };
    }
  },

  quiz: {
    label: 'Test', icon: 'quiz', title: 'Test',
    options: [
      { key: 'mode', label: 'Mod', type: 'cards', default: 'practice', choices: [
        { v: 'practice', t: 'Alıştırma', d: 'Her sorudan sonra doğru cevap ve açıklama; ipucu açık' },
        { v: 'exam', t: 'Deneme sınavı', d: 'Süreli, gerçek sınav gibi; sonuçlar sonda, konu bazlı karne ve hedef puan' }
      ] },
      { key: 'preset', label: 'Sınav türü', type: 'select', default: 'genel', choices: EXAMS.map((e) => ({ v: e.v, t: e.t })) },
      { key: 'count', label: 'Soru sayısı', type: 'count', default: 10, min: 1, max: 200, choices: [5, 10, 20, 50, 100] },
      { key: 'level', label: 'Zorluk Seviyesi', type: 'seg', default: 'mid', choices: [{ v: 'easy', t: 'Kolay' }, { v: 'mid', t: 'Orta' }, { v: 'hard', t: 'Zor' }] },
      { key: 'target', label: 'Hedef puan (100 üzerinden)', type: 'seg', default: '70', choices: [{ v: '60', t: '60' }, { v: '70', t: '70' }, { v: '85', t: '85' }, { v: '100', t: '100' }] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Konu ne olsun?', type: 'text', placeholder: 'A1 ve A2 sahalarını ayırt eden sorular ekle.' }
    ],
    async generate(nb, o, { signal, progress }) {
      const n = toCount(o.count, { few: 6, std: 12, more: 20 }, 10);
      const { items, refs, dropped, ex } = await makeQuestions(nb, o, { count: n, signal, progress });
      if (!items.length) throw new Error('Kaynaktan doğrulanabilir soru üretilemedi. Kaynağın metin içerdiğinden (taranmış PDF ise OCR’ın bittiğinden) emin olun.');
      return { title: (o.focus ? o.focus.slice(0, 50) + ' · ' : '') + `${items.length} Soruluk Test`, content: { questions: items, refs, mode: o.mode, preset: o.preset, target: +o.target || 70, verify: summarize(items), note: shortNote(n, items.length, dropped), minutes: o.mode === 'exam' ? Math.max(5, Math.round(items.length * ex.minPerQ)) : 0 } };
    }
  },

  memory: {
    label: 'Hafıza Teknikleri', icon: 'brain', title: 'Akılda kalıcı öğrenme',
    options: [
      { key: 'place', label: 'Hafıza sarayı mekânı', type: 'seg', default: 'ev', choices: [{ v: 'ev', t: 'Evim' }, { v: 'gemi', t: 'Gemi' }, { v: 'okul', t: 'Okul' }, { v: 'sehir', t: 'Şehir yolu' }] },
      { key: 'count', label: 'Bilgi sayısı', type: 'seg', default: 'std', choices: [{ v: 'few', t: '8' }, { v: 'std', t: '15' }, { v: 'more', t: '25' }] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Hangi bilgileri ezberlemek istiyorsunuz?', type: 'text', placeholder: 'Örn. tarihler, frekanslar ve deniz sahaları' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const n = { few: 8, std: 15, more: 25 }[o.count];
      const place = { ev: 'kendi evi (kapı, antre, salon, mutfak, banyo, yatak odası, balkon...)', gemi: 'bir gemi (iskele, güverte, köprüüstü, telsiz odası, makine dairesi, kamara, can filikası...)', okul: 'okul (giriş, koridor, sınıf, laboratuvar, kantin, spor salonu...)', sehir: 'her gün yürüdüğü bir şehir yolu (durak, fırın, park, cami, eczane, köprü...)' }[o.place];
      progress('Hafıza ipuçları oluşturuluyor…');
      const r = await json(
        `Bellek şampiyonlarının tekniklerini öğreten bir hafıza koçusun (loci yöntemi, akrostiş, kodlama, canlı imgeleme, duygusal bağ). ${BASE_RULES(o.lang)}\n- İmgeler abartılı, renkli, hareketli, komik ya da duygulu olsun; beyin sıradan olanı unutur, olağanüstü olanı hatırlar.\n- Sayıları görüntüye çevirmek için ses benzerliği veya şekil benzerliği kullan.`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nSınav için en kritik ${n} bilgiyi seç. Her biri için: kısa soru (cue), kesin cevap, bir kodlama/kısaltma/akrostiş (mnemonic), canlı bir zihinsel sahne (image), 1-3 emoji. Ardından bu bilgileri sırayla ${place} içinde bir hafıza sarayı yürüyüşüne yerleştir. Son olarak hepsini bağlayan kısa, duygulu ve akılda kalıcı bir hikâye yaz.\nJSON: {"title": "...", "items": [{"cue": "soru", "fact": "cevap", "mnemonic": "...", "image": "...", "emoji": "🛰️"}], "palace": {"place": "mekân adı", "stops": [{"loc": "durak (ör. ön kapı)", "item": 0, "scene": "o durakta gördüğün sahne"}]}, "story": "hikâye", "tips": ["öğrenme ipucu"]}`,
        signal);
      return { title: r.title || 'Hafıza Teknikleri', content: { ...r, place: o.place, progress: {} } };
    }
  },

  teach: {
    label: 'Öğreterek Öğren', icon: 'teach', title: 'Feynman yöntemi: bana öğret',
    options: [
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'level', label: 'Öğrencinin seviyesi', type: 'seg', default: 'lise', choices: [{ v: 'cocuk', t: '12 yaşında' }, { v: 'lise', t: 'Lise' }, { v: 'uzman', t: 'Sınav jürisi' }] },
      { key: 'focus', label: 'Hangi konuları anlatacaksınız?', type: 'text', placeholder: 'Boş bırakırsanız kaynaklardan ana konular seçilir' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      progress('Anlatılacak konular seçiliyor…');
      const r = await json(
        `Feynman tekniğini uygulayan bir öğretmensin. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nÖğrencinin kendi cümleleriyle anlatması gereken 6-10 ana konu seç. Her konu için anlatımda bulunması gereken 3-6 anahtar nokta ve konuya giriş sorusu yaz.\nJSON: {"title": "...", "topics": [{"name": "...", "question": "Bana ... nedir, nasıl çalışır anlatır mısın?", "keyPoints": ["..."]}]}`,
        signal);
      return { title: r.title || 'Öğreterek Öğren', content: { ...r, level: o.level, lang: o.lang, attempts: {} } };
    }
  },

  listen: {
    label: 'Dinleyerek Öğren', icon: 'audio', title: 'Dinleyerek öğren: dikte, gölgeleme, dinleme banyosu', noLLM: true,
    options: [
      { key: 'mode', label: 'Alıştırma', type: 'cards', default: 'dictation', choices: [
        { v: 'dictation', t: 'Dikte', d: 'Cümleyi dinle, duyduğunu yaz; kelime kelime karşılaştırılır. Dinlediğini anlama ve yazım için.' },
        { v: 'shadow', t: 'Gölgeleme', d: 'Dinle ve hemen ardından aynı tonla sesli tekrar et; kendini kaydedip karşılaştır. Telaffuz ve akıcılık için.' },
        { v: 'immersion', t: 'Dinleme banyosu', d: 'Bebeklerin dil edinimi gibi: metne bakmadan kesintisiz dinle, anlamadığın yerde dur; sonra metni aç.' }
      ] },
      { key: 'count', label: 'Cümle sayısı', type: 'count', default: 20, min: 3, max: 300, choices: [10, 20, 50, 100] },
      { key: 'length', label: 'Cümle uzunluğu', type: 'seg', default: 'mid', choices: [{ v: 'short', t: 'Kısa' }, { v: 'mid', t: 'Orta' }, { v: 'long', t: 'Uzun' }] },
      { key: 'lang', label: 'Kaynağın dili', type: 'lang' },
      { key: 'focus', label: 'Hangi konudan?', type: 'text', placeholder: 'Boş bırakırsanız kaynağın tamamından eşit aralıklarla seçilir' }
    ],
    // Yapay zeka kullanmaz (0 token): cümleler kaynaktan birebir seçilir
    async generate(nb, o, { progress }) {
      progress('Cümleler kaynaktan seçiliyor…');
      const n = toCount(o.count, {}, 20);
      const [lo, hi] = { short: [4, 10], mid: [8, 18], long: [14, 32] }[o.length] || [8, 18];
      const seen = new Set(), all = [];
      for (const sl of await sliceContexts(nb, o.focus || '')) for (const r of sl.refs) {
        const text = r.text.replace(/\[\[s\.\d+\]\]/g, ' ').replace(/\s+/g, ' ');
        for (const m of text.match(/[^.!?…]+[.!?…]+/g) || []) {
          const t = m.trim(), w = t.split(' ').length, k = t.toLocaleLowerCase('tr');
          if (w < lo || w > hi || seen.has(k) || /https?:|www\.|\d{4,}\s*\d{4,}/.test(t) || !/^[\p{Lu}"“(]/u.test(t)) continue;
          seen.add(k); all.push({ text: t, title: r.title, page: r.page });
        }
      }
      if (!all.length) throw new Error('Kaynakta uygun uzunlukta cümle bulunamadı. Cümle uzunluğunu değiştirin ya da taranmış PDF ise OCR’ın bitmesini bekleyin.');
      const step = all.length / Math.min(n, all.length);
      const picked = Array.from({ length: Math.min(n, all.length) }, (_, k) => all[Math.floor(k * step)]);
      return { title: `Dinleyerek Öğren · ${picked.length} cümle`, content: { mode: o.mode, lang: o.lang || 'Türkçe', sentences: picked } };
    }
  },

  speedread: {
    label: 'Hızlı Okuma', icon: 'speed', title: 'Hızlı okuma ve anlama testi',
    options: [
      { key: 'length', label: 'Metin uzunluğu', type: 'seg', default: 'std', choices: [{ v: 'short', t: '~250 kelime' }, { v: 'std', t: '~500 kelime' }, { v: 'long', t: '~900 kelime' }] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Hangi konu okunsun?', type: 'text', placeholder: 'Boş bırakırsanız kaynakların genel özeti' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const w = { short: 250, std: 500, long: 900 }[o.length];
      progress('Okuma metni ve anlama soruları hazırlanıyor…');
      const r = await json(
        `Okuma-anlama sınavı hazırlayan bir eğitimcisin. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nKaynaklardan yaklaşık ${w} kelimelik, paragraflara ayrılmış, akıcı bir okuma metni yaz. Ardından yalnızca bu metinle cevaplanabilen 6 adet 4 şıklı anlama sorusu hazırla (ana fikir, ayrıntı, çıkarım).\nJSON: {"title": "...", "text": "paragraf1\\n\\nparagraf2...", "questions": [{"q": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..."}]}`,
        signal);
      return { title: r.title || 'Hızlı Okuma', content: { text: r.text || '', questions: r.questions || [], history: [] } };
    }
  },

  infographic: {
    label: 'İnfografik', icon: 'infographic', title: 'İnfografiği özelleştirin',
    options: [
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'orientation', label: 'Yön seçin', type: 'seg', default: 'landscape', choices: [{ v: 'landscape', t: 'Yatay' }, { v: 'portrait', t: 'Dikey' }, { v: 'square', t: 'Kare' }] },
      { key: 'theme', label: 'Görsel stil seçin', type: 'seg', default: 'ocean', choices: [{ v: 'ocean', t: 'Okyanus' }, { v: 'sketch', t: 'Çizim Notu' }, { v: 'kawaii', t: 'Kawaii' }, { v: 'night', t: 'Gece' }, { v: 'paper', t: 'Kâğıt' }] },
      { key: 'detail', label: 'Ayrıntı düzeyi', type: 'seg', default: 'std', choices: [{ v: 'short', t: 'Kısa' }, { v: 'std', t: 'Standart' }, { v: 'detailed', t: 'Ayrıntılı' }] },
      { key: 'focus', label: 'Oluşturmak istediğiniz infografiği açıklayın', type: 'text', placeholder: 'Stili, rengi veya odak noktasını belirleyin' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const n = { short: 3, std: 5, detailed: 8 }[o.detail];
      progress('İnfografik tasarlanıyor…');
      const r = await json(
        `Bilgi tasarımcısısın; karmaşık bilgiyi tek bakışta anlaşılır görsellere dönüştürürsün. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nBir infografik içeriği hazırla: ${n} bilgi kutusu, 3-4 çarpıcı sayı, isteğe bağlı bir karşılaştırma tablosu ve bir zaman çizelgesi (kaynakta tarih varsa). Metinler kısa olsun.\nJSON: {"title": "...", "subtitle": "...", "heroVisual": "başlık görseli için İngilizce, yazı içermeyen tek cümlelik sahne tarifi", "highlights": [{"icon": "emoji", "visual": "ilk 4 kutu için İngilizce, yazı içermeyen kısa nesne tarifi (isteğe bağlı)", "heading": "...", "text": "en fazla 25 kelime"}], "stats": [{"value": "...", "label": "..."}], "timeline": [{"date": "...", "text": "..."}], "compare": {"columns": ["", "...", "..."], "rows": [["satır başlığı", "...", "..."]]}, "takeaway": "tek cümlelik ana mesaj"}`,
        signal);
      return { title: r.title || 'İnfografik', content: { ...r, orientation: o.orientation, theme: o.theme } };
    }
  },

  table: {
    label: 'Veri Tablosu', icon: 'table', title: 'Veri tablosunu özelleştirin',
    options: [
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Oluşturmak istediğiniz veri tablosunu açıklayın', type: 'text', placeholder: 'Örn. Deniz sahalarını menzil, istasyon, zorunlu cihaz ve ehliyete göre listele' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      progress('Tablo çıkarılıyor…');
      const r = await json(
        `Metinden yapılandırılmış veri çıkaran bir analistsin. ${BASE_RULES(o.lang)}\n- Kaynakta olmayan hücreleri boş bırak ("").`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus || 'Kaynaklardaki en önemli varlıkları ve özelliklerini karşılaştıran bir tablo oluştur.')}\nBir veri tablosu oluştur (3-8 sütun). Her satıra dayandığı kaynak numarasını "ref" olarak ekle.\nJSON: {"title": "...", "columns": ["..."], "rows": [{"cells": ["..."], "ref": 1}], "notes": "kısa açıklama"}`,
        signal);
      const rows = (r.rows || []).map((x) => (Array.isArray(x) ? { cells: x } : x));
      return { title: r.title || 'Veri Tablosu', content: { columns: r.columns || [], rows, notes: r.notes || '', refs: refsOf(ctx) } };
    }
  }
};

// Feynman değerlendirmesi: öğrencinin anlatımını puanla
export async function evaluateExplanation(nb, topic, explanation, level, signal) {
  const ctx = await buildContext(nb, topic.name, { budgetChars: 30000 });
  const who = { cocuk: '12 yaşında meraklı bir çocuk', lise: 'meraklı bir lise öğrencisi', uzman: 'titiz bir sınav jürisi' }[level] || 'meraklı bir öğrenci';
  return chatJSON({
    signal,
    system: `Sen ${who} rolündesin ve öğretmenin (kullanıcının) anlatımını dinliyorsun. Kaynaklara göre doğruluğu ve eksikleri tespit et; nazik ama dürüst ol. Yalnızca JSON döndür.`,
    messages: [{ role: 'user', content: `${ctxBlock(ctx)}\n\nKONU: ${topic.name}\nANAHTAR NOKTALAR: ${(topic.keyPoints || []).join('; ')}\n\nÖĞRETMENİN ANLATIMI:\n${explanation}\n\nPuanla (0-100): doğruluk, eksiksizlik, sadelik.\nJSON: {"score": 0, "covered": ["anlatılan doğru noktalar"], "missing": ["eksik noktalar"], "mistakes": ["yanlış ya da hatalı ifadeler ve doğrusu"], "question": "öğrencinin sorduğu takip sorusu", "praise": "kısa övgü cümlesi"}` }]
  });
}

// Sohbet: kaynaklara dayalı, numaralı alıntılı yanıt
// Kaynağa bağlılık ölçümü (token harcamaz): bilgi cümlelerinin kaçı geçerli bir [n] alıntısı taşıyor
export function grounding(text, nRefs) {
  const body = text.replace(/```[\s\S]*?```/g, '').split('\n').filter((l) => l.trim() && !/^\s*#/.test(l));
  const sents = body.join(' ').split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter((x) => x.length > 25);
  const facts = sents.slice(0, Math.max(1, sents.length - 1)); // son cümle "sonraki adım" önerisi
  let cited = 0, invalid = 0;
  for (const x of facts) {
    const ns = [...x.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]);
    if (ns.some((n) => n >= 1 && n <= nRefs)) cited++;
    invalid += ns.filter((n) => n < 1 || n > nRefs).length;
  }
  return { total: facts.length, cited, invalid, pct: facts.length ? Math.round((cited / facts.length) * 100) : 100 };
}

export async function answer(nb, history, question, { signal, onToken }) {
  const ctx = await buildContext(nb, question, {});
  const msgs = history.slice(-8).map((m) => ({ role: m.role, content: m.content }));
  msgs.push({ role: 'user', content: `${ctxBlock(ctx)}\n\nSORU: ${question}` });
  let text = await chat({
    signal, onToken, messages: msgs, temperature: 0.2, think: false,
    system: `Kullanıcının yüklediği kaynaklar üzerine çalışan, uydurmayan bir öğrenme asistanısın.
- Yalnızca KAYNAKLAR'daki bilgiye dayan. Genel bilgini, tahminini veya kaynakta olmayan ayrıntıyı ekleme.
- Cevap kaynaklarda yoksa bunu ilk cümlede açıkça söyle ("Kaynaklarınızda bu bilgi yok.") ve varsa en yakın ilgili bilgiyi alıntısıyla göster.
- Her bilgi cümlesinin sonuna dayandığı parça numarasını [2] veya [2][5] biçiminde ekle; numarasız bilgi cümlesi yazma.
- Sayı, tarih, frekans ve adları kaynaktaki gibi aynen aktar.
- Markdown kullan; uygun yerde başlık ve madde işaretleri kullan.
- Kullanıcının dilinde yanıt ver. Yanıtın sonunda konuyu derinleştirecek bir sonraki adımı tek cümleyle öner.`
  });
  // var olmayan parça numaralarını temizle (uydurma kaynak gösterimi)
  text = text.replace(/\[(\d+)\]/g, (m, n) => (+n >= 1 && +n <= ctx.refs.length ? m : ''));
  return { text, refs: refsOf(ctx), grounding: grounding(text, ctx.refs.length) };
}

export async function suggestQuestions(nb, signal) {
  const ctx = await buildContext(nb, '', { budgetChars: 20000 });
  const r = await chatJSON({ signal, role: 'fast', system: 'Yalnızca JSON döndür.', messages: [{ role: 'user', content: `${ctxBlock(ctx)}\n\nBu kaynaklar hakkında kullanıcının sorabileceği 3 kısa, merak uyandıran soru ve kaynakların 2 cümlelik özetini yaz (kaynakların dilinde).\nJSON: {"summary": "...", "questions": ["...", "...", "..."]}` }] });
  return r;
}
