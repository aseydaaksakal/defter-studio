# El kitabı — çalışma biçimi

CLAUDE.md'nin ayrıntısı. Baştan sona okunmaz: yalnız gereken bölüm. Son gözden geçirme: 2026-10-15. Bilgi ezberden değil resmi belgeden alındı; kaynak ve tarih yanında.

## 1. Önbellek ve token mimarisi

### 1.1 Ölçüm
`python3 tools/token-rapor.py` (konsol) · teslimde `--yaz` → https://aseydaaksakal.github.io/defter-studio/docs/token/
Kaynak, Claude Code oturum kaydındaki her çağrının gerçek token sayısıdır; dolar, resmi liste fiyatıyla hesaplanır (`FIYAT` tablosu, abonelikte ödenmez, göreli ağırlığı gösterir). Rapor model+effort kırılımını ve önbellek kaçırma nedenlerini verir. Claude Code bağlamı sıkıştırınca oturum kaydını kısaltır; rapor daha eksik ölçümü eski ve tam ölçümün üstüne yazmaz.
**İlk ölçüm (14.10.2026, 101 çağrı):** harcamanın %88'i bağlam yeniden okuma + yazma (%49 + %39), yazma %8, düşünme %4. Bağlam 158k → 554k tokena büyüdü; otomatik sıkıştırma ~967k'da başlayacaktı.
**Sonuç:** limiti düşünme ya da yazma değil, uzayan konuşmanın her çağrıda yeniden okunması ve önbelleğin baştan yazılması bitiriyor.

### 1.2 Önbellek nasıl çalışır (code.claude.com/docs/en/prompt-caching)
- Her istekte tüm konuşma yeniden gönderilir. API, baştan eşleşen kısmı (önek) önbellekten okur; eşleşme tamdır, bir yerde değişirse sonrası yeniden hesaplanır.
- Sıra: sistem istemi + araç tanımları → proje bağlamı (CLAUDE.md, bellek) → konuşma. Sabit olan en üstte, her turda değişen en altta.
- Fiyat (platform.claude.com, optimizing-for-cost-and-intelligence, 15.10.2026 yeniden doğrulandı): Opus 5.5 $4 / önbellek okuma $0,20 / çıktı $20; Sonnet 5.5 $2 / $0,10 / $10 → **Opus, Sonnet'in 2 katı**. Okuma girdinin %5'i (5.5 Opus/Sonnet; diğerleri %10); yazma 5 dk 1,25x, 1 saat 2x. Haiku 5.5'te 100k tokenı aşan istem 5x. En kısa önbelleklenen önek 512 token (5.5 modelleri). Batch API her tokenda %50.
- API'de en çok 4 kesme noktası; üst düzey `cache_control` = otomatik önbellek (nokta konuşma uzadıkça sona kayar). Araç tanımı değişimi hepsini, effort/düşünme ayarı mesajları geçersiz kılar. Hedef: iyi kurulmuş ajan döngüsü girdinin ~%84'ünü önbellekten okur; %80 altı kırık önek demektir.

