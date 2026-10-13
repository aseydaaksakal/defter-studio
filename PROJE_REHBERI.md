# Proje rehberi: hangi iş hangi dosyada?

Bu rehberi baştan sona okumayın; yapacağınız işin bölümünü okuyun. Satır numaraları 0.3.0 içindir ve değişebilir;
`grep -n "fonksiyon adı"` ile doğrulayın.

## 1. Uygulama kabuğu ve gezinme — `js/app.js` (815 satır)

| İş | Fonksiyon (yaklaşık satır) |
|---|---|
| Açılış, tema, yarım işler | `boot` (42) |
| Adres yönlendirme (`#/`, `#/bugun`, `#/klavye`, `#/bilim`, `#/n/:id`, `#/n/:id/a/:aid`) | `route` (60) |
| Üst çubuk (Pomodoro, puan, model durumu) | `topbar` (76), `updateStatus` (93) |
| Ana sayfa, yedekle, sil, içe aktar | `renderHome` (103) |
| Bugün paneli, hata defteri | `todayPage` (141), `reviewMistakes` (175) |
| Defter düzeni | `renderNotebook` (190) |
| Kaynak listesi, OCR, kaynak ekleme penceresi | `renderSources` (212), `startOcr` (236), `openAddSource` (261) |
| Sohbet, özet, mesaj ve "kaynaklı" rozeti | `renderChat` (333), `msgEl` (406) |
| Model bağlantı kontrolü ve yardım penceresi | `checkLLM` (420), `probeOllama` (438), `connectionModal` (442) |
| Studio paneli, içerik satırı, ⋮ menüsü | `renderStudio` (500), `artRow` (516), `artMenu` (536) |
| Araç seçenek penceresi (`cards/seg/select/lang/count/text`) | `openCustomize` (554) |
| İş kuyruğu, üretim, iptal, yeniden üretim | `runJob` (611), `doJob` (616), `cancelJob`, `regenerate` |
| Görüntüleyici ve API'si (`save`, `ask`, `editJSON`, `regenerate`) | `openViewer` (658), `viewerApi` (688) |
| Sürüm geçmişi, JSON düzenleme | `openVersions` (732), `editJSON` (747) |
| Ayarlar penceresi (model, ses, sunucu, veri) | `openSettings` (756); ses bölümü `js/voice-settings.js` |

## 2. Studio araçları — `js/studio/gen.js` (516 satır)

| İş | Yer |
|---|---|
| Ortak kurallar, alıntı kuralı | `BASE_RULES`, `EVIDENCE_RULE` |
| Sınav türleri (TYT, KPSS, GOC, COLREG…) | `EXAMS` |
| Podcast kadrosu (kadın/erkek, roller) | `castFor` |
| Soru tanımı (Test ve banka ortak) | `questionSpec`, `makeQuestions`, `shuffleOpts` |
| Araçlar | `TOOLS.podcast`, `slides`, `video`, `mindmap`, `report`, `flashcards`, `quiz`, `memory`, `teach`, `listen`, `speedread`, `infographic`, `table` |
| Sohbet cevabı ve kaynak bağlılığı | `answer`, `grounding` |
| Önerilen sorular | `suggestQuestions` |

Toplu üretim (tam sayı) `js/studio/batch.js` içinde yapılır:
- `oneBatch`: tek dilimden tek parti üretir.
- `generateExact`: kaynağı kapsayan dilim sırası, tekrar eleme ve parça numarası birleştirme.

## 3. Görüntüleyiciler — `js/studio/views/*.js`
Her dosya `render(root, art, api)` ve `toText(art)` dışa aktarır.

| Dosya | Notlar |
|---|---|
| `podcast.js` | Akışlı çalma (`onPiece`), tek parça WAV'a geçiş, kadın sesi kartı (`femaleVoiceCard`), döküm düzenleme |
| `video.js` | Canvas sahneleri (`drawScene`), tek anlatım dosyası, sahne zamanlaması, MP4/WebM kayıt |
| `slides.js` | Düzenler: `title/bullets/two-col/stat/quote/timeline/process/chart/table`, anlatımlı oynat, PDF/HTML |
| `quiz.js` | Alıştırma/deneme, alıntı gösterimi, bankaya cevap kaydı (`recordAnswer`) |
| `flashcards.js` | Leitner, alıntı, Anki CSV |
| `listen.js` | Dikte (`diffWords`), gölgeleme (kayıt), dinleme banyosu |
| `memory.js`, `teach.js`, `speedread.js`, `mindmap.js`, `report.js`, `infographic.js`, `table.js` | Diğer araçlar |

