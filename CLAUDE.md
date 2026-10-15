# CLAUDE.md — Defter Studio giriş kartı

Kullanıcı yeni oturumda yalnız **"devam"** yazar. Sırayla: [DEVIR_TESLIM.md](DEVIR_TESLIM.md) → bu dosya → "Sıradaki iş"e başla.
Ayrıntı gerekince yalnız ilgili bölüm: [docs/EL_KITABI.md](docs/EL_KITABI.md), [PROJE_REHBERI.md](PROJE_REHBERI.md), [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md) (hatalar, grep).
Her turda okunur: **600 kelimeyi geçmesin** (`tools/baglam-denetim.py`). Kural eklemeden önce mevcutlarla karşılaştır.

## Değişmez kurallar
1. **Yerel = Pages.** Pages'teki her şey `kur.bat` kurulumunda birebir. `tools/esitlik.py` EŞİT demeden "bitti" deme.
2. **Kullanıcıya iş yükleme.** Tek giriş `kur.zip` (kur.bat); güncelleme, yeniden başlatma, açılışta başlatma otomatik. Teslimde yalnız kur.zip + token raporu bağlantısı.
3. **Bitti = doğrulandı.** Test + canlı kontrol + eşitlik; ajanın ya da testin "çalışıyor" sözü yetmez, canlı çıktıyı kendin oku. Donanımda denenmediyse "denenmedi" yaz. Her hata NOT_DEFTERI'ne kök neden + önlem. Doküman kodla aynı commit'te.
4. **Token ekonomisi** (`docs/token/`). Harcamanın ~%90'ı konuşmanın her çağrıda yeniden okunması. Kısa yaz; dosyayı grep → aralıkla oku; testler yalnız ✗ + özet yazar (`-v` ayrıntı); bağımsız çağrıları tek turda yap; iş bitince yeni oturum öner. **Model değişimi** ya da 1 saati aşan ara önbelleği baştan yazdırır → yeni oturum (`opusplan` yok). Effort değişimi 5.5'te önbelleği bozmaz. Yanlış yoldaysan `/rewind`.
5. **Effort ve model.** Varsayılan medium. Aynı sorun 2 denemede çözülmediyse bir üst effort öner; çözülünce medium. Sıfırdan mimari: high. Effort'u yalnız kullanıcı değiştirir. Rutin iş Sonnet, mimari/zor hata Opus, basit ajan işi Haiku. Yerel-önce: PC'de AI Fabrika kuruluysa rutin kod işi orada döner (yerel Qwen + ücretsiz havuz), Claude'a yalnız çözülemeyen hata ve mimari gelir; burada "devam" denirse işi sen yap.
6. **Takılınca:** resmi doküman → rakipler → forumlar (el kitabı §3); yoksa tek soru: seçenekler + öneri (geçici kapat / kaldır dahil).
7. **Kalite:** best practice, tek seferde kalıcı çözüm, sade ve simetrik mimari, tek doğruluk kaynağı. İstenmeyen özellik, soyutlama, savunmacı kod ekleme; geçici dosyaları sil.
8. **Güncel bilgi:** tarih saat aracından; ürün/model/fiyat ezberden ya da ikincil yazıdan değil resmi kaynaktan.
9. **Ajanlar:** bağımsız işi `.claude/agents/` rol kartlarına paralel ver (araç, effort, `maxTurns: 25` kartta); sen mimari, entegrasyon, test, teslim. Brief: sonuç + dosyalar + "bitti" tanımı + test komutu. Ajan git çalıştırmaz, `server/manifest.json`'a dokunmaz, rapor ≤120 kelime. Küçük işe ajan açma (~65k tokenla başlar).
10. **Kesintisiz devir:** her teslimde DEVIR_TESLIM (kısa) ve NOT_DEFTERI güncel.
11. **Çalışma biçimi (Opus 5.5):** işi tek seferde bitir; önermek yerine uygula; açmadığın kod hakkında tahmin yürütme. Görev listesi tut, açık madde varken turu kapatma; yalnız geri dönüşsüz iş, kamuya açık yayın ya da gerçek kullanıcı bilgisi gerekince dur. İstem, brief, beceri yazarken `defter-istem` becerisi.
12. **Üstat ilkesi:** aynı sorunu iki kez çözme (kök neden + önlem + betik); elle tekrar eden iş otomatikleşir; karmaşıklaşan kodu yamama, yeniden yaz.

## Proje kuralları
- Türkçe arayüz ve yorumlar. Derleme adımı ve CDN yok; kütüphaneler `js/vendor/`.
- Ayrıntılı kurallar dosyaya göre yüklenir: `.claude/rules/uygulama.md` (js, css, e2e), `.claude/rules/sunucu.md` (server, tools).
- Word üretme. Gizli bilgi (anahtar, belirteç, ses kaydı) hiçbir dosyaya, commit'e, rapora yazılmaz.

## Test ve teslim
Adımlar `defter-teslim` becerisinde; limit/bağlam bakımı `defter-baglam-bakim`. Teslim: `bash tools/teslim.sh "açıklama"`. Süreç öldürme: `fuser -k 8098/tcp 8099/tcp` (`pkill -f` kabuğu öldürür).

## Compact instructions
Koru: DEVIR_TESLIM durumu, açık görevler, son test sayıları, değişen dosyalar, kullanıcının son isteği. At: eski araç çıktıları, okunmuş dosyalar.