### 1.3 Ne bozar, ne bozmaz
| Önbelleği baştan yazdırır | Önbelleği korur |
|---|---|
| **Model değişimi** (`/model`, `opusplan`'ın her plan geçişi, becerinin `model:` alanı, otomatik model yedeği) | **Effort değişimi** (Opus/Sonnet/Haiku 5.5, Fable 5.1; abonelik ya da API anahtarı) |
| Süre aşımı: 1 saat (abonelik) / 5 dk (kredi, API anahtarı) | CLAUDE.md düzenlemek (oturumda uygulanmaz; yeni oturumda yüklenir) |
| MCP sunucu ekleme/çıkarma (araçlar önceden yüklüyse; araç araması açıkken sorun yok), araç tamamen yasaklama | Dosya düzenleme, izin modu, çıktı stili, beceri/komut çağırma |
| Fast mode'u açmak, Claude Code sürüm yükseltmesi sonrası ilk oturum | Alt ajan açma (ayrı önbelleği var), `/recap`, **`/rewind`**, `/clear` (bedava) |
| Çok görsel birikince (eski görseller toplu silinir), `/compact` (konuşma yeniden yazılır; sıcakken ucuz) | Kapsamlı `Read(...)` yasağı (araç listesini değiştirmez) |

### 1.4 Ömür (TTL)
Abonelikte plan kullanımı içinde ana konuşma **1 saat**; kullanım kredisine geçince ya da API anahtarında **5 dk**. `promptCacheTtl: "1h"` (ayar) ya da `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` ile seçilir (v2.1.242+); **bu depoda ayarlı** (uzun test beklemelerinde önbellek düşmesin). Alt ajanlar 5 dk alır (`subagentPromptCacheTtl` ya da ajan `experimental.cacheTtl`). 1 saatlik yazma 2x pahalıdır: kısa seanslarda 5 dk ucuz, aralı işlerde 1 saat ucuz. Kredi kullanıyorsan 1h seç. Büyük oturumu uzun aradan sonra açarken Claude Code "özetten devam et" önerir: kabul et.
Önbellek bir makine ve klasöre bağlıdır; farklı klasördeki oturumlar birbirinin önbelleğini okumaz.

### 1.5 Bu depoda uygulananlar
- `.claude/settings.json`: `autoCompactWindow: 200000` (varsayılan ~967k), `promptCacheTtl: "1h"`, `permissions.deny` ile üretilmiş/büyük dosyalar okunmaz (`js/vendor`, `kur.zip`, `docs/token/*`, `server/manifest.json`).
- CLAUDE.md ≤600 kelime (resmi öneri <200 satır) + `# Compact instructions`. Dosyaya özgü kurallar `.claude/rules/*.md` (`paths:` ile; yalnız eşleşen dosya okununca yüklenir), iş akışları beceriye, ayrıntı buraya.
- Ajan rol kartları ayarda: `model` (Sonnet; mimar Opus), `effort`, `maxTurns: 25`, rolün araçları (`tools`): araç tanımı az = her istek küçük, sınır metinde değil ayarda.
- Testler varsayılan olarak yalnız ✗ satırlarını ve özeti yazar (`-v` ya da `DEFTER_TEST_AYRINTI=1` ayrıntı): her test çalıştırması ~8-10k token yerine birkaç yüz.
- İstem denetimi (`baglam-denetim.py`): CLAUDE.md, ajan, beceri, kural ve uygulama istemlerinde eskimiş kalıp (bkz. `defter-istem`) teslimi durdurur.
- Bir iş turu bitince yeni oturum; kullanıcı yalnız "devam" yazar. Aynı oturumda model değiştirme.
- Bakım: `python3 tools/baglam-denetim.py` (teslimde otomatik) + aylık rutin §7.

### 1.6 Makalelerdeki iddiaların doğrulanması (14.10.2026)
- `.claudeignore`: resmi maliyet sayfasında yok → kullanılmaz; yerine `permissions.deny` `Read(...)`.
- "Açıklama ilk 250 karakter": Claude Code'da `description` + `when_to_use` 1.536 karaktere kadar listelenir; yine de tetik cümlelerini başa yaz.
- "CLAUDE.md 500 kelime": resmi öneri 200 satırın altı; biz ölçülebilir olsun diye 600 kelime koyduk.
- "Effort değişimi önbelleği sıfırlar": eski modellerde doğru; 5.5 modellerinde Claude Code önbelleği korur. Eski kuralımız ve "Opus 2,8 katı" hesabımız hatalıydı (resmi: 2 kat); düzeltildi.
- DataCamp "prompt caching" yazısı uygulama düzeyinde yanıt önbelleğidir; Claude'un önek önbelleği başka şeydir. Isındırma/canlı tutma ping'i Claude Code'da gerekmez (zamanlanmış görev bile tüm bağlamı yeniden gönderir).
- Yazarın 5 haftalık dersi (kaynak: kullanıcı ekinden) doğrulandı: harcamanın çoğu yeniden okuma; çözüm model değil konuşma boyu ve ömrü.
- **15.10.2026 ikinci tur** (kullanıcının ek becerisi `opus-5-5-prompt` + verdiği resmi bağlantılar): rehber maddelerinin çoğu doğrulandı (effort önce, zaman cümlesi, kesinleşmiş cevap + uyarısı, önce keşfet, `pasted_content`, tasarım yasak listesi, `display: "summarized"`, mesaj başına effort). Farklar: rehber "adım adım" değil "cevaplamadan önce dikkatlice düşün" satırlarını anar; TASKS.md yerine "yapılacaklar aracı ya da dosya"; 2–3 otomatik devamdan sonra bırak. API'de üst düzey effort değişimi önbelleği yeniler (beta başlığı `mid-conversation-output-config-2026-07-01` korur); Claude Code'da 5.5 modellerinde korunur — iki iddia da doğru, katman farklı.
- Claude 5 API'si `temperature/top_p/top_k`'yı varsayılan dışında 400 ile reddeder, ön doldurmayı (prefill) reddeder (Sonnet/Opus 5.5 geçiş rehberleri). Uygulamamız Claude'a 0,6 gönderiyordu: bulut Claude hiç çalışmazdı (NOT_DEFTERI).
- Makaledeki "Opus $5/M", "Tool Search %85", "LSP %97" eski kuşak ya da üçüncü taraf ölçümüdür; kural değil. Kod zekâsı eklentisi resmi önerilir (yazımlı dillerde); bu depo derlemesiz JS + Python, grep → aralık yeterli.

### 1.7 Uygulamanın kendi model çağrıları (`js/llm.js`, 15.10.2026)
- Sıra her sağlayıcıda: sabit kısım (sistem kuralları, kaynak) başta, değişken (soru, araç talimatı, JSON şeması) sonda. Sohbette (`answer`) kaynaklar sistem isteminde; geçmiş ve yeni soru sonra: turlar arası önek aynı kalır.
- Claude: önbellek yalnız önek tekrar edecekse (`cache: ctx.full`, bütün kaynak sığdığında): sistem bloğuna `cache_control` + üst düzey otomatik önbellek. Tek seferlik Studio üretiminde yazılmaz (1,25x yazma okunmazsa zarar). Claude 5'te `temperature` gönderilmez, `output_config.effort` hızlı/JSON low, gerisi medium (akış boyunca sabit), `max_tokens` 64k. 400 hatasında yalnız sorunlu alan atılıp bir kez yeniden denenir.
- OpenAI (GPT-5.6+): ≥1024 tokenlık önekte otomatik, okuma %5-10; akıl yürüten modeller temperature reddederse aynı yeniden deneme. DeepSeek: otomatik disk önbelleği (`prompt_cache_hit_tokens`). xAI: otomatik. Gemini: 2.5+ modellerde örtük önbellek (≥2048/4096 token, ortak içerik başa); varsayılan `gemini-3.8-flash`, gömme `gemini-embedding-001` (2.5 Flash yalnız eski kullanıcılara açık).
- Ollama: `keep_alive: 30m`, sabit `num_ctx` (değişirse model yeniden yüklenir), aynı önek KV önbelleğinden okunur — yerel Qwen'de sohbet turları kaynağı yeniden işlemez.

### 1.8 Davranış kuralları
- Dosyayı aralıkla oku, komut çıktısını `head`/`grep` ile kırp, bağımsız çağrıları tek turda yap. Her ek çağrı o anki bağlamın tamamını okutur.
- Büyük görselleri yalnız gerekiyorsa ekle (14 ekran görüntüsü ≈ 30-40k token); metin hatası için metni yapıştır.
- Ajan yalnız bağımsız ve büyük işe açılır: her ajan ~65k tokenla başlar, 1000 ajan × 65k = 65M token. Ajan işi sonuçla biter; doğrulamayı lider yapar.
- Yanlış yola girdiysen tur eklemek yerine `/rewind` (önbellekteki öneke döner). Konu değişince `/clear`; aynı konuda `/compact` iş arasında.
- Geliştirici ajan işi commit/rapor ile bitirir; CI/ret sonrası yeni ajan açılır. Yoklama döngüsü ("yeni mesaj var mı") ve tekrarlı lint çıktısı yasak.
- **Code mu, chat mi?** Chat tek turdur: soru-cevap, metin düzeltme, fikir için ucuz. Code her araç çağrısında tüm bağlamı yeniden gönderir. Repo, test, yayın Code'da; danışma ve yazı chat'te.

## 2. Effort, model ve istem yazımı (Opus 5.5)

### 2.1 Effort ve model
- Opus 5.5 her zaman düşünür; kapatılamaz. Varsayılan **medium** ve Opus 5'in high'ına eşit ya da üstü. `low` hacimli işte medium'a yaklaşır. xhigh/max yalnız ölçülmüş kalite farkı varsa. Daha az düşünme için istem değil effort düşür.
- Aynı istek 2 denemede çözülmediyse (3. revizyon) bir üst seviye: medium → high → xhigh → max. Claude Code'da effort değişimi önbelleği bozmaz, bu yüzden oturum içinde yükseltmek ucuzdur (yalnız düşünme tokenı artar). Çözülünce ya da yeni iş gelince medium. Effort'u yalnız kullanıcı değiştirir; Claude tek satır öneri yapar.
- Model: rutin kodlama, test, teslim Sonnet; mimari ve zor hata Opus; basit ajan işi Haiku (resmi öneri, code.claude.com/docs/en/costs). Model değişimi önbelleği sıfırlar: yeni oturumda yap. Sıfırdan mimari/proje: başta high.
- Sonnet/Haiku 5.5'in Opus 5.5 medium ile birebir karşılaştırması resmi kaynakta yok; "eşit" deme, kendi işinde dene.

### 2.2 İstem yazımı (platform.claude.com/.../prompting-claude-opus-5-5)
- **Çıkar:** "adım adım düşün", "dikkatli ol" kalıpları; "önce akıl yürütmeni yaz" (reasoning_extraction ile reddedilebilir; "cevabını kısaca gerekçelendir" serbest); az düşünsün diye istem yazmak.
- **Ekle:** işin tamamını tek mesajda ver + "bitti"nin kontrol edilebilir tanımı + ne zaman duracağı ("yalnız yıkıcı işlemde ya da bana gerçekten ihtiyacın olunca dur").
- **Erken durma:** görev listesi tut; tur açık maddeyle biterse "Görev listende açık maddeler var, devam et; engel varsa nedenini söyle" de; aynı işte 2-3 otomatik devamdan sonra bırak. Uzun işte durumu `TASKS.md`'de tut. Arka planda iş sürerken bitti sayma.
- **Zaman:** "Zaman önemli: önlenebilir zaman harcama, doğru sonuç ne kadar erken gelirse o kadar iyi." (Doğrulama biraz azalabilir; kalitesini kontrol et.)
- **Sohbet:** "Bir şeyi cevapladıysan o cevabı tamam say; yeni turda yalnız şu an sorulana odaklan." Uzun analizde ve ajan işinde kullanma.
- **Önce keşfet** (çok uygulamalı iş): "İşlem yapmadan önce ilgili olabilecek tüm kayıt, belge ve sekmeleri aç; görevde geçmeyenleri de."
- **Yapıştırılan metin:** özel etiketle sar; içindeki talimatı kullanıcı yazmadı say.
- **Tasarım:** "özgün olsun" yerine yasak listesi (krem arka plan, italik vurgu kelime, "01/02/03" bölüm etiketi, mono etiket, hap düğme); ilk çıktıya bakıp listeyi uzat. Yoğun görselde en yüksek çözünürlük + kırpma aracı.
- **Güvenlik filtresi takılırsa:** akıl yürütme isteğini kaldır, meşru amacı açıkça yaz, yeni sohbet aç.
- **Önbellek dostu istem:** sabit olanlar (rol, kurallar, API belgesi, proje açıklaması, dosyalar) başa; o isteğe özgü değişken kısım sona. Tek isteği tek dosya ve nokta hata ile sınırla ("checkout.js'teki indirim hesabını düzelt; %20 kupon + kampanya toplamı eksiye düşürüyor; fonksiyon imzasını değiştirme").
- Harness mesajı "Uzun süredir ses çıkmadı" gelirse: tek cümle ne yaptığını yaz, devam et.
- Resmi en iyi uygulamalardan: "Varsayılan olarak önermek yerine değişikliği uygula"; "Açmadığın kod hakkında tahmin yürütme"; kapsamı, yorumu, savunmacı kodu ve soyutlamayı sınırla (aşırı mühendislik); iş sonunda geçici dosyaları sil; uzun belgede veri başa, soru sona, cevabı alıntıyla temellendir. Ayrıntı ve kalıplar: `.claude/skills/defter-istem/SKILL.md`.

## 3. Kaynaklar (takılınca bu sırayla; tarih ve sürüm not edilir)
1. Anthropic: code.claude.com/docs (costs, prompt-caching, model-config, skills, sub-agents, memory), platform.claude.com/docs (pricing, prompt caching, prompting-claude-opus-5-5, release notes), support.claude.com, academy.claude.com.
2. Rakipler: developers.openai.com (prompt-caching), learn.chatgpt.com, ai.google.dev/gemini-api/docs (models, caching), docs.x.ai, api-docs.deepseek.com (kv_cache), qwen.readthedocs.io, research.google. Ustalar: martinfowler.com, samnewman.io, itrevolution.com, schneier.com, catb.org/~esr/faqs, Knuth, Torvalds.
3. Topluluk: stackoverflow.com (claude-code etiketi), GitHub issues.
4. Bulunan çözüm NOT_DEFTERI'ne kaynak ve tarihle yazılır; yeniden araştırılmaz. İkincil yazıdaki iddia resmi belgeyle doğrulanmadan kurala girmez (§1.6).

## 4. Üstat ilkeleri (uygulamadaki karşılıkları)
- **Hiçbir sorun iki kez çözülmez** (E. S. Raymond): kök neden + önlem NOT_DEFTERI'ne; tekrar eden iş betiğe ya da beceriye döner.
- **Sıkıcı ve tekrarlı iş kötüdür → otomatikleştir** (Raymond): kullanıcının elle yaptığı her adım bir hata kaydıdır. DEVIR_TESLIM'de "elle yapılanlar" listesi tutulur; hedef onu sıfırlamak.
- **Bütün programı okuma, modül yapısıyla hedefe in** (Raymond, artımlı hacking döngüsü): grep → aralık. Küçük özellik seç, bul, değiştir, test et, belgele, yayınla, tekrarla.
- **Tasarım kokusunu dinle:** "bu kod çirkin" hissi gelince özellik eklemeyi bırak, yeniden düzenle (daha dar arayüz, veri gizleme). **Yamamak yerine at ve yeniden yaz** (hacker tarzı): karmaşıklaşan kodu emeğe acımadan sil.
- **Önce çalışan basit sistem, sonra evrim** (Gall; Fowler). Refactoring davranışı koruyarak küçük adımlarla.
- **Akış, geri bildirim, sürekli öğrenme** (Gene Kim): küçük partiler, her teslimde test ve ölçüm, retro = NOT_DEFTERI (zorunlu).
- **Erken optimizasyon kötülüğün kaynağıdır; önce ölç** (Knuth): token raporu.
- **Koşum (harness) ucuz modeli güvenilir kılar** (Fowler, "Are Harnesses Worth the Cost?", 13.10.2026: davranış koşumuyla ucuz model öncü modelin güvenilirliğini %33 daha ucuza yakaladı): ajanlar Sonnet'te, kalite sıkı test + denetim betiklerinden gelir; pahalı modele değil koşuma yatırım.
- **Dayanıklılık** (Sam Newman, *Building Resilient Distributed Systems*): geçici hata kısa beklemeyle yeniden denenir, kalıcı hata hemen ve açık mesajla yukarı çıkar (Edge boş ses, VoxCPM sürüm farkı).
- **Lafı bırak, kodu göster** (Torvalds): iddia değil test, ekran, eşitlik çıktısı. Yetkinlik tavırdan önemlidir (Raymond).
- **Yokluk başarı sayılmaz** (5 haftalık otonom şirket denemesi): yedi kalite kapısının yedisi ayar satırı eksik olduğu için hiç çalışmamış, 508 test yeşildi. Kural/kapı gerçekten açık mı canlı ayardan oku; ajanın "çalışıyor" demesi kanıt değildir (`esitlik.py`, `baglam-denetim.py` bu yüzden var).
- **Süreç ürünün önüne geçmesin:** altyapı işi ürünü geçiyorsa dur. Yeni kural eklemeden önce mevcut kural yetiyor mu bak; anayasa 1.119 kelimeden 1.993'e çıktı: şişme olur, düzenli buda.
- **Doküman kodla aynı commit'te:** bulguların ~%45'i kod değişip dokümanın eski kalmasından çıktı.
- **Ürün öncesi gerçek veri, küçük ekran, tek bulgu = tek satır** (her bulgu için ayrı issue açma).
- **Hata olacak, sistem dayanıklı olsun** (kaos mühendisliği): geri düşüş, yeniden deneme, zaman aşımı, net hata mesajı.
- **Güvenlik bir süreçtir** (Schneier): gizli bilgi taraması teslimde, yerel veri yerelde.
- Tasarım: az ama doğru; her öğe bir işe yarar; çift düğme, sahte durum, belirsiz metin yok.
- Kullanıcıya yalnız gerçekten ona ait kararlar gelir: gizli anahtar girişi, geri dönüşsüz işlem, kamuya açık yayın. Gerisini kendin karar ver, kayda yaz.

## 5. Ajan düzeni (`.claude/agents/`)
Rol kartları: `mimar`, `analist`, `tasarimci`, `gelistirici`, `devops`, `otomasyon-testci`, `manuel-testci`, `hata-avcisi`. Uçtan uca sahiplik ana oturumdadır (lider). Kartın ön maddesinde `tools` (rolün araçları), `effort` (geliştirici ve hata avcısı high, mimar Opus medium, diğerleri medium) ve `maxTurns: 25` vardır; `baglam-denetim.py` eksikse uyarır.
**İş rotası** (gereksiz rolü çağırma):
| İş | Roller |
|---|---|
| Küçük hata | hata-avcisi (ya da ana oturum) → otomasyon-testci |
| Özellik | analist → gelistirici + tasarimci (arayüz) → otomasyon-testci → manuel-testci |
| Mimari/kurulum | mimar → devops + gelistirici → otomasyon-testci |
**Brief:** beklenen sonuç, dokunulacak dosyalar, "bitti" tanımı, test komutu. Geçmişin tamamı verilmez. En çok 25 tur, rapor ≤120 kelime. Ajanın "çalışıyor" demesi kanıt değildir; lider testi kendisi çalıştırır.

## 6. Plan A'dan Z'ye
Her önemli öneri: önerilen yol + en az bir alternatif + "olmazsa" planı. Çözüm yoksa kullanıcıya üç seçenek: geçici kapat / kaldır / dış araç.

## 7. Aylık bakım (5 dk) ve limit hızlı bitince
1. `python3 tools/baglam-denetim.py` (FAIL/WARN düzelt) · 2. `python3 tools/token-rapor.py` (en büyük kalem, kırılım, kaçırmalar).
3. Claude Code'da: `/usage` ("Prompt cache" satırı: kaçırma sayısı ve olası neden), `/context`, `/skill-doctor`, `/mcp` (kullanılmayanı kapat).
4. Nedene göre: model değişimi → yeni oturum; 1 saat ara → özetten devam; MCP/eklenti açıp kapama → oturum başında yap; çok görsel → metin; kredi kullanımı → `promptCacheTtl=1h`; bağlam >200k → `/compact` ya da `/clear`.
5. Bulguyu NOT_DEFTERI'ne tek satır yaz.