## 4. Kaynaklar, arama, doğrulama

| İş | Yer |
|---|---|
| PDF (sayfa işaretli), DOCX, HTML, URL, YouTube, ses dökümü | `js/sources.js`: `pdfToText`, `docxToText`, `urlToText`, `transcribe` |
| Parçalama, embedding, kaynak ekleme | `splitChunks`, `chunkText`, `addSource`, `replaceSourceText` |
| Arama ve bağlam | `tokenize`, `search` (BM25 + kosinüs), `buildContext`, `sliceContexts` |
| Taranmış PDF | `js/ocr.js` (Tesseract, kaldığı yerden devam) |
| Halüsinasyon denetimi | `js/verify.js`: `findQuote`, `supports`, `verifyItem`, `summarize` |

## 5. Ses — `js/tts.js` (~650 satır)

| İş | Yer |
|---|---|
| Motorlar, varsayılanlar, sıra | `ENGINES`, `VOICES`, `DEFAULTS`, `availableEngines`, `resolveEngine`, `femaleOK` |
| Ses atama | `voicePool`, `assignVoices` |
| Motor çağrıları | `geminiChunk`, `elevenChunk`, `minimaxLine`, `azureLine`, `googleLine`, `openaiLine`, `fishLine` (+`fishFetch`, `listFishVoices`), `serverLine`, `piperLine` (+`preloadPiper`) |
| Klonlama | `minimaxUpload`, `minimaxClone`, `minimaxDesign`, `recordVoice`, `toWav`, `uploadServerVoice` |
| Üretim ve karıştırma | `synthesize` (önce kayıtlı karışım; `fresh` yeniden üretir), `textKey`, `savedMix`, `hasSavedMix`, `synthWith` (önbellek, eşzamanlılık, `onPiece`), `mixPieces`, `encodeWav` |
| Tarayıcı sesi | `browserVoices`, `speakBrowser` (Türkçe ses yoksa konuşmaz) |
| Türkçe okunuş | `js/textnorm.js`: `normalizeTR` |
| Ayarlar arayüzü | `js/voice-settings.js` |

## 6. Model sağlayıcıları — `js/llm.js`
- `PROVIDERS`: 15 sağlayıcı tanımı.
- `chat`: Ollama, OpenAI uyumlu, Gemini, Anthropic; `temperature` ve `role: 'fast'` destekler.
- Diğerleri: `chatJSON` (onarım), `extractJSON`, `embed`, `listModels`.

## 7. Veri ve öğrenme

| İş | Yer |
|---|---|
| Şema (v1 + v2 `questions`), silme, yedek | `js/db.js` |
| Soru bankası: istatistik, seçim, aralıklı tekrar, arka planda doldurma | `js/bank.js`, arayüz `js/bank-ui.js` |
| Puan, rozet, seviye, hata defteri, bilim sayfası, yöntemler kütüphanesi | `js/learn.js` (`METHODS`, `methodsLibrary`) |
| Pomodoro | `js/pomodoro.js` |
| Çoklu sekme güvenliği (iş sahibi sekme) | `js/tabs.js` (`TAB`, `ownedElsewhere`) |
| 10 parmak klavye | `js/typing.js` |
| Örnek defter | `js/demo.js` |

