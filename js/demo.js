// Örnek defter: model bağlamadan da tüm Studio görüntüleyicilerini GitHub Pages önizlemesinde görebilmek için
import { db, now } from './db.js';
import { addSource } from './sources.js';

const SOURCE = `GMDSS (Küresel Deniz Tehlike ve Emniyet Sistemi) — Çalışma Notları

1. Tanım ve amaç
GMDSS, Uluslararası Denizcilik Örgütü (IMO) tarafından SOLAS Sözleşmesi Bölüm IV kapsamında düzenlenen, uydu ve karasal haberleşme teknolojilerini birleştiren küresel bir tehlike ve emniyet haberleşme sistemidir. Temel amacı, tehlikedeki bir geminin yerinin ve durumunun en kısa sürede kıyıdaki arama-kurtarma koordinasyon merkezlerine (RCC) ve yakındaki gemilere bildirilmesidir. Eski sistem, gemiden gemiye uyarıya ve mors telgrafına dayanıyordu; GMDSS ise uyarının otomatik olarak kıyıya ulaşmasını sağlar.

2. Uygulama takvimi
- 1 Şubat 1992: GMDSS uygulaması başladı.
- 1 Ağustos 1993: Gemilerde NAVTEX alıcısı ve uydu EPIRB bulundurma zorunluluğu.
- 1 Şubat 1995: Bu tarihten sonra inşa edilen gemilerin GMDSS gerekliliklerini tam karşılaması zorunlu oldu.
- 1 Şubat 1999: GMDSS dünya genelinde tüm yönleriyle tam olarak yürürlüğe girdi.
- 1 Şubat 2009: Cospas-Sarsat, 121,5/243 MHz EPIRB sinyallerinin uydu ile işlenmesini sonlandırdı; yalnızca 406 MHz izlenir.
- 1 Ocak 2024: Modernize edilen SOLAS Bölüm IV yürürlüğe girdi. A3 sahası "tanınmış mobil uydu hizmeti" (RMSS) üzerinden teknoloji bağımsız tanımlandı; Inmarsat'ın yanında Iridium da tanındı. MF/HF bantlarındaki NBDP (dar bantlı doğrudan yazma telgrafı) zorunluluğu kaldırıldı.

3. Kapsam
SOLAS'a göre uluslararası sefer yapan 300 gros ton ve üzeri yük gemileri ile uluslararası sefer yapan tüm yolcu gemileri GMDSS'e tabidir. Balıkçı gemileri ve yatlar SOLAS kapsamı dışındadır; ancak ulusal mevzuat gereği benzer cihazlar taşıyabilirler.

4. Deniz sahaları
- A1 sahası: En az bir VHF kıyı istasyonunun radyotelefon kapsama alanı; sürekli DSC alarmı alınabilir. Yaklaşık 20-30 deniz mili.
- A2 sahası: A1 dışında kalan, en az bir MF kıyı istasyonunun kapsama alanı. Yaklaşık 100-150 deniz mili.
- A3 sahası: A1 ve A2 dışında kalan, tanınmış mobil uydu hizmetinin kapsadığı alan. Inmarsat için yaklaşık 70° Kuzey ile 70° Güney arası.
- A4 sahası: A1, A2 ve A3 dışında kalan kutup bölgeleri. Burada HF haberleşmesi esastır; Iridium kutupları da kapsar.

5. GMDSS'in dokuz işlevi
Gemiden kıyıya tehlike uyarısı, kıyıdan gemiye tehlike uyarısı, gemiden gemiye tehlike uyarısı, arama-kurtarma koordinasyon haberleşmesi, olay yeri haberleşmesi, yer belirleme sinyalleri, denizde emniyet bilgisi (MSI) yayını ve alımı, genel haberleşme ve köprüden köprüye haberleşme.

6. Temel cihazlar ve frekanslar
- VHF DSC: Kanal 70 (156,525 MHz) yalnızca DSC içindir. Kanal 16 (156,8 MHz) tehlike, acelelik ve emniyet için ses kanalıdır. Kanal 13 köprüden köprüye haberleşmede kullanılır.
- MF DSC: 2187,5 kHz; MF tehlike sesli haberleşmesi 2182 kHz.
- NAVTEX: Uluslararası 518 kHz (İngilizce), ulusal 490 kHz. Yaklaşık 200-400 deniz mili menzil.
- EPIRB: 406 MHz, Cospas-Sarsat uyduları üzerinden konum bildirir. Yeni nesil EPIRB'lerde Galileo Return Link Service (RLS) ile kazazedeye "sinyal alındı" teyidi mavi ışıkla gösterilir.
- SART: 9 GHz (X-bant) radar transponderi; radar ekranında 12 noktalı bir hat oluşturur. AIS-SART ise AIS ekranlarında görünür.
- Portatif VHF (iki yönlü telsiz): Can kurtarma araçlarında olay yeri haberleşmesi için.

7. Haberleşme öncelikleri
1) Tehlike: MAYDAY — gemi veya kişi ciddi ve yakın tehlikede, acil yardım gerekiyor.
2) Acelelik: PAN PAN — geminin veya bir kişinin emniyetiyle ilgili acil mesaj.
3) Emniyet: SECURITE — seyir veya meteoroloji uyarısı.
4) Diğer rutin haberleşmeler.

8. Operatör belgeleri
- ROC (Tahditli Operatör Belgesi): Yalnızca A1 sahasında görev için en alt seviye SOLAS belgesi.
- GOC (Genel Operatör Belgesi): Tüm deniz sahalarında görev yapabilir.
- 2. Sınıf ve 1. Sınıf REO (Radyo Elektronik Operatör): Denizde elektronik bakım yapabilen üst seviye belgeler.
- SOLAS dışı tekneler için SRC (kısa mesafe, ROC karşılığı) ve LRC (uzun mesafe, GOC karşılığı) belgeleri vardır.

9. Cihazların çalışırlığını sağlama yöntemleri
Kıyıda elektronik bakım, denizde elektronik bakım (gemide REO, ölçü aletleri ve yedek parça) ve cihaz çiftlemesi (dublikasyon). A1 ve A2 sahalarındaki gemiler bu üç yöntemden en az birini, A3 ve A4 sahalarındaki gemiler en az ikisini uygulamak zorundadır.`;

