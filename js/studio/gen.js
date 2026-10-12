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

async function json(system, user, signal) {
  return chatJSON({ system, messages: [{ role: 'user', content: user }], signal });
}
const refsOf = (ctx) => ctx.refs.map(({ n, sourceId, title, page, text }) => ({ n, sourceId, title, page, text: text.slice(0, 600) }));

// ---------------- Studio araçlarının tanımı ----------------
export const TOOLS = {
  podcast: {
    label: 'Sesli Özet', icon: 'audio', title: "Sesli Özet'i özelleştirin",
    options: [
      { key: 'format', label: 'Biçim', type: 'cards', default: 'deep', choices: [
        { v: 'deep', t: 'Ayrıntılı inceleme', d: 'İki sunucu arasında geçen, kaynaklarınızdaki konuları açıklayıp birbirine bağlayan canlı bir sohbet' },
        { v: 'brief', t: 'Özet', d: 'Kaynaklarınızdaki temel fikirleri hızlıca anlamanıza yardımcı olacak kısa bir özet' },
        { v: 'critique', t: 'Eleştiri', d: 'Materyalinizi iyileştirmenize yardımcı olacak yapıcı geri bildirimler sunan uzman incelemesi' },
        { v: 'debate', t: 'Tartışma', d: 'İki sunucu arasında geçen, farklı bakış açılarını yansıtan düşünceli bir tartışma' }
      ] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'length', label: 'Uzunluk', type: 'seg', default: 'default', choices: [{ v: 'short', t: 'Kısa' }, { v: 'default', t: 'Varsayılan' }, { v: 'long', t: 'Uzun' }] },
      { key: 'focus', label: 'Yapay zeka sunucuları bu bölümde neye odaklanmalı?', type: 'text', placeholder: 'Örn. Deniz sahaları ve zorunlu cihazlar' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const segCount = { short: 2, default: 4, long: 7 }[o.length] || 4;
      const style = {
        deep: 'İki sunucu (A: Deniz, kadın; B: Kaan, erkek) konuyu merakla, örneklerle ve benzetmelerle derinlemesine işler. Doğal konuşma dili, kısa araya girmeler ("Evet, tam olarak", "Peki ama...") kullanılır.',
        brief: 'Tek sunucu (A: Deniz) kısa ve net bir özet sunar. Yalnızca A konuşur.',
        critique: 'İki uzman (A ve B) materyalin güçlü ve zayıf yönlerini, eksiklerini ve nasıl iyileştirileceğini yapıcı biçimde değerlendirir.',
        debate: 'İki sunucu (A ve B) konunun tartışmalı yönlerini farklı bakış açılarıyla saygılı bir tartışma şeklinde ele alır.'
      }[o.format];
      progress('Bölüm planı çıkarılıyor…');
      const plan = await json(
        `Bir podcast yapımcısısın. ${BASE_RULES(o.lang)}`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nBu kaynaklardan bir podcast bölümü planla. Tarz: ${style}\n${segCount} bölümlük akış çıkar.\nJSON: {"title": "çekici bölüm başlığı", "segments": [{"topic": "bölüm konusu", "points": ["işlenecek nokta", "..."]}]}`,
        signal);
      const lines = [];
      const segs = (plan.segments || []).slice(0, segCount);
      for (let i = 0; i < segs.length; i++) {
        progress(`Senaryo yazılıyor (${i + 1}/${segs.length})…`);
        const prev = lines.slice(-4).map((l) => `${l.speaker}: ${l.text}`).join('\n');
        const part = await json(
          `Doğal, akıcı podcast diyaloğu yazan bir senaristsin. ${BASE_RULES(o.lang)}`,
          `${ctxBlock(ctx)}\n${focusLine(o.focus)}\nTarz: ${style}\nBölüm başlığı: ${plan.title}\nŞu an ${i + 1}. / ${segs.length} kısım: ${segs[i].topic}\nİşlenecek noktalar: ${(segs[i].points || []).join('; ')}\n${i === 0 ? 'Bu ilk kısım: dinleyiciyi karşıla ve konuyu tanıt.' : 'Önceki son replikler:\n' + prev + '\nKaldığın yerden doğal devam et, tekrar selamlama yapma.'}\n${i === segs.length - 1 ? 'Bu son kısım: ana fikirleri toparla ve vedalaş.' : ''}\nYaklaşık 14-20 replik yaz. Kısaltmaları açıkla. Sayıları okunacak biçimde yaz.\nJSON: {"lines": [{"speaker": "A", "text": "..."}, {"speaker": "B", "text": "..."}]}`,
          signal);
        for (const l of part.lines || []) if (l.text) lines.push({ speaker: o.format === 'brief' ? 'A' : (l.speaker === 'B' ? 'B' : 'A'), text: String(l.text) });
      }
      return { title: plan.title || 'Sesli Özet', content: { format: o.format, lang: o.lang, hosts: { A: 'Deniz', B: 'Kaan' }, lines } };
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
      { key: 'count', label: 'Soru Sayısı', type: 'seg', default: 'std', choices: [{ v: 'few', t: 'Daha az' }, { v: 'std', t: 'Standart' }, { v: 'more', t: 'Daha fazla' }] },
      { key: 'level', label: 'Zorluk Seviyesi', type: 'seg', default: 'mid', choices: [{ v: 'easy', t: 'Kolay' }, { v: 'mid', t: 'Orta' }, { v: 'hard', t: 'Zor' }] },
      { key: 'lang', label: 'Dil seçin', type: 'lang' },
      { key: 'focus', label: 'Konu ne olsun?', type: 'text', placeholder: 'A1 ve A2 sahalarını ayırt eden 5 çoktan seçmeli soru ekle.' }
    ],
    async generate(nb, o, { signal, progress }) {
      const ctx = await buildContext(nb, o.focus);
      const n = { few: 6, std: 12, more: 20 }[o.count];
      progress(`${n} soru hazırlanıyor…`);
      const r = await json(
        `Sınav hazırlayan titiz bir uzmansın. ${BASE_RULES(o.lang)}\n- Her sorunun yalnızca bir doğru cevabı olsun ve bu cevap kaynakla birebir doğrulanabilsin.\n- Çeldiriciler makul ama kesinlikle yanlış olsun.`,
        `${ctxBlock(ctx)}\n${focusLine(o.focus)}\n${n} adet 4 şıklı çoktan seçmeli soru hazırla. Zorluk: ${{ easy: 'kolay', mid: 'orta', hard: 'zor' }[o.level]}. Doğru şıkkın yerini sorular arasında karıştır.\nJSON: {"title": "...", "questions": [{"q": "...", "options": ["A metni", "B metni", "C metni", "D metni"], "answer": 0, "hint": "cevabı vermeyen ipucu", "explanation": "doğru cevabın gerekçesi ve neden diğerleri yanlış", "ref": 1}]}`,
        signal);
      const qs = (r.questions || []).filter((q) => Array.isArray(q.options) && q.options.length >= 2).map((q) => ({ ...q, answer: Math.max(0, Math.min(q.options.length - 1, +q.answer || 0)) }));
      return { title: r.title || 'Test', content: { questions: qs, refs: refsOf(ctx) } };
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
  const r = await chatJSON({ signal, system: 'Yalnızca JSON döndür.', messages: [{ role: 'user', content: `${ctxBlock(ctx)}\n\nBu kaynaklar hakkında kullanıcının sorabileceği 3 kısa, merak uyandıran soru ve kaynakların 2 cümlelik özetini yaz (kaynakların dilinde).\nJSON: {"summary": "...", "questions": ["...", "...", "..."]}` }] });
  return r;
}
