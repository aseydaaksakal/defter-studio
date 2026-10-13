"""
Defter Studio — ses eğitimi için veri seti hazırlayıcı (docs/SES_EGITIMI.md).

Girdi: ses/video dosyaları (mp3, mp4, wav, m4a…) ve/veya YouTube bağlantıları (yalnız SAHİBİ olduğunuz ya da izin aldığınız kayıtlar).
Çıktı: <çıkış>/wavs/*.wav (24 kHz, mono, 2–15 sn'lik temiz parçalar) + <çıkış>/metadata.csv  ("dosya|metin" — Kokoro/StyleTTS2/Piper hazırlığında kullanılır).

Kullanım:
    python tools/veri-seti-hazirla.py --cikis veri/hasan  kayit1.mp3 https://youtu.be/XXXX klip.mp4
Gerekenler: ffmpeg; döküm için `pip install faster-whisper`; bağlantılar için `pip install yt-dlp`.
Dökümde "ee", "şey", "yani" gibi dolgu sözcükleri atlanmasın diye Whisper'a bunları içeren bir ipucu cümlesi verilir
(konuşma dilindeki doğallığı öğretmek için bu sözcüklerin metinde de kalması gerekir).
"""
import argparse
import csv
import os
import re
import subprocess
import sys
import tempfile

MIN_S, MAX_S, ARA_S = 2.0, 15.0, 0.6  # parça uzunluğu sınırları ve birleştirme için en çok sessizlik
IPUCU = "Ee, şey, yani… hım, evet. Şimdi, eee, şöyle diyelim: aslında, işte, yani öyle."


def temizle_metin(t: str) -> str:
    return re.sub(r"\s+", " ", t.replace("|", " ")).strip()


def kliplere_bol(segmentler, min_s=MIN_S, max_s=MAX_S, ara_s=ARA_S):
    """[(başla, bitir, metin)] → eğitim parçaları. Yakın cümleler birleştirilir, max_s aşılmaz, min_s'ten kısa parçalar atılır."""
    out, cur = [], None
    for b, e, t in segmentler:
        t = temizle_metin(t)
        if not t:
            continue
        if cur and b - cur[1] <= ara_s and e - cur[0] <= max_s:
            cur = (cur[0], e, cur[2] + " " + t)
        else:
            if cur:
                out.append(cur)
            cur = (b, e, t)
    if cur:
        out.append(cur)
    return [(b, e, t) for b, e, t in out if min_s <= e - b <= max_s]


def sesi_cevir(girdi: str, hedef: str):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", girdi, "-vn", "-ac", "1", "-ar", "24000", "-af", "loudnorm=I=-20:TP=-2", hedef], check=True)


def parca_kes(kaynak: str, b: float, e: float, hedef: str):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{b:.2f}", "-to", f"{e:.2f}", "-i", kaynak, "-c", "copy", hedef], check=True)


def indir(url: str, klasor: str) -> str:
    sablon = os.path.join(klasor, "%(id)s.%(ext)s")
    subprocess.run([sys.executable, "-m", "yt_dlp", "-x", "--audio-format", "wav", "-o", sablon, url], check=True)
    return max((os.path.join(klasor, f) for f in os.listdir(klasor)), key=os.path.getmtime)


def dokum(wav: str, model="large-v3", dil="tr"):
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device="cuda", compute_type="float16")
    seg, _ = m.transcribe(wav, language=dil, initial_prompt=IPUCU, vad_filter=True, condition_on_previous_text=False)
    return [(s.start, s.end, s.text) for s in seg]


def hazirla(girdiler, cikis, dokum_fn=dokum, indir_fn=indir):
    wavs = os.path.join(cikis, "wavs")
    os.makedirs(wavs, exist_ok=True)
    satirlar, n = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        for g in girdiler:
            kaynak = indir_fn(g, tmp) if re.match(r"https?://", g) else g
            temiz = os.path.join(tmp, f"k{n}.wav")
            sesi_cevir(kaynak, temiz)
            for b, e, t in kliplere_bol(dokum_fn(temiz)):
                n += 1
                ad = f"{n:05d}.wav"
                parca_kes(temiz, b, e, os.path.join(wavs, ad))
                satirlar.append((ad, t))
    with open(os.path.join(cikis, "metadata.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="|", lineterminator="\n")
        w.writerows(satirlar)
    return satirlar


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("girdiler", nargs="+")
    ap.add_argument("--cikis", required=True)
    a = ap.parse_args()
    r = hazirla(a.girdiler, a.cikis)
    toplam = len(r)
    print(f"{toplam} parça hazır → {a.cikis}/wavs ve metadata.csv (hedef: tek ses için en az ~30 dk, iyi sonuç için 2–10 saat temiz kayıt)")