export async function seedDemo() {
  const id = await db.notebooks.add({ title: 'Örnek: GMDSS Genel Operatör Belgesi', emoji: '⚓', createdAt: now(), updatedAt: now(), demo: true,
    summary: { summary: 'Bu örnek defter, GMDSS sistemini, deniz sahalarını, temel cihaz ve frekansları, haberleşme önceliklerini ve operatör belgelerini anlatan bir çalışma notuna dayanıyor. Aşağıdaki Studio içerikleri model bağlamadan da incelenebilir.', questions: ['GMDSS hangi tarihte tam olarak yürürlüğe girdi?', 'A1 ve A2 sahaları arasındaki fark nedir?', '2024 SOLAS değişiklikleri neleri getirdi?'] } });
  const sid = await addSource(id, { title: 'GMDSS çalışma notları', kind: 'text', text: SOURCE });
  const titles = ['GMDSS çalışma notları'];
  const ref = (n, text) => ({ n, sourceId: sid, title: titles[0], text });
  const refs = [
    ref(1, 'GMDSS, IMO tarafından SOLAS Bölüm IV kapsamında düzenlenen küresel tehlike ve emniyet haberleşme sistemidir.'),
    ref(2, '1 Şubat 1992 başlangıç; 1 Şubat 1999 tam yürürlük; 1 Ocak 2024 modernize SOLAS Bölüm IV.'),
    ref(3, 'A1: VHF kıyı istasyonu (20-30 nm). A2: MF kıyı istasyonu (100-150 nm). A3: tanınmış mobil uydu hizmeti. A4: kutup bölgeleri.'),
    ref(4, 'VHF Kanal 70 DSC, Kanal 16 ses; MF DSC 2187,5 kHz; NAVTEX 518/490 kHz; EPIRB 406 MHz; SART 9 GHz.'),
    ref(5, 'ROC yalnız A1; GOC tüm sahalar; REO denizde elektronik bakım yapabilir.')
  ];
  const base = { notebookId: id, status: 'done', sourceIds: [sid], sourceTitles: titles, createdAt: now(), updatedAt: now(), versionNote: 'Örnek içerik' };
  let order = 0;
  const add = (type, title, content, options = {}) => db.artifacts.add({ ...base, type, title, content, options, createdAt: now() - 60000 * order++ });

  await add('podcast', 'Denizcileri Hayatta Tutan Küresel İletişim Ağı', { format: 'deep', lang: 'Türkçe', hosts: { A: 'Deniz', B: 'Kaan' }, lines: [
    { speaker: 'A', text: 'Merhaba, derin incelemeye hoş geldiniz. Bugün açık denizde bir geminin başı derde girdiğinde sesini dünyaya nasıl duyurduğunu konuşacağız.' },
    { speaker: 'B', text: 'Yani GMDSS. Küresel Deniz Tehlike ve Emniyet Sistemi. Kulağa resmi geliyor ama aslında bir yaşam halatı.' },
    { speaker: 'A', text: 'Kesinlikle. Eski sistemde her şey yakındaki bir geminin sizi duymasına bağlıydı. GMDSS ile uyarı otomatik olarak kıyıdaki kurtarma merkezine gidiyor.' },
    { speaker: 'B', text: 'Peki bu sistem ne zaman devreye girdi? Sınavlarda en çok sorulan şeylerden biri bu.' },
    { speaker: 'A', text: 'Uygulama bin dokuz yüz doksan iki yılının Şubat ayında başladı. Ama tüm yönleriyle tam olarak yürürlüğe girmesi bir Şubat bin dokuz yüz doksan dokuz.' },
    { speaker: 'B', text: 'Arada yedi yıllık bir geçiş dönemi var yani. Bir de denizi sahalara bölüyoruz, değil mi?' },
    { speaker: 'A', text: 'Evet. A bir sahası bir VHF kıyı istasyonunun duyabildiği alan, kabaca yirmi otuz deniz mili. A iki ise MF kıyı istasyonunun alanı, yüz ile yüz elli mil civarı.' },
    { speaker: 'B', text: 'A üç uydu kapsamı, A dört de kutuplar. Ve iki bin yirmi dört ile birlikte A üç artık sadece Inmarsat demek değil.' },
    { speaker: 'A', text: 'Tam olarak. Artık tanınmış mobil uydu hizmeti deniyor; Iridium da bu kapsamda. Üstelik telsiz telgraf zorunluluğu da kalktı.' },
    { speaker: 'B', text: 'Bugünlük ana fikir şu: GMDSS, tehlikeyi otomatik olarak kıyıya ulaştıran, sahalara göre cihaz zorunluluğu belirleyen bir sistem. Dinlediğiniz için teşekkürler.' }
  ] }, { format: 'deep', lang: 'Türkçe', length: 'short' });

  await add('slides', 'GMDSS Operasyonel Standartları', { title: 'GMDSS Operasyonel Standartları', subtitle: 'Sahalar, cihazlar ve belgeler', theme: 'ocean', format: 'presenter', refs, slides: [
    { layout: 'title', title: 'GMDSS Operasyonel Standartları', body: 'Küresel Deniz Tehlike ve Emniyet Sistemi', icon: '⚓', notes: 'Sunumun amacı: sınav için temel kavramları özetlemek.' },
    { layout: 'bullets', title: 'GMDSS nedir?', icon: '🌍', bullets: ['SOLAS Bölüm IV kapsamında IMO düzenlemesi', 'Uydu ve karasal sistemleri birleştirir', 'Uyarı otomatik olarak kıyıya ulaşır'], notes: 'Eski sistemle farkı vurgula.' },
    { layout: 'stat', title: 'Tam yürürlük', stat: { value: '1 Şubat 1999', label: 'GMDSS dünya genelinde tüm yönleriyle devrede' }, bullets: ['Başlangıç: 1 Şubat 1992'], notes: 'Sık sorulan sınav sorusu.' },
    { layout: 'two-col', title: 'Kıyı tabanlı sahalar', left: { heading: 'A1', bullets: ['VHF kıyı istasyonu', '20-30 deniz mili', 'ROC yeterli'] }, right: { heading: 'A2', bullets: ['MF kıyı istasyonu', '100-150 deniz mili', 'GOC gerekli'] } },
    { layout: 'bullets', title: 'Temel frekanslar', icon: '📻', bullets: ['VHF Kanal 70: yalnız DSC', 'VHF Kanal 16: tehlike sesli', 'NAVTEX 518 kHz', 'EPIRB 406 MHz, SART 9 GHz'] },
    { layout: 'quote', title: 'Öncelik sırası', quote: 'MAYDAY › PAN PAN › SECURITE › rutin' },
    { layout: 'bullets', title: 'Özet', icon: '✅', bullets: ['Dört deniz sahası', 'Sahaya göre zorunlu cihaz', 'Sahaya göre operatör belgesi'] }
  ] }, { format: 'presenter', theme: 'ocean' });

  await add('video', 'GMDSS Dünyanın Her Yerinden Nasıl Duyulur', { title: 'GMDSS: Yaşam Halatı', format: 'short', theme: 'sketch', lang: 'Türkçe', scenes: [
    { title: 'Pasifik’te bir gemi', icon: '🚢🌊', bullets: ['Gece yarısı', 'Makine arızası', 'Kara 900 mil uzakta'], narration: 'Pasifik’te akıntıyla sürüklenen bir gemi düşünün. En yakın kara yüzlerce mil uzakta.' },
    { title: 'Tek tuş: tehlike', icon: '🆘', bullets: ['DSC tehlike butonu', 'Konum otomatik eklenir'], narration: 'Kaptan tek bir tuşa basar. Geminin kimliği ve konumu otomatik olarak gönderilir.' },
    { title: 'Uydular dinliyor', icon: '🛰️', bullets: ['406 MHz EPIRB', 'Cospas-Sarsat'], narration: 'EPIRB sinyali uydulara ulaşır ve oradan kıyıdaki kurtarma merkezine iletilir.' },
    { title: 'Kıyı harekete geçer', icon: '📡🏢', bullets: ['RCC koordine eder', 'Yakındaki gemilere uyarı'], stat: { value: 'A1-A4', label: 'dört deniz sahası' }, narration: 'Kurtarma merkezi bölgedeki gemileri uyarır ve operasyonu koordine eder.' },
    { title: 'Son metreler', icon: '🛟📍', bullets: ['SART radar ekranında', '12 noktalı hat'], narration: 'Son aşamada SART, kazazedeyi kurtarıcının radar ekranında görünür kılar. İşte GMDSS budur.' }
  ] }, { format: 'short', theme: 'sketch' });

  await add('mindmap', 'GMDSS Sistemi Kavram Haritası', { title: 'GMDSS Sistemi Kavram Haritası', root: { label: 'GMDSS Sistemi', children: [
    { label: 'Yersel ve Uydusal Bileşenler', children: [{ label: 'VHF / MF / HF DSC' }, { label: 'Inmarsat ve Iridium (RMSS)' }, { label: 'Cospas-Sarsat EPIRB' }, { label: 'NAVTEX' }] },
    { label: 'Haberleşme Öncelik Hiyerarşisi', children: [{ label: 'Tehlike (MAYDAY)', note: 'Ciddi ve yakın tehlike' }, { label: 'Acelelik (PAN PAN)' }, { label: 'Emniyet (SECURITE)' }, { label: 'Diğer haberleşmeler' }] },
    { label: 'Deniz Sahaları', children: [{ label: 'A1: VHF, 20-30 nm' }, { label: 'A2: MF, 100-150 nm' }, { label: 'A3: uydu kapsamı' }, { label: 'A4: kutup bölgeleri' }] },
    { label: 'Operatör Belgeleri', children: [{ label: 'ROC: yalnız A1' }, { label: 'GOC: tüm sahalar' }, { label: '1. ve 2. sınıf REO' }] },
    { label: 'Sistemin Ana İşlevleri', children: [{ label: 'Tehlike uyarısı' }, { label: 'SAR koordinasyonu' }, { label: 'Yer belirleme' }, { label: 'MSI yayını' }] }
  ] } });

  await add('report', 'GMDSS ve Deniz Telsiz Haberleşmesi: Küresel Emniyet Standartları', { template: 'learn', refs, markdown: `# GMDSS ve Deniz Telsiz Haberleşmesi: Küresel Emniyet Standartları

## GMDSS nedir?
GMDSS, SOLAS Bölüm IV kapsamında düzenlenen ve uydu ile karasal sistemleri birleştiren küresel tehlike haberleşme sistemidir [1]. Uyarı, yakındaki gemilere bağımlı kalmadan doğrudan kıyıya ulaşır.

## Uygulama takvimi
| Tarih | Gelişme |
|---|---|
| 1 Şubat 1992 | Uygulama başladı |
| 1 Şubat 1999 | Tüm yönleriyle tam yürürlük |
| 1 Ocak 2024 | Modernize SOLAS Bölüm IV |

Kaynak: [2]

## Deniz sahaları (A1–A4)
- **A1:** VHF kıyı istasyonu kapsamı, yaklaşık 20-30 deniz mili [3]
- **A2:** MF kıyı istasyonu kapsamı, yaklaşık 100-150 deniz mili [3]
- **A3 / A4:** Uydu kapsamı ve kutup bölgeleri [3]

<!-- embed:CARDS -->

## Telsiz operatör belgeleri
ROC yalnızca A1 sahasında yeterlidir; GOC tüm sahalarda görev yapmayı sağlar [5].

## Özet
Sınav için tarihler, sahalar, frekanslar ve belge türleri birlikte öğrenilmelidir [4].` }, { template: 'learn' });

  const cardsId = await add('flashcards', 'GMDSS Kartları', { refs, cards: [
    { front: 'GMDSS sisteminde A1 deniz sahasında görev yapacak bir telsiz operatörünün sahip olabileceği en alt seviye SOLAS operatör sertifikası nedir?', back: 'Tahditli Operatör Sertifikası (ROC - Restricted Operator Certificate)', explain: 'ROC yalnızca A1 sahasında geçerlidir.' },
    { front: 'VHF Kanal 70 ne için kullanılır?', back: 'Yalnızca DSC (dijital seçmeli çağrı) içindir.', explain: 'Sesli haberleşme Kanal 70’te yapılmaz.' },
    { front: 'GMDSS hangi tarihte tam olarak yürürlüğe girdi?', back: '1 Şubat 1999', explain: 'Uygulama 1 Şubat 1992’de başlamıştı.' },
    { front: 'Uluslararası NAVTEX frekansı?', back: '518 kHz (İngilizce yayın)', explain: '490 kHz ulusal dilde yayın içindir.' },
    { front: 'SART hangi bantta çalışır?', back: '9 GHz (X-bant radar)', explain: 'Radar ekranında 12 noktalı hat oluşturur.' },
    { front: 'A2 sahasını tanımlayan istasyon türü?', back: 'MF kıyı istasyonu', explain: 'Yaklaşık 100-150 deniz mili.' },
    { front: 'PAN PAN hangi öncelik seviyesidir?', back: 'Acelelik', explain: 'MAYDAY’den sonra, SECURITE’den önce gelir.' }
  ] });

  await add('quiz', 'GMDSS Sınavı', { refs, questions: [
    { q: 'GMDSS kurallarına göre, uluslararası sefer yapan aşağıdaki gemilerden hangisi GMDSS yükümlülüklerini yerine getirmekle kesinlikle yükümlüdür?', options: ['Sadece bayrak devletinin karasularında sefer yapan 500 gros tonluk yük gemisi', '150 gros ton ağırlığındaki uluslararası sefer yapan yük gemisi', '200 gros ton ağırlığında, uluslararası hatta çalışan ve 15 yolcu taşıyan yolcu gemisi', 'Uluslararası sularda avlanan 250 gros tonluk ticari balıkçı gemisi'], answer: 2, hint: 'Geminin taşıdığı yolcu sayısı veya tonaj sınırı SOLAS standartlarına göre belirlenir.', explanation: 'Uluslararası sefer yapan tüm yolcu gemileri tonajdan bağımsız olarak kapsamdadır; yük gemileri için sınır 300 GT’dir, balıkçı gemileri SOLAS dışındadır.' },
    { q: 'En az bir VHF kıyı istasyonunun radyotelefon kapsama alanında bulunan ve sürekli DSC alarmı verilebilen deniz alanı hangisidir?', options: ['A1', 'A2', 'A3', 'A4'], answer: 0, hint: 'En kısa menzilli saha.', explanation: 'A1 sahası VHF kıyı istasyonu kapsamıyla tanımlanır.' },
    { q: 'GMDSS sisteminin tüm yönleriyle dünya genelinde tam olarak devreye girdiği tarih hangisidir?', options: ['1 Şubat 1992', '1 Ağustos 1993', '1 Şubat 1995', '1 Şubat 1999'], answer: 3, hint: 'Yedi yıllık geçiş döneminin sonu.', explanation: '1992 başlangıç, 1999 tam yürürlük tarihidir.' },
    { q: '2024 SOLAS değişiklikleriyle hangi zorunluluk kaldırılmıştır?', options: ['NAVTEX alıcısı', 'MF/HF NBDP (telsiz telgraf)', 'VHF DSC', 'EPIRB'], answer: 1, hint: 'Eski bir yazılı haberleşme yöntemi.', explanation: 'Modernizasyonla NBDP zorunluluğu kaldırıldı.' }
  ] });

  await add('infographic', '2024 SOLAS Denizcilik Yenilikleri', { title: '2024 SOLAS Bölüm IV ve RMSS Yenilikleri', subtitle: 'Deniz sahalarına göre kapsam ve ekipman', theme: 'ocean', orientation: 'landscape',
    highlights: [{ icon: '🛰️', heading: 'RMSS standardı', text: 'A3 sahası artık yalnız Inmarsat değil; Iridium gibi tanınmış tüm uydu hizmetlerini kapsar.' }, { icon: '📠', heading: 'NBDP kaldırıldı', text: 'MF/HF üzerinden dar bantlı doğrudan yazma telgrafı şartı sona erdi.' }, { icon: '🔵', heading: 'Yeni nesil EPIRB', text: 'Return Link Service ile kazazedeye sinyalin alındığı mavi ışıkla bildirilir.' }],
    stats: [{ value: '20-30 nm', label: 'A1 · VHF' }, { value: '100-150 nm', label: 'A2 · MF' }, { value: '70°K–70°G', label: 'A3 · Inmarsat' }],
    compare: { columns: ['', 'A1', 'A2', 'A3 / A4'], rows: [['İstasyon', 'VHF kıyı', 'MF kıyı', 'Uydu / HF'], ['Ehliyet', 'ROC', 'GOC', 'GOC veya REO'], ['Bakım yöntemi', 'En az 1', 'En az 1', 'En az 2']] },
    takeaway: 'Saha büyüdükçe cihaz, belge ve bakım gereklilikleri artar.' });

  await add('table', 'GMDSS Deniz Sahaları', { refs, notes: 'Değerler yaklaşık menzillerdir.', columns: ['Saha', 'Kapsam', 'Yaklaşık menzil', 'Zorunlu ek cihaz', 'Asgari belge'], rows: [
    { cells: ['A1', 'VHF kıyı istasyonu', '20-30 nm', 'VHF DSC, NAVTEX, EPIRB, SART', 'ROC'], ref: 3 },
    { cells: ['A2', 'MF kıyı istasyonu', '100-150 nm', 'MF DSC', 'GOC'], ref: 3 },
    { cells: ['A3', 'Tanınmış mobil uydu hizmeti', '70°K–70°G (Inmarsat)', 'RMSS terminali veya HF DSC', 'GOC'], ref: 3 },
    { cells: ['A4', 'Kutup bölgeleri', 'A1-A3 dışı', 'HF DSC', 'GOC'], ref: 3 }
  ] });

  // Rapordaki gömme işaretini gerçek kart kimliğiyle değiştir
  const rep = await db.artifacts.where('notebookId').equals(id).filter((a) => a.type === 'report').first();
  await db.artifacts.update(rep.id, { content: { ...rep.content, markdown: rep.content.markdown.replace('embed:CARDS', 'embed:' + cardsId) } });
  return id;
}
