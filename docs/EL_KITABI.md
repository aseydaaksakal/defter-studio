# El kitabı — çalışma biçimi

CLAUDE.md'nin ayrıntısı. Baştan sona okunmaz: yalnız gereken bölüm. Son gözden geçirme: 2026-10-14.

## 1. Token mimarisi (ölçüme dayalı)
**Ölçüm:** `python3 tools/token-rapor.py` (konsol) · teslimde `--yaz` → https://aseydaaksakal.github.io/defter-studio/docs/token/
Kaynak, Claude Code oturum kaydındaki her model çağrısının gerçek token sayısıdır (girdi, önbellek okuma/yazma, düşünme, yazma) ve Claude Code'un model fiyatıdır.

**İlk ölçüm (oturum b9825f52, 14.10.2026, 10 istek, 88 çağrı, ≈ $15 liste karşılığı):**
| Kalem | Pay | Anlamı |
|---|---|---|
| Bağlama yeni ekleme (önbellek yazma) | %47 | Yeni içerik + önbelleğin baştan yazılması (model değişimi, 1 saatten uzun ara) |
| Bağlamı yeniden okuma (önbellek okuma) | %41 | Her araç çağrısı tüm konuşmayı yeniden okutur |
| Yazma | %7 | Metin + araç komutları |
| Düşünme | %5 | |
Bağlam 158k → 513k tokena büyüdü. Model değişimi ve uzun aralar iki kez 640k tokenı baştan yazdırdı. Aynı token Opus'ta Sonnet'in ~2,8 katı. İki alt ajan $2,84; her biri ~65k tokenla başladı.

**Sonuç:** limiti düşünme ya da yazma değil, uzayan konuşmanın her çağrıda yeniden okunması ve önbelleğin baştan yazılması bitiriyor.

**Kurallar:**
- Bir iş (özellik/hata turu) bitince yeni oturum. Kullanıcı yalnız "devam" yazar; DEVIR_TESLIM yeter.
- Aynı oturumda model ya da effort değiştirme; 1 saatten uzun aradan sonra yeni oturum aç.
- Dosyayı aralıkla oku, komut çıktısını `head`/`grep` ile kırp, bağımsız çağrıları tek turda yap. Her ek çağrı, o anki bağlamın tamamını okutur.
- Büyük görselleri (14 ekran görüntüsü ≈ 30-40k token) yalnız gerekiyorsa ekle; metin hatası için metni yapıştırmak daha ucuz.
- Ajan yalnız bağımsız ve büyük işe açılır. 1000 ajan × 65k başlangıç = 65M token; küçük işi ana oturum yapar.
- CLAUDE.md ≤600 kelime; iş akışları beceriye (`.claude/skills/`), ayrıntı buraya.
- Ayda bir: `/context`, `/usage` (Claude Code), CLAUDE.md kelime sayısı, token raporundaki en pahalı kalem.

**Code mu, chat mi?** Chat tek turdur: soru-cevap, metin düzeltme ve fikir için ucuzdur. Code her araç çağrısında tüm bağlamı yeniden gönderir; bir hata ayıklama oturumu günlerce sohbet kadar harcayabilir (Anthropic, *Manage costs effectively*). Repo, test ve yayın işi Code'da; danışma ve yazı chat'te yapılır.

## 2. Effort ve model
- Opus 5.5 her zaman düşünür; "adım adım düşün" gibi ifadeler gereksizdir. Az düşünme isteniyorsa effort düşürülür.
- Varsayılan **medium**. Aynı istek 2 denemede çözülmediyse (3. revizyon) bir üst seviye önerilir: medium → high → xhigh → max. Kullanıcı "tamam" deyince ya da yeni bir iş gelince medium önerilir.
- Sıfırdan mimari ya da proje: başta **high** önerilir. xhigh/max yalnız ölçülmüş kalite farkı varsa.
- Effort'u yalnız kullanıcı model menüsünden değiştirir; Claude öneriyi tek satırla yapar. Değişiklik önbelleği sıfırlar: yeni oturumda değiştirmek ucuzdur.
- Model: rutin kodlama, test ve teslim Sonnet; mimari ve zor hata Opus; basit ajan işi Haiku (resmi öneri, *Manage costs effectively*). Sonnet/Haiku 5.5'in Opus 5.5 medium ile birebir karşılaştırmasını resmi kaynakta görmeden "eşit" deme.
- İstem yazımı: tüm işi tek mesajda ver, "bitti"nin tanımını yaz, ne zaman durulacağını belirt, yapılacaklar listesi tut. "Sadece yıkıcı işlemde ya da bana gerçekten ihtiyaç olunca dur."