## 8. Lokal sunucu — `server/main.py`
- Uçlar: `/health`, `/tts` (Chatterbox → XTTS → edge → Piper), `/voices`, `/transcribe`, `/fetch`, `/youtube`, `/search`, `/ollama/*`, `/proxy`.
- Uygulamayı statik olarak sunar.
- Kurulum ve başlatma: `server/baslat.bat|sh`. GPU ile klonlama: `tools/kur-gpu.bat`. Lokal görseller: `tools/kur-comfyui.bat` + `tools/comfyui-baslat.bat`.
- Ortam değişkenleri: `DEFTER_TTS`, `DEFTER_WHISPER`, `DEFTER_DEVICE`, `DEFTER_VOICES`, `OLLAMA_HOST`, `DEFTER_PROXY_HOSTS`, `DEFTER_OPEN`.

### 8b. Ses kütüphanesi ve modeller (0.4.0)
- `server/model_katalog.json` + `server/modeller.py` (indir/puan/sil, CLI) + `server/adaptorler.py` (VoxCPM, Bark, KugelAudio).
- `server/main.py`: `/voices` (label, text, PATCH, audio), `/voices/presets`, `/voices/design`, `/models*`, `/tts` `model` alanı.
- `js/voice-library.js` (kütüphane, tasarım, klon, kadro), `js/model-manager.js` (yönetici), `js/tts.js` (`voicePool('server')`, `serverModel`), `gen.js` `castFor` (2-6 konuşmacı).

### 8c. Yapay zeka görselleri (0.5.0)
- `js/imagegen.js`: sağlayıcılar (`geminiImage`, `minimaxImage`, `serverImage`), `generateImage`/`generateMany`, önbellek (`preload`, `imageSrc`, `dataUrl`, `inlineImages`), `findImage` (yanıt çözücü), `STYLES`.
- `js/studio/illustrate.js`: `plan` (öğe listesi), `illustrate`, `autoIllustrate` (`app.js` `doJob` çağırır), `illustrateOne`.
- `js/image-settings.js`: Ayarlar › Görseller. `server/gorsel.py` + `POST /image`: ComfyUI. Ayrıntı: `docs/GORSEL.md`.
- Görüntüleyiciler: `slides.js` (`.s-bg`, `.s-pic`), `infographic.js` (`.ip-hero`, `.ip-ic img`), `video.js` (`sceneImage` + `drawScene` paneli).
- İçerik alanları: slayt/sahne `visual` + `imgKey`; infografik `heroVisual` + `heroKey`, kutu `visual` + `imgKey`.

### 8d. 0.6.0: ses onarımı, kayıtlı podcast, Video v2
- `server/main.py` (0.6.0): Pocket TTS Türkçe (`POCKETTR_VOICES`, `tts_pockettr`, motor `pockettr`, 6 hazır ses `/voices` başında), Edge 403 onarımı (`_edge_try_upgrade`), `vram_guard` (TTS öncesi Ollama'yı `keep_alive=0` ile boşaltır; `DEFTER_UNLOAD_OLLAMA=0` kapatır) + OOM yeniden deneme + `hint_for`, `GET /tts/selftest[?engines=a,b]` (Ayarlar › "Motorları sına").
- Video: `POST /video/start` (ses+fps+boyut) → `POST /video/frames/{id}` (JPEG'ler) → `POST /video/finish/{id}` (MP4) ; `DELETE /video/{id}`; ffmpeg `imageio-ffmpeg`'ten ya da sistemden (`ffmpeg_exe`).
- `js/studio/views/video.js`: `drawFrame` (geçiş `TRANSITION_SEC`), `wordPlan`/`wordCaption`/`drawCaption` (kelime altyazısı), hızlı MP4 döngüsü (`fastBtn`, 24 fps, 48'lik JPEG grupları).
- `js/piper-worker.js`: ses başına kalıcı oturum; `js/vendor/piper/*`: ORT ve fonemleştirici yerel; `sw.js` `IMMUTABLE` önbellek-öncelikli.
- Ayrıntı: `docs/SES_ALTYAPI.md`.

## 9. Testler ve teslim

| İş | Yer |
|---|---|
| Sahte model + sahte sunucu | `tests/mock_llm.py`. Yeni istem → yeni anahtar ifade. |
| Uçtan uca | `tests/e2e.py` (95 kontrol) + `tests/server_test.py` (56) |
| Teslim | `tools/teslim.sh` |
| Elle test listesi | `docs/TEST_PLANI.md` |
