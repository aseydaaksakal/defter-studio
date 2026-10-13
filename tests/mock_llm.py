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
                            "table": {"columns": ["Saha", "Menzil"], "rows": [["A1", "30"]]}, "visual": f"mock visual {i}", "notes": f"{t} hakkında konuşmacı notu.", "refs": [1]} for i, t, _ in rows]}
    if "slaytlık bir sunu hazırla" in low or "slayt daha yaz" in low:
        need = want(txt, 6)
        return {"title": "Mock Sunu", "subtitle": "alt", "slides": [{"layout": "title" if i == 0 else "bullets", "title": f"Slayt {i + 1}", "bullets": ["bir", "iki"], "visual": f"mock visual {i}", "notes": f"Not {i + 1}", "refs": [1]} for i in range(need)]}
    R = {
        "bölümlük akış çıkar": {"title": "Test Bölümü", "segments": [{"topic": "Giriş", "points": ["a"]}, {"topic": "Sahalar", "points": ["b"]}]},
        "replik. Her replikte": {"lines": [{"speaker": "A", "text": "Merhaba, bugün GMDSS konuşuyoruz.", "tone": "neşeli"}, {"speaker": "B", "text": "Harika, başlayalım. A1 sahası VHF ile kapsanır.", "tone": "meraklı"}, {"speaker": "A", "text": "Doğru, menzil yaklaşık yirmi ile otuz deniz milidir."}]},
        "sahnelik bir": {"title": "Mock Video", "scenes": [{"title": "Sahne 1", "icon": "🚢", "visual": "mock scene one", "bullets": ["a"], "narration": "Birinci sahne. İkinci cümle."}, {"title": "Sahne 2", "icon": "📡", "visual": "mock scene two", "bullets": ["b"], "narration": "Üçüncü cümle burada."}]},
        "zihin haritasını": {"title": "Mock Harita", "root": {"label": "Kök", "children": [{"label": "Dal", "children": [{"label": "Yaprak"}]}]}},
        "Bir infografik içeriği hazırla": {"title": "Mock İnfo", "subtitle": "s", "heroVisual": "mock hero", "highlights": [{"icon": "📡", "visual": "mock box", "heading": "H", "text": "T"}], "stats": [{"value": "1", "label": "l"}], "timeline": [], "compare": {"columns": [], "rows": []}, "takeaway": "ana"},
        "veri tablosu": {"title": "Mock Tablo", "columns": ["A", "B"], "rows": [{"cells": ["1", "2"], "ref": 1}], "notes": "n"},
        "hafıza sarayı yürüyüşüne": {"title": "Mock Hafıza", "items": [{"cue": "Soru?", "fact": "Cevap bir", "mnemonic": "kod", "image": "sahne", "emoji": "🧠"}], "palace": {"place": "Ev", "stops": [{"loc": "Kapı", "item": 0, "scene": "Kapıda dev bir cevap"}]}, "story": "Hikaye", "tips": ["ipucu"]},
        "kendi cümleleriyle anlatması": {"title": "Mock Öğret", "topics": [{"name": "Konu 1", "question": "Anlatır mısın?", "keyPoints": ["a", "b"]}]},
        "okuma metni yaz": {"title": "Mock Okuma", "text": "Bir iki üç dört beş altı yedi sekiz dokuz on.", "questions": [{"q": "Kaç?", "options": ["1", "2", "3", "4"], "answer": 0}]},
        "ÖĞRETMENİN ANLATIMI": {"score": 85, "covered": ["a"], "missing": ["b"], "mistakes": [], "question": "Peki neden?", "praise": "Güzel"},
        "merak uyandıran": {"summary": "Mock özet.", "questions": ["S1?", "S2?", "S3?"]},
    }
    for k, v in R.items():
        if k in low:
            if k == "replik. Her replikte":  # istemdeki konuşmacı kimliklerini (A, B, C…) sırayla kullan
                ids = re.search(r"kimliğini \(([A-F](?:, [A-F])*)\)", txt)
                ids = ids.group(1).split(", ") if ids else ["A", "B"]
                return {"lines": [{"speaker": ids[i % len(ids)], "text": f"{i + 1}. replik: GMDSS konuşması devam ediyor, A1 sahası VHF ile kapsanır.", "tone": "meraklı"} for i in range(max(3, len(ids) * 2))]}
            return v
    if "SORU:" in low:
        return "GMDSS deniz güvenliği için küresel bir haberleşme sistemidir [1]. Sistem bin dokuz yüz doksan dokuzda tam yürürlüğe girmiştir [2]. Bu bilgi uydurma bir kaynağa dayanır [99].\n\nİsterseniz deniz sahalarını karşılaştıralım."
    return "# Mock Rapor\n\nGMDSS 1999'da tam yürürlüğe girdi [1].\n\n## Bölüm\nMetin [2]."