## 3. Kaynaklar (takılınca bu sırayla; tarih ve sürüm not edilir)
1. Anthropic: code.claude.com/docs (özellikle /costs, /sub-agents, /skills, /memory), platform.claude.com/docs (prompt engineering, prompt caching, release notes, computer use), support.claude.com, academy.claude.com.
2. Rakipler (aynı sorunu nasıl çözmüşler): developers.openai.com, ai.google.dev/gemini-api/docs, docs.x.ai, api-docs.deepseek.com, qwen.readthedocs.io, research.google.
3. Topluluk: stackoverflow.com (claude-code etiketi), GitHub issues.
4. Bulunan çözüm NOT_DEFTERI'ne kaynak ve tarihle yazılır; yeniden araştırılmaz.

## 4. Üstat ilkeleri (uygulamadaki karşılıkları)
- **Hiçbir sorun iki kez çözülmez** (E. S. Raymond): kök neden + önlem NOT_DEFTERI'ne; tekrar eden iş betiğe ya da beceriye dönüşür.
- **Sıkıcı ve tekrarlı iş kötüdür → otomatikleştir** (Raymond): kullanıcının elle yaptığı her adım bir hata kaydıdır (kur.bat, otomatik güncelleme, otomatik başlatma).
- **Bütün programı okuma, modül yapısıyla hedefe in** (Raymond, artımlı hacking döngüsü): grep → ilgili aralık.
- **Önce çalışan basit sistem, sonra evrim** (Gall; Fowler, evrimsel mimari); **refactoring** davranışı koruyarak küçük adımlarla (Fowler).
- **Akış, geri bildirim, sürekli öğrenme** (Gene Kim, *The Three Ways*): küçük partiler, her teslimde test ve ölçüm, retro = NOT_DEFTERI.
- **Erken optimizasyon kötülüğün kaynağıdır; önce ölç** (Knuth): token raporu.
- **Lafı bırak, kodu göster** (Torvalds): iddia değil test, ekran ve eşitlik çıktısı.
- **Hata olacak, sistem dayanıklı olsun** (kaos mühendisliği, Netflix): geri düşüş, yeniden deneme, zaman aşımı, net hata mesajı.
- **Güvenlik bir süreçtir** (Schneier): gizli bilgi taraması teslimde, yerel veri yerelde.
- Tasarım: az ama doğru; her öğe bir işe yarar; çift düğme, sahte durum, belirsiz metin yok.

## 5. Ajan düzeni (`.claude/agents/`)
Rol kartları: `mimar`, `analist`, `tasarimci`, `gelistirici`, `devops`, `otomasyon-testci`, `manuel-testci`, `hata-avcisi`. Uçtan uca sahiplik ana oturumdadır (lider).
**İş rotası** (gereksiz rolü çağırma):
| İş | Roller |
|---|---|
| Küçük hata | hata-avcisi (ya da ana oturum) → otomasyon-testci |
| Özellik | analist → gelistirici + tasarimci (arayüz) → otomasyon-testci → manuel-testci |
| Mimari/kurulum | mimar → devops + gelistirici → otomasyon-testci |
**Brief:** beklenen sonuç, dokunulacak dosyalar, "bitti" tanımı, test komutu. Geçmişin tamamı verilmez. Ajanın "çalışıyor" demesi kanıt değildir; lider testi kendisi çalıştırır.

## 6. Plan A'dan Z'ye
Her önemli öneri: önerilen yol + en az bir alternatif + "olmazsa" planı. Çözüm yoksa kullanıcıya üç seçenek: geçici kapat / kaldır / dış araç.
