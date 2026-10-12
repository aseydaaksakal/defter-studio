"""
Defter Studio test sunucusu: OpenAI uyumlu sahte model (SSE) + sahte lokal yardımcı sunucu (/health, /tts, /voices).

Sahte model istemdeki KAYNAKLAR bloğunu okur ve istenen SAYIDA öğe üretir; soru ve kartların "evidence" alanı kaynaktan
birebir alıntıdır (doğrulama katmanı gerçekten çalışır). Gerçek model gerekmez, ağ gerekmez.

Çalıştırma:  python tests/mock_llm.py   (http://127.0.0.1:8098)
Uygulamada:  sağlayıcı "Özel OpenAI uyumlu", adres http://localhost:8098/v1, model "mock"; sunucu adresi http://localhost:8098
"""
import io
import json
import math
import os
import re
import struct
import sys
import time
import wave
import http.server

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8098
DELAY = float(os.getenv("MOCK_DELAY", "0"))  # yavaş model benzetimi (sn/yanıt)
CTX = re.compile(r"\[(\d+)\] \(([^)]*)\)\n(.*?)(?=\n\n\[\d+\] \(|\n\nSORU:|\n\nODAK|\n(?:Tam |TAM |Şu |Sunu:|Aşağıdaki|Mevcut|Kaynağın)|\Z)", re.S)


def chunks(txt):
    return [(int(n), t, body.strip()) for n, t, body in CTX.findall(txt)]


def sentences(txt):
    out = []
    for n, _, body in chunks(txt):
        for s in re.findall(r"[^.!?…]+[.!?…]", body.replace("\n", " ")):
            s = s.strip()
            if len(s.split()) >= 6:
                out.append((n, s))
    return out


def want(txt, default):
    m = re.search(r"(?:Tam|TAM OLARAK|Tam olarak)\s+(\d+)", txt) or re.search(r"(\d+)\s+(?:adet|slayt daha|slaytı)", txt)
    return int(m.group(1)) if m else default


def avoid_list(txt):
    m = re.search(r"FARKLI[^:]*:\s*(.*)", txt)
    return m.group(1) if m else ""


def question(n, s, others, k):
    w = s.rstrip(".!?…").split()
    head, tail = " ".join(w[:4]), " ".join(w[4:])
    opts = [tail] + [" ".join(o.rstrip(".!?…").split()[4:]) or "Hiçbiri" for _, o in others[:3]]
    while len(opts) < 4:
        opts.append(f"yanlış seçenek {len(opts)}")
    return {"topic": w[0], "q": f"Kaynağa göre «{head}…» ifadesinin doğru devamı hangisidir? ({k})", "options": opts, "answer": 0,
            "hint": "Kaynaktaki cümleyi hatırlayın.", "explanation": f"Kaynakta aynen geçtiği için: {s}", "evidence": s, "ref": n}