def mock_png(prompt, w, h):
    """İsteme göre renklenen küçük geçerli PNG (görsel üretimi testleri için)."""
    import struct
    import zlib
    w, h = max(8, min(int(w), 256)) // 4 * 4, max(8, min(int(h), 256)) // 4 * 4
    c = zlib.crc32(prompt.encode())
    r, g, b = (c & 255) | 64, ((c >> 8) & 255) | 64, ((c >> 16) & 255) | 64
    rows = b"".join(b"\x00" + bytes([r, g, b]) * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def tone_wav(text, gender):
    sr, dur = 16000, max(0.4, min(6.0, len(text) / 22))
    f = 210 if gender == "f" else 120
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(6000 * math.sin(2 * math.pi * f * i / sr))) for i in range(int(sr * dur))))
    return buf.getvalue()


# ---- Sahte lokal sunucunun durumu (ses kütüphanesi, model yöneticisi, /tts kaydı)
CAT = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", "model_katalog.json"), encoding="utf-8"))["modeller"]
PRESETS = [("kadin-genc", "Kadın · genç · canlı", "f"), ("kadin-orta", "Kadın · orta yaş · sakin", "f"), ("kadin-derin", "Kadın · derin sesli", "f"), ("kadin-olgun", "Kadın · olgun · öğretmen", "f"),
           ("erkek-genc", "Erkek · genç · enerjik", "m"), ("erkek-orta", "Erkek · orta yaş · net", "m"), ("erkek-derin", "Erkek · derin sesli · belgesel", "m"), ("erkek-olgun", "Erkek · olgun · hoca", "m")]
ST = {"voices": {}, "jobs": {}, "ready": set(), "puan": {}, "log": [], "imglog": [], "fail_after": None, "calls": 0}


