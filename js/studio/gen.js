// Defter Studio — Studio üreticileri (istemler + JSON şemaları)
// Her üretici kaynak bağlamını alır, modelden yapılandırılmış JSON ister ve artifact içeriğini döndürür.
import { chat, chatJSON } from '../llm.js';
import { buildContext } from '../sources.js';

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

// Biçime göre konuşmacı kadrosu (cinsiyet sesleri ayrı tutulur)
export function castFor(format, voices = 'fm') {
  const F = ['Deniz', 'Elif', 'Zeynep'], M = ['Kaan', 'Emre', 'Murat'];
  const g = voices === 'ff' ? ['f', 'f', 'f'] : voices === 'mm' ? ['m', 'm', 'm'] : ['f', 'm', 'f'];
  const name = (i) => (g[i] === 'f' ? F[i] : M[i]);
  const mk = (roles) => roles.map((r, i) => ({ id: 'ABCD'[i], name: name(i), gender: g[i], role: r }));
  switch (format) {
    case 'brief': return mk(['anlatıcı']);
    case 'lecture': return mk(['hoca', 'öğrenci']);
    case 'consult': return mk(['moderatör', 'uzman 1', 'uzman 2']);
    case 'munazara': return mk(['moderatör ve hakem', 'lehte konuşmacı', 'aleyhte konuşmacı']);
    case 'exam': return mk(['sınav görevlisi', 'aday', 'eğitmen']);
    case 'story': return mk(['anlatıcı', 'karakter']);
    case 'critique': return mk(['baş eleştirmen', 'ikinci uzman']);
    default: return mk(['sunucu', 'sunucu']);
  }
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
      { key: 'voices', label: 'Sesler', type: 'seg', default: 'fm', choices: [{ v: 'fm', t: 'Kadın + erkek' }, { v: 'ff', t: 'İki kadın' }, { v: 'mm', t: 'İki erkek' }] },
      { key: 'focus', label: 'Yapay zeka sunucuları bu bölümde neye odaklanmalı?', type: 'text', placeholder: 'Örn. Deniz sahaları ve zorunlu cihazlar' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const segCount = { short: 2, default: 4, long: 7 }[o.length] || 4;
      const speakers = castFor(o.format, o.voices);
      const cast = speakers.map((s) => `${s.id}: ${s.name} (${s.gender === 'm' ? 'erkek' : 'kadın'}, ${s.role})`).join('; ');
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
          `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nKadro: ${cast}\nTarz: ${style}\nBölüm başlığı: ${plan.title}\nŞu an ${i + 1}. / ${segs.length} kısım: ${segs[i].topic}\nİşlenecek noktalar: ${(segs[i].points || []).join('; ')}\n${i === 0 ? 'İlk kısım: dinleyiciyi karşıla, konuşmacılar kendini tanıtsın.' : 'Önceki son replikler:\n' + prev + '\nKaldığın yerden doğal devam et, tekrar selamlama yapma.'}\n${i === segs.length - 1 ? 'Son kısım: ana fikirleri 3 maddede toparla, dinleyiciye kendini test edeceği bir soru bırak ve vedalaş.' : ''}\nYaklaşık 14-20 replik. Her replikte konuşan kişinin kimliğini (${ids.join(', ')}) ve kısa bir ton notu ver (ör. "meraklı", "heyecanlı", "sakin", "gülerek").\nJSON: {"lines": [{"speaker": "${ids[0]}", "tone": "meraklı", "text": "..."}]}`,
          signal);
        for (const l of part.lines || []) if (l.text) lines.push({ speaker: ids.includes(l.speaker) ? l.speaker : ids[0], tone: l.tone || '', text: String(l.text) });
      }
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
      { key: 'length', label: 'Uzunluk', type: 'seg', default: 'default', choices: [{ v: 'short', t: 'Kısa' }, { v: 'default', t: 'Varsayılan' }] },
      { key: 'theme', label: 'Tema', type: 'seg', default: 'ocean', choices: [{ v: 'ocean', t: 'Okyanus' }, { v: 'paper', t: 'Kâğıt' }, { v: 'night', t: 'Gece' }, { v: 'sunset', t: 'Gün batımı' }] },
      { key: 'focus', label: 'Oluşturmak istediğiniz slayt sunusunu açıklayın', type: 'text', placeholder: 'Üst düzey bir taslak ekleyin veya kitle, stil ve odak noktası hakkında bilgi verin' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const n = o.length === 'short' ? '6-8' : '10-14';
      progress('Slaytlar hazırlanıyor…');
      const r = await json(
        `Usta bir sunum tasarımcısı ve eğitmensin. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\n${n} slaytlık bir sunu hazırla. Biçim: ${o.format === 'detailed' ? 'Ayrıntılı: her slaytta açıklayıcı tam cümleler, 3-5 madde ve kısa bir paragraf.' : 'Sunucu slaytları: her slaytta en fazla 3 kısa madde, ayrıntılar konuşmacı notlarında.'}\nİlk slayt "title" düzeninde olsun. Uygun yerlerde "stat" (çarpıcı tek sayı), "two-col" (karşılaştırma) ve "quote" düzenlerini kullan. Son slayt özet olsun.\nJSON: {"title": "...", "subtitle": "...", "slides": [{"layout": "title|bullets|two-col|stat|quote", "title": "...", "bullets": ["..."], "body": "kısa paragraf (isteğe bağlı)", "left": {"heading": "...", "bullets": ["..."]}, "right": {"heading": "...", "bullets": ["..."]}, "stat": {"value": "...", "label": "..."}, "quote": "...", "icon": "tek emoji", "notes": "konuşmacı notu", "refs": [1]}]}`,
        signal);
      return { title: r.title || 'Slayt Sunusu', content: { ...r, theme: o.theme, format: o.format, refs: refsOf(ctx) } };
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
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\n${n} sahnelik bir ${o.format === 'short' ? 'kısa, dikey (60-90 sn), merak uyandıran bir hikâyeyle açılan' : 'açıklayıcı, yatay (4-7 dk)'} video senaryosu yaz. Her sahnede ekranda kısa yazılar ve seslendirme metni olsun. Seslendirme doğal konuşma dilinde olsun, kısaltmaları açıkla.\nJSON: {"title": "...", "scenes": [{"title": "ekran başlığı", "icon": "sahneyi anlatan 1-3 emoji", "bullets": ["ekranda en fazla 3 kısa ifade"], "stat": {"value": "", "label": ""}, "narration": "seslendirme metni (2-5 cümle)"}]}`,
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
      { key: 'count', label: 'Kart sayısı', type: 'seg', default: 'std', choices: [{ v: 'few', t: 'Daha az' }, { v: 'std', t: 'Standart' }, { v: 'more', t: 'Daha fazla' }] },
      { key: 'level', label: 'Zorluk Seviyesi', type: 'seg', default: 'mid', choices: [{ v: 'easy', t: 'Kolay' }, { v: 'mid', t: 'Orta' }, { v: 'hard', t: 'Zor' }] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Konu ne olsun?', type: 'text', placeholder: 'Ön yüzde sinyal adı, arkada tanımı bulunan kartlar oluşturun.' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const n = { few: 12, std: 25, more: 40 }[o.count];
      progress(`${n} kart hazırlanıyor…`);
      const r = await json(
        `Etkili hafıza kartları hazırlayan bir öğretmensin. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\n${n} adet bilgi kartı hazırla. Zorluk: ${{ easy: 'kolay, temel tanımlar', mid: 'orta', hard: 'zor, ayrıntı ve karşılaştırma' }[o.level]}. Ön yüz kısa bir soru veya terim, arka yüz kısa net cevap (en fazla 2 cümle). Her karta 1 cümlelik "explain" ekle.\nJSON: {"title": "...", "cards": [{"front": "...", "back": "...", "explain": "...", "ref": 1}]}`,
        signal);
      return { title: r.title || 'Bilgi Kartları', content: { cards: r.cards || [], refs: refsOf(ctx) } };
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
      { key: 'count', label: 'Soru Sayısı', type: 'seg', default: 'std', choices: [{ v: 'few', t: 'Daha az' }, { v: 'std', t: 'Standart' }, { v: 'more', t: 'Daha fazla' }] },
      { key: 'level', label: 'Zorluk Seviyesi', type: 'seg', default: 'mid', choices: [{ v: 'easy', t: 'Kolay' }, { v: 'mid', t: 'Orta' }, { v: 'hard', t: 'Zor' }] },
      { key: 'target', label: 'Hedef puan (100 üzerinden)', type: 'seg', default: '70', choices: [{ v: '60', t: '60' }, { v: '70', t: '70' }, { v: '85', t: '85' }, { v: '100', t: '100' }] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Konu ne olsun?', type: 'text', placeholder: 'A1 ve A2 sahalarını ayırt eden 5 çoktan seçmeli soru ekle.' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const ex = EXAMS.find((e) => e.v === o.preset) || EXAMS[0];
      const n = { few: 6, std: 12, more: 20 }[o.count];
      const L = 'ABCDE'.slice(0, ex.opts).split('').join(', ');
      progress(`${n} soru hazırlanıyor…`);
      const r = await json(
        `Sınav hazırlayan titiz bir uzmansın. ${BASE_RULES(o.lang)}\n- Her sorunun yalnızca bir doğru cevabı olsun ve bu cevap kaynakla birebir doğrulanabilsin.\n- Çeldiriciler makul ama kesinlikle yanlış olsun; tipik öğrenci hatalarını yansıtsın.`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\n${n} adet ${ex.opts} şıklı (${L}) çoktan seçmeli soru hazırla. Sınav tarzı: ${ex.style}. Zorluk: ${{ easy: 'kolay', mid: 'orta', hard: 'zor' }[o.level]}. Soruları konularına göre dengeli dağıt ve doğru şıkkın yerini karıştır. Her soruya kısa bir konu etiketi ver.\nJSON: {"title": "...", "questions": [{"topic": "konu etiketi", "q": "...", "options": ["...", "..."], "answer": 0, "hint": "cevabı vermeyen ipucu", "explanation": "doğru cevabın gerekçesi ve neden diğerleri yanlış", "ref": 1}]}`,
        signal);
      const qs = (r.questions || []).filter((q) => Array.isArray(q.options) && q.options.length >= 2).map((q) => ({ ...q, answer: Math.max(0, Math.min(q.options.length - 1, +q.answer || 0)) }));
      return { title: r.title || 'Test', content: { questions: qs, refs: refsOf(ctx), mode: o.mode, preset: o.preset, target: +o.target || 70, minutes: o.mode === 'exam' ? Math.max(5, Math.round(qs.length * ex.minPerQ)) : 0 } };
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
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nBir infografik içeriği hazırla: ${n} bilgi kutusu, 3-4 çarpıcı sayı, isteğe bağlı bir karşılaştırma tablosu ve bir zaman çizelgesi (kaynakta tarih varsa). Metinler kısa olsun.\nJSON: {"title": "...", "subtitle": "...", "highlights": [{"icon": "emoji", "heading": "...", "text": "en fazla 25 kelime"}], "stats": [{"value": "...", "label": "..."}], "timeline": [{"date": "...", "text": "..."}], "compare": {"columns": ["", "...", "..."], "rows": [["satır başlığı", "...", "..."]]}, "takeaway": "tek cümlelik ana mesaj"}`,
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
export async function answer(nb, history, question, { signal, onToken }) {
  const ctx = await buildContext(nb, question, {});
  const msgs = history.slice(-8).map((m) => ({ role: m.role, content: m.content }));
  msgs.push({ role: 'user', content: `${ctxBlock(ctx)}\n\nSORU: ${question}` });
  const text = await chat({
    signal, onToken, messages: msgs,
    system: `Kullanıcının yüklediği kaynaklar üzerine çalışan bir öğrenme asistanısın.
- Yalnızca KAYNAKLAR'a dayan; kaynakta yoksa bunu açıkça söyle.
- Her bilginin sonuna dayandığı parça numarasını [2] veya [2][5] biçiminde ekle.
- Markdown kullan; uygun yerde başlık ve madde işaretleri kullan.
- Kullanıcının dilinde yanıt ver. Yanıtın sonunda kullanıcıya konuyu derinleştirecek bir sonraki adımı tek cümleyle öner.`
  });
  return { text, refs: refsOf(ctx) };
}

export async function suggestQuestions(nb, signal) {
  const ctx = await buildContext(nb, '', { budgetChars: 20000 });
  const r = await chatJSON({ signal, role: 'fast', system: 'Yalnızca JSON döndür.', messages: [{ role: 'user', content: `${ctxBlock(ctx)}\n\nBu kaynaklar hakkında kullanıcının sorabileceği 3 kısa, merak uyandıran soru ve kaynakların 2 cümlelik özetini yaz (kaynakların dilinde).\nJSON: {"summary": "...", "questions": ["...", "...", "..."]}` }] });
  return r;
}