def make(txt):
    # Anahtarlar istemlere özgü ifadelerdir; kaynak metninde geçmeleri beklenmez
    low = txt
    if "çoktan seçmeli soru hazırla" in low:
        ss, avoid, need = sentences(txt), avoid_list(txt), want(txt, 5)
        qs = []
        for i, (n, s) in enumerate(ss):
            q = question(n, s, [x for x in ss if x[1] != s][i % 3:] or ss, i)
            if q["q"].split("(")[0].strip() in avoid:
                continue
            qs.append(q)
            if len(qs) >= need:
                break
        if "BOZUK" in low:
            return "{bozuk json"
        return {"questions": qs}
    if "adet bilgi kartı hazırla" in low:
        ss, need, avoid = sentences(txt), want(txt, 5), avoid_list(txt)
        cards = [{"front": " ".join(s.split()[:5]) + "…?", "back": " ".join(s.split()[5:]), "explain": "kaynakta geçer", "evidence": s, "ref": n} for n, s in ss]
        return {"cards": [c for c in cards if c["front"] not in avoid][:need]}
    if "ana hattını çıkar" in low or "slayt başlığı daha" in low:
        need = want(txt, 10)
        return {"title": "Mock Sunu", "subtitle": "alt başlık", "outline": [{"title": f"Bölüm {i + 1}", "goal": f"{i + 1}. konu"} for i in range(need)]}
    if "slaytı (sunudaki sıra" in low:
        rows = re.findall(r"^(\d+)\. (.+?) — (.*)$", txt, re.M)
        lay = ["bullets", "two-col", "stat", "timeline", "process", "chart", "table"]
        return {"slides": [{"layout": lay[int(i) % len(lay)], "title": t, "bullets": ["bir", "iki"], "left": {"heading": "Sol", "bullets": ["a"]}, "right": {"heading": "Sağ", "bullets": ["b"]},
                            "stat": {"value": "%75", "label": "oran"}, "items": [{"label": "1999", "text": "tam yürürlük"}], "chart": {"labels": ["A1", "A2"], "values": [30, 150], "unit": "mil"},
                            "table": {"columns": ["Saha", "Menzil"], "rows": [["A1", "30"]]}, "notes": f"{t} hakkında konuşmacı notu.", "refs": [1]} for i, t, _ in rows]}
    if "slaytlık bir sunu hazırla" in low or "slayt daha yaz" in low:
        need = want(txt, 6)
        return {"title": "Mock Sunu", "subtitle": "alt", "slides": [{"layout": "title" if i == 0 else "bullets", "title": f"Slayt {i + 1}", "bullets": ["bir", "iki"], "notes": f"Not {i + 1}", "refs": [1]} for i in range(need)]}
    R = {
        "bölümlük akış çıkar": {"title": "Test Bölümü", "segments": [{"topic": "Giriş", "points": ["a"]}, {"topic": "Sahalar", "points": ["b"]}]},
        "replik. Her replikte": {"lines": [{"speaker": "A", "text": "Merhaba, bugün GMDSS konuşuyoruz.", "tone": "neşeli"}, {"speaker": "B", "text": "Harika, başlayalım. A1 sahası VHF ile kapsanır.", "tone": "meraklı"}, {"speaker": "A", "text": "Doğru, menzil yaklaşık yirmi ile otuz deniz milidir."}]},
        "sahnelik bir": {"title": "Mock Video", "scenes": [{"title": "Sahne 1", "icon": "🚢", "bullets": ["a"], "narration": "Birinci sahne. İkinci cümle."}, {"title": "Sahne 2", "icon": "📡", "bullets": ["b"], "narration": "Üçüncü cümle burada."}]},
        "zihin haritasını": {"title": "Mock Harita", "root": {"label": "Kök", "children": [{"label": "Dal", "children": [{"label": "Yaprak"}]}]}},
        "Bir infografik içeriği hazırla": {"title": "Mock İnfo", "subtitle": "s", "highlights": [{"icon": "📡", "heading": "H", "text": "T"}], "stats": [{"value": "1", "label": "l"}], "timeline": [], "compare": {"columns": [], "rows": []}, "takeaway": "ana"},
        "veri tablosu": {"title": "Mock Tablo", "columns": ["A", "B"], "rows": [{"cells": ["1", "2"], "ref": 1}], "notes": "n"},
        "hafıza sarayı yürüyüşüne": {"title": "Mock Hafıza", "items": [{"cue": "Soru?", "fact": "Cevap bir", "mnemonic": "kod", "image": "sahne", "emoji": "🧠"}], "palace": {"place": "Ev", "stops": [{"loc": "Kapı", "item": 0, "scene": "Kapıda dev bir cevap"}]}, "story": "Hikaye", "tips": ["ipucu"]},
        "kendi cümleleriyle anlatması": {"title": "Mock Öğret", "topics": [{"name": "Konu 1", "question": "Anlatır mısın?", "keyPoints": ["a", "b"]}]},
        "okuma metni yaz": {"title": "Mock Okuma", "text": "Bir iki üç dört beş altı yedi sekiz dokuz on.", "questions": [{"q": "Kaç?", "options": ["1", "2", "3", "4"], "answer": 0}]},
        "ÖĞRETMENİN ANLATIMI": {"score": 85, "covered": ["a"], "missing": ["b"], "mistakes": [], "question": "Peki neden?", "praise": "Güzel"},
        "merak uyandıran": {"summary": "Mock özet.", "questions": ["S1?", "S2?", "S3?"]},
    }
    for k, v in R.items():
        if k in low:
            return v
    if "SORU:" in low:
        return "GMDSS deniz güvenliği için küresel bir haberleşme sistemidir [1]. Sistem bin dokuz yüz doksan dokuzda tam yürürlüğe girmiştir [2]. Bu bilgi uydurma bir kaynağa dayanır [99].\n\nİsterseniz deniz sahalarını karşılaştıralım."
    return "# Mock Rapor\n\nGMDSS 1999'da tam yürürlüğe girdi [1].\n\n## Bölüm\nMetin [2]."


def tone_wav(text, gender):
    sr, dur = 16000, max(0.4, min(6.0, len(text) / 22))
    f = 210 if gender == "f" else 120
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(6000 * math.sin(2 * math.pi * f * i / sr))) for i in range(int(sr * dur))))
    return buf.getvalue()


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "*"); self.send_header("Access-Control-Allow-Private-Network", "true")

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code); self.cors(); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            return self.send(200, {"ok": True, "version": "mock", "tts": {"engines": ["mock"], "female": True, "clone": False}, "stt": None})
        if self.path.startswith("/voices"):
            return self.send(200, {"voices": []})
        return self.send(200, {"data": [{"id": "mock"}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if self.path.startswith("/tts"):
            return self.send(200, tone_wav(body.get("text", ""), body.get("gender", "f")), "audio/wav")
        txt = "\n".join(m.get("content", "") for m in body.get("messages", []) if m.get("role") != "assistant")
        if DELAY:
            time.sleep(DELAY)
        r = make(txt)
        out = ("<think>düşünüyorum</think>" + json.dumps(r, ensure_ascii=False)) if isinstance(r, dict) else r
        data = b"".join(("data: " + json.dumps({"choices": [{"delta": {"content": out[i:i + 40]}}]}) + "\n\n").encode() for i in range(0, len(out), 40)) + b"data: [DONE]\n\n"
        self.send(200, data, "text/event-stream")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"sahte model + sunucu: http://127.0.0.1:{PORT}")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