def models_list():
    out = []
    for i, m in enumerate(CAT):
        j = ST["jobs"].get(m["id"])
        if j and j["state"] == "iniyor":  # her sorguda ilerlesin
            j["received"] = min(j["total"], j["received"] + j["total"] // 2)
            if j["received"] >= j["total"]:
                j["state"] = "bitti"; ST["ready"].add(m["id"])
        total = (3 + i % 5) * 10 ** 9
        out.append({**m, "hazir": m["id"] in ST["ready"], "diskte": total if m["id"] in ST["ready"] else 0, "uzak": total, "puan": ST["puan"].get(m["id"]),
                    "is": ({"state": j["state"], "received": j["received"], "total": j["total"], "msg": ""} if j else None),
                    "calistirilabilir": bool(m.get("adaptor")), "calistirNot": "",
                    "sesler": [{"id": f"v2/tr_speaker_{k}", "ad": f"Türkçe konuşmacı {k}"} for k in range(10)] if m.get("adaptor") == "bark" else []})
    return out


def voices_list():
    return [{"name": n, "gender": v["gender"], "label": v["label"], "source": v["source"], "engine": v.get("engine"), "instruct": v.get("instruct"), "builtin": bool(v.get("builtin")), "text": v.get("text"), "hasText": bool(v.get("text")), "textState": "var" if v.get("text") else "otomatik", "seconds": 8.0}
            for n, v in ST["voices"].items()]


def form_field(raw, name):
    m = re.search(rb'name="' + name.encode() + rb'"\r\n\r\n(.*?)\r\n--', raw, re.S)
    return m.group(1).decode("utf-8", "replace") if m else ""


def form_file(raw):
    """Çok parçalı gövdedeki ilk dosya parçasının ham baytları."""
    m = re.search(rb'filename="[^"]*"\r\nContent-Type: [^\r]*\r\n\r\n(.*?)\r\n--', raw, re.S)
    return m.group(1) if m else b""


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "*"); self.send_header("Access-Control-Allow-Private-Network", "true")

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code); self.cors(); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def raw(self):
        return self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0)

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

    def do_GET(self):
        p = self.path.split("?")[0]
        if p.startswith("/health"):
            return self.send(200, {"ok": True, "version": "mock", "ffmpeg": True, "tts": {"engines": ["mock"], "auto": ["mock"], "plan": {"f": "mock", "m": "mock"}, "female": True, "clone": True, "design": ["mock"], "voices": len(ST["voices"]), "models": [], "pocketTr": bool(ST.get("pocketTr"))}, "image": {"ok": True, "model": "mock", "tur": "ckpt"}, "stt": None, "update": {"available": not ST.get("upd_applied"), "latest": "9.9.9", "n": 2}})
        if p.startswith("/update/check"):
            av = not ST.get("upd_applied")
            return self.send(200, {"current": "mock", "latest": "9.9.9", "available": av, "n": 2 if av else 0, "files": ["server/main.py", "server/guncelle.py"], "pip": False, "kabuk": [], "error": None, "launcher": True})
        if p.startswith("/tts/selftest"):
            return self.send(200, {"info": {"vramFreeGb": 3.1, "vramTotalGb": 24.0, "ollamaLoaded": ["qwen3.8:27b"], "edge": "7.2.8", "torch": "2.9.1+cu128", "cuda": True, "gpu": "NVIDIA GeForce RTX 5090 Laptop GPU", "capability": "sm_120"},
                                   "results": [{"engine": "edge", "ok": True, "seconds": 1.2, "f": {"ok": True}, "m": {"ok": True}},
                                               {"engine": "omnivoice", "ok": False, "seconds": 0.4, "error": "RuntimeError: CUDA out of memory", "hint": "VRAM yetmedi: Ollama modeli GPU belleğini tutuyor."}]})
        if p == "/_video":
            return self.send(200, ST.get("video", {}))
        if p == "/kur/durum":
            return self.send(200, {"state": "done" if ST.get("pocketTr") else "idle", "msg": "Pocket TR hazır" if ST.get("pocketTr") else ""})
        if p == "/voices/presets":
            have = list(ST["voices"])
            return self.send(200, {"presets": [{"id": i, "label": l, "gender": g, "created": any(h == i or h.startswith(i + "-") for h in have)} for i, l, g in PRESETS], "motors": ["mock"]})
        m = re.match(r"^/voices/([^/]+)/audio$", p)
        if m:
            v = ST["voices"].get(m.group(1))
            return self.send(200, tone_wav("deneme sesi", v["gender"]), "audio/wav") if v else self.send(404, {"detail": "yok"})
        if p == "/voices":
            return self.send(200, {"voices": voices_list()})
        if p == "/models":
            return self.send(200, {"models": models_list(), "hf": True, "onbellek": "/mock/hf"})
        if p == "/_imglog":
            return self.send(200, {"log": ST["imglog"]})
        if p == "/_log":
            return self.send(200, {"log": ST["log"]})
        return self.send(200, {"data": [{"id": "mock"}]})

    def do_PATCH(self):
        body = json.loads(self.raw() or b"{}")
        m = re.match(r"^/voices/([^/]+)$", self.path)
        v = ST["voices"].get(m.group(1)) if m else None
        if not v:
            return self.send(404, {"detail": "yok"})
        for k in ("label", "gender", "text"):
            if k in body:
                v[k] = body[k]
        return self.send(200, {"ok": True})

    def do_DELETE(self):
        m = re.match(r"^/voices/([^/]+)$", self.path)
        if m:
            ST["voices"].pop(m.group(1), None)
        return self.send(200, {"ok": True})

    def do_POST(self):
        raw = self.raw()
        p = self.path
        if p == "/voices":  # çok parçalı form (klon yükleme)
            n = form_field(raw, "name") or "ses"
            ST["voices"][n] = {"gender": form_field(raw, "gender") or "f", "label": form_field(raw, "label") or n, "source": "klon", "text": form_field(raw, "text") or None}
            return self.send(200, {"ok": True, "name": n, "textState": "otomatik"})
        if p == "/update/apply":
            ST["upd_applied"] = True
            return self.send(200, {"yazilan": ["server/main.py", "server/guncelle.py"], "hatalar": [], "py": True, "pip": False, "kabuk": [], "surum": "9.9.9", "restart": "auto"})
        if p == "/video/start":  # sahte hızlı MP4: gelen ses ve kareleri sayar
            ST["video"] = {"frames": 0, "batches": 0, "jpeg_ok": True, "audio": len(form_file(raw)), "fps": form_field(raw, "fps"), "w": form_field(raw, "width"), "h": form_field(raw, "height"), "finished": False}
            return self.send(200, {"id": "mockvid"})
        if p.startswith("/video/frames/"):
            v = ST.setdefault("video", {})
            v["batches"] = v.get("batches", 0) + 1; v["frames"] = v.get("frames", 0) + raw.count(b"\xff\xd8\xff")
            v["jpeg_ok"] = v.get("jpeg_ok", True) and raw[:3] == b"\xff\xd8\xff"
            return self.send(200, {"ok": True})
        if p.startswith("/video/finish/"):
            ST.setdefault("video", {})["finished"] = True
            return self.send(200, b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2mp41" + b"\x00" * 64, "video/mp4")
        body = json.loads(raw or b"{}")
        if p == "/kur/pockettr":
            ST["pocketTr"] = True
            for k in range(1, 4):
                ST["voices"][f"pt-kadin-{k}"] = {"gender": "f", "label": f"Pocket kadın {k}", "source": "hazır", "builtin": True}
                ST["voices"][f"pt-erkek-{k}"] = {"gender": "m", "label": f"Pocket erkek {k}", "source": "hazır", "builtin": True}
            return self.send(200, {"started": True})
        if p == "/voices/design" and not body.get("preset"):  # tek tıkla yeni ses: cinsiyet + tarif
            n = body.get("name") or "yeni"
            ST["voices"][n] = {"gender": body.get("gender", "f"), "label": body.get("label") or n, "source": "tasarım", "engine": "mock", "instruct": body.get("instruct"), "text": "Merhaba."}
            return self.send(200, {"ok": True, "name": n, "motor": "mock"})
        if p == "/voices/design":
            pr = next((x for x in PRESETS if x[0] == body.get("preset")), None)
            if not pr:
                return self.send(400, {"detail": "Hazır tasarım seçin"})
            n, k = pr[0], 2
            while n in ST["voices"]:
                n, k = f"{pr[0]}-{k}", k + 1
            ST["voices"][n] = {"gender": pr[2], "label": pr[1], "source": "tasarım", "engine": "mock", "text": "Merhaba, ben bu defterin sesiyim."}
            return self.send(200, {"ok": True, "name": n, "motor": "mock"})
        if p == "/models/download":
            for i in body.get("ids", []):
                mm = next((x for x in CAT if x["id"] == i), None)
                if mm and i not in ST["ready"]:
                    ST["jobs"][i] = {"state": "iniyor", "received": 0, "total": (3 + CAT.index(mm) % 5) * 10 ** 9}
            return self.send(200, {"started": body.get("ids", [])})
        if p == "/models/rate":
            ST["puan"].pop(body.get("id"), None)
            if body.get("puan"):
                ST["puan"][body["id"]] = body["puan"]
            return self.send(200, {"ok": True})
        if p == "/models/delete":
            ST["ready"].discard(body.get("id")); ST["jobs"].pop(body.get("id"), None)
            return self.send(200, {"ok": True, "serbest": 3 * 10 ** 9})
        if p == "/_reset":  # testler arası yalıtım
            ST.update(voices={}, jobs={}, ready=set(), puan={}, pocketTr=False, upd_applied=False); ST["log"].clear(); ST["imglog"].clear()
            return self.send(200, {"ok": True})
        if p == "/_log/clear":
            ST["log"].clear(); ST["imglog"].clear(); ST["calls"] = 0
            return self.send(200, {"ok": True})
        if p.startswith("/_tts_fail"):  # ?after=N: N başarılı satırdan sonra /tts 500 verir (motor çökmesi); after yoksa kapanır
            m = re.search(r"after=(\d+)", p)
            ST["fail_after"] = int(m.group(1)) if m else None; ST["calls"] = 0
            return self.send(200, {"ok": True})
        if p == "/image":
            ST["imglog"].append({"prompt": body.get("prompt"), "w": body.get("width"), "h": body.get("height")})
            return self.send(200, mock_png(body.get("prompt", ""), body.get("width", 64), body.get("height", 36)), "image/png")
        if p.startswith("/tts"):
            ST["log"].append({k: body.get(k) for k in ("speaker", "gender", "voice", "model", "engine")})
            ST["calls"] += 1
            if ST["fail_after"] is not None and ST["calls"] > ST["fail_after"]:
                return self.send(500, {"detail": "mock motor çöktü"})
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
