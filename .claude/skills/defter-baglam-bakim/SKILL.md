---
name: defter-baglam-bakim
description: Defter Studio'da token ve limit bakımı. "limit hızlı bitiyor", "token harcaması", "bağlam şişti", "CLAUDE.md uzadı", "önbellek kaçırıyor", "aylık bakım" denince çalıştır: bağlam denetimi, token raporu, kaçırma nedenleri, düzeltme.
---

# Bağlam bakımı (ayda bir 5 dk, ya da limit hızlı bitince)

1. `python3 tools/baglam-denetim.py`: FAIL ve WARN'ları düzelt (CLAUDE.md ≤600 kelime, ajan `model:`, beceri açıklaması, `.claude/settings.json`).
2. `python3 tools/token-rapor.py`: en büyük kalemi, "Model ve effort kırılımı"nı ve "Önbellek kaçırmaları"nı oku.
3. Kullanıcıdan yalnız gerekirse iste: `/usage` çıktısındaki "Prompt cache" satırı (kaçırma sayısı + olası neden), `/context`, `/skill-doctor`.
4. Nedene göre çöz (ayrıntı: docs/EL_KITABI.md §1.3, §1.4, §7):
   - model değişimi → yeni oturum, aynı oturumda model değiştirme
   - 1 saatten uzun ara → "özetten devam et" ya da yeni oturum; kredi kullanılıyorsa `promptCacheTtl: "1h"`
   - MCP/eklenti açıp kapama → yalnız oturum başında
   - çok görsel → metni yapıştır
   - bağlam >200k → `/compact` (iş arasında) ya da `/clear`
5. Bulguyu NOT_DEFTERI'ne tek satır yaz. CLAUDE.md'ye kural eklemeden önce mevcutlarla karşılaştır; ayrıntı el kitabına.
