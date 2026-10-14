"""Token raporu: Claude Code oturum kaydından (JSONL) token harcamasını ölçer, docs/token/ sayfasını üretir.

Kullanım:
    python3 tools/token-rapor.py              # en son oturumu ölçer, konsola özet yazar
    python3 tools/token-rapor.py --yaz        # + docs/token/veri.json ve docs/token/index.html günceller (teslim.sh çağırır)
    python3 tools/token-rapor.py --oturum ID  # belirli oturum

Ölçülen (kayıttaki gerçek sayılar): her model çağrısının girdi, önbellek okuma/yazma, çıktı ve düşünme tokenları; alt ajanlar;
Claude Code'un kendi hesapladığı liste fiyatı karşılığı (cost-state). Tahmini olanlar: araç sonuçlarının token karşılığı
(karakter / 3,5) ve bir okumanın sonraki çağrılarda yeniden okunma yükü. İstem metinleri gizlilik için rapora YAZILMAZ.
Ağırlıklar Anthropic fiyat oranlarıdır (girdi 1, önbellek okuma 0,1, önbellek yazma 5 dk 1,25 / 1 sa 2, çıktı 5);
abonelik limitinin tam formülü yayımlanmamıştır, bu yüzden oranlar "yaklaşık pay" olarak okunmalıdır.
"""
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = os.path.expanduser("~/.claude/projects")
TR = timezone(timedelta(hours=3))  # İstanbul
W = {"girdi": 1.0, "okuma": 0.1, "yazma5": 1.25, "yazma1": 2.0, "cikti": 5.0}
KAR_TOKEN = 3.5


def _ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _saat(dt):
    return dt.astimezone(TR).strftime("%d.%m %H:%M") if dt else "?"


def _kisa_yol(p):
    p = str(p or "")
    p = p.replace(KOK + "/", "").replace("/home/claude/", "")
    p = re.sub(r"^/root/\.claude/uploads/[^/]+/", "ek: ", p)
    p = re.sub(r"^/mnt/user-data/uploads/", "ek: ", p)
    return p[:90]


def _etiket(ad, girdi):
    g = girdi or {}
    if ad in ("Read", "Edit", "Write", "NotebookEdit"):
        return _kisa_yol(g.get("file_path"))
    if ad == "Bash":
        return (g.get("description") or g.get("command") or "")[:80]
    if ad == "Grep":
        return f"{g.get('pattern', '')[:40]} · {_kisa_yol(g.get('path') or '.')}"
    if ad == "Glob":
        return g.get("pattern", "")[:60]
    if ad == "Agent":
        return g.get("description", "")[:60]
    if ad == "WebFetch":
        return g.get("url", "")[:80]
    if ad == "WebSearch":
        return g.get("query", "")[:60]
    if ad == "Skill":
        return g.get("skill", "")
    return ""


def _arac_adi(ad):
    return ad.split("__")[-1] if ad.startswith("mcp__") else ad


def _istem_mi(d):
    if d.get("type") != "user" or d.get("isMeta"):
        return False
    c = (d.get("message") or {}).get("content")
    if isinstance(c, str):
        return not c.lstrip().startswith(("<local-command", "<command-"))
    if isinstance(c, list):
        if any(isinstance(x, dict) and x.get("type") == "tool_result" for x in c):
            return False
        return any(isinstance(x, dict) and x.get("type") == "text" and not x.get("text", "").lstrip().startswith(("<local-command", "<command-")) for x in c)
    return False


def _sonuc_boyu(c):
    """tool_result içeriğinin karakter boyu ve görsel sayısı."""
    if isinstance(c, str):
        return len(c), 0
    n, img = 0, 0
    for x in c or []:
        if isinstance(x, dict):
            if x.get("type") == "text":
                n += len(x.get("text", ""))
            elif x.get("type") == "image":
                img += 1
    return n, img


def _birim(u):
    cc = u.get("cache_creation") or {}
    y1 = cc.get("ephemeral_1h_input_tokens")
    y5 = cc.get("ephemeral_5m_input_tokens")
    yaz = u.get("cache_creation_input_tokens", 0) or 0
    if y1 is None and y5 is None:
        y1, y5 = 0, yaz
    out = u.get("output_tokens", 0) or 0
    dus = ((u.get("output_tokens_details") or {}).get("thinking_tokens")) or 0
    return {
        "girdi": u.get("input_tokens", 0) or 0,
        "okuma": u.get("cache_read_input_tokens", 0) or 0,
        "yazma5": y5 or 0,
        "yazma1": y1 or 0,
        "dusunme": dus,
        "yazi": max(0, out - dus),
    }


def _agirlik(b):
    return (b["girdi"] * W["girdi"] + b["okuma"] * W["okuma"] + b["yazma5"] * W["yazma5"] + b["yazma1"] * W["yazma1"]
            + (b["dusunme"] + b["yazi"]) * W["cikti"])


def _topla(a, b):
    for k, v in b.items():
        a[k] = a.get(k, 0) + v
    return a


def _satirlar(yol):
    with open(yol, encoding="utf-8") as f:
        for line in f:
            try:
                yield json.loads(line)
            except Exception:
                continue


def _cagrilar(yollar):
    """Bir ya da birkaç kayıttan model çağrılarını (mesaj kimliğine göre tekil) ve diğer kayıtları sırayla döndürür."""
    kayit, msj, gorulen = [], {}, set()
    for yol in yollar:
        for d in _satirlar(yol):
            u = d.get("uuid")
            if u and d.get("type") != "assistant":  # klasör değişince geçmiş yeni kayda kopyalanır: aynı kayıt bir kez sayılır
                if u in gorulen:
                    continue
                gorulen.add(u)
            if d.get("type") == "assistant":
                m = d.get("message") or {}
                if not m.get("usage"):
                    continue
                mid = m.get("id") or d.get("uuid")
                if mid not in msj:
                    msj[mid] = {"tur": "cagri", "ts": _ts(d.get("timestamp", "")), "u": m["usage"], "model": d.get("requestedModel") or m.get("model"),
                                "effort": d.get("perTurnEffort") or d.get("effort"), "araclar": [], "yan": bool(d.get("isSidechain"))}
                    kayit.append(msj[mid])
                c = msj[mid]
                c["u"] = m["usage"]  # aynı yanıtın son parçası
                for x in m.get("content") or []:
                    if isinstance(x, dict) and x.get("type") == "tool_use":
                        c["araclar"].append((x.get("id"), x.get("name", "?"), x.get("input") or {}))
            else:
                d["_ts"] = _ts(d.get("timestamp", "") or "")
                kayit.append({"tur": "ham", "d": d, "ts": d["_ts"]})
    kayit.sort(key=lambda r: r["ts"] or datetime.min.replace(tzinfo=timezone.utc))
    return kayit


def olc(sid):
    ana = sorted(glob.glob(os.path.join(PROJ, "*", sid + ".jsonl")))
    alt = sorted(glob.glob(os.path.join(PROJ, "*", sid, "subagents", "*.jsonl")))
    if not ana:
        raise SystemExit(f"Oturum kaydı bulunamadı: {sid}")
    kayit = _cagrilar(ana)

    cagrilar = [r for r in kayit if r["tur"] == "cagri" and not r["yan"]]
    istekler, arac_bilgi, sonuclar = [], {}, []
    cur = None
    cagri_b = []
    kacirma = []
    onceki = None
    cagri_no = 0
    maliyet = {}
    baglam = []
    for r in kayit:
        if r["tur"] == "ham":
            d = r["d"]
            if d.get("type") == "cost-state":
                st = d.get("startTime")
                if st is not None and (d.get("totalCostUSD") or 0) >= maliyet.get(st, (0, None))[0]:
                    maliyet[st] = (d.get("totalCostUSD") or 0, d.get("modelUsage") or {})
            elif d.get("type") == "system" and d.get("subtype") == "compact_boundary":
                for s in sonuclar:
                    s["kapali"] = True
            elif _istem_mi(d):
                cur = {"no": len(istekler) + 1, "bas": r["ts"], "son": r["ts"], "cagri": 0, "b": {}, "w": 0.0, "araclar": Counter(),
                       "model": None, "effort": None, "ajan_w": 0.0, "ajanlar": []}
                istekler.append(cur)
            elif d.get("type") == "user":
                for x in (d.get("message") or {}).get("content") or []:
                    if isinstance(x, dict) and x.get("type") == "tool_result":
                        bilgi = arac_bilgi.get(x.get("tool_use_id"))
                        if not bilgi:
                            continue
                        n, img = _sonuc_boyu(x.get("content"))
                        tok = n / KAR_TOKEN + img * 1600
                        metin = x.get("content") if isinstance(x.get("content"), str) else " ".join(
                            y.get("text", "") for y in x.get("content") or [] if isinstance(y, dict) and y.get("type") == "text")
                        aid = re.search(r"agentId: (a[0-9a-f]+)", metin or "")
                        sonuclar.append({"arac": bilgi[0], "hedef": bilgi[1], "tok": tok, "konum": cagri_no, "istek": bilgi[2], "kapali": False,
                                         "ajan": aid.group(1) if aid else None})
            continue
        if r["yan"]:
            continue
        cagri_no += 1
        b = _birim(r["u"])
        w = _agirlik(b)
        baglam.append({"t": _saat(r["ts"]), "boy": b["girdi"] + b["okuma"] + b["yazma5"] + b["yazma1"]})
        if cur is None:
            cur = {"no": 1, "bas": r["ts"], "son": r["ts"], "cagri": 0, "b": {}, "w": 0.0, "araclar": Counter(), "model": None, "effort": None,
                   "ajan_w": 0.0, "ajanlar": []}
            istekler.append(cur)
        cur["cagri"] += 1
        cur["son"] = r["ts"]
        cur["w"] += w
        cur.setdefault("_wm", []).append((r["model"], w))
        cagri_b.append((r["model"], b))
        yz = b["yazma1"] + b["yazma5"]
        if yz > 60000:  # önbellek kaçırma: bağlamın büyük kısmı yeniden yazıldı
            neden = []
            if onceki and onceki["model"] != r["model"]:
                neden.append(f"model değişti ({(onceki['model'] or '').replace('claude-', '')} → {(r['model'] or '').replace('claude-', '')})")
            if onceki and r["ts"] and onceki["ts"] and (r["ts"] - onceki["ts"]).total_seconds() > 3600:
                neden.append(f"{(r['ts'] - onceki['ts']).total_seconds() / 3600:.0f} saat ara (önbellek ömrü 1 saat)")
            kacirma.append({"saat": _saat(r["ts"]), "istek": cur["no"], "token": yz, "model": r["model"], "neden": ", ".join(neden) or "yeni büyük içerik (dosya/görsel/araç çıktısı)"})
        onceki = r
        _topla(cur["b"], b)
        cur["model"] = r["model"]
        cur["effort"] = r["effort"]
        for tid, ad, gir in r["araclar"]:
            cur["araclar"][_arac_adi(ad)] += 1
            arac_bilgi[tid] = (_arac_adi(ad), _etiket(ad, gir), cur["no"])

    # Model başına kur: Claude Code'un kendi hesapladığı dolar / aynı tokenların ağırlıklı birimi (Opus ile Sonnet fiyat farkı böyle yansır)
    mu = defaultdict(lambda: {"in": 0, "out": 0, "cr": 0, "cw": 0, "usd": 0.0})
    for _usd, mods in maliyet.values():
        for ad, m in mods.items():
            x = mu[ad]
            x["in"] += m.get("inputTokens", 0); x["out"] += m.get("outputTokens", 0); x["cr"] += m.get("cacheReadInputTokens", 0)
            x["cw"] += m.get("cacheCreationInputTokens", 0); x["usd"] += m.get("costUSD", 0)
    kur = {ad: x["usd"] / max(1, x["in"] + 2 * x["cw"] + 0.1 * x["cr"] + 5 * x["out"]) for ad, x in mu.items() if x["usd"]}
    varsayilan_kur = (sum(kur.values()) / len(kur)) if kur else 3e-6

    def usd(model, w):
        return w * kur.get(model, varsayilan_kur)

    # Taşıma yükü: bir araç sonucu sonraki her çağrıda (sıkıştırma olana dek) yeniden okunur
    toplam_cagri = cagri_no
    for s in sonuclar:
        s["tasima"] = 0 if s["kapali"] else max(0, toplam_cagri - s["konum"])
        s["w"] = s["tok"] * (W["yazma1"] + W["okuma"] * s["tasima"])

    # Alt ajanlar
    ajanlar = []
    for yol in alt:
        aid = re.sub(r"^agent-", "", os.path.splitext(os.path.basename(yol))[0])
        ab, aw, an, ilk = {}, 0.0, 0, None
        for r in _cagrilar([yol]):
            if r["tur"] != "cagri":
                continue
            b = _birim(r["u"])
            _topla(ab, b)
            aw += _agirlik(b)
            an += 1
            ilk = ilk or r
        ilk_b = _birim(ilk["u"]) if ilk else None
        bag = next((s for s in sonuclar if s.get("ajan") == aid), None)
        no = bag["istek"] if bag else None
        ad = bag["hedef"] if bag else aid
        ajanlar.append({"id": aid, "ad": ad, "istek": no, "cagri": an, "w": round(aw), "usd": round(usd(ilk["model"] if ilk else None, aw), 2), "b": ab,
                        "model": ilk["model"] if ilk else None,
                        "ilk_baglam": (ilk_b["girdi"] + ilk_b["okuma"] + ilk_b["yazma1"] + ilk_b["yazma5"]) if ilk_b else 0})
        for i in istekler:
            if i["no"] == no:
                i["ajan_w"] += aw
                i["ajan_usd"] = i.get("ajan_usd", 0) + usd(ilk["model"] if ilk else None, aw)
                i["ajanlar"].append(ad)

    tb = {}
    for i in istekler:
        _topla(tb, i["b"])
    ana_w = sum(i["w"] for i in istekler)
    ajan_w = sum(a["w"] for a in ajanlar)
    ilk_baglam = baglam[0]["boy"] if baglam else 0
    oz = {
        "oturum": sid,
        "baslangic": _saat(istekler[0]["bas"]) if istekler else "?",
        "bitis": _saat(cagrilar[-1]["ts"]) if cagrilar else "?",
        "olculdu": datetime.now(TR).strftime("%d.%m.%Y %H:%M"),
        "modeller": dict(Counter(f"{c['model']} · {c['effort'] or '?'}" for c in cagrilar)),
        "cagri": len(cagrilar),
        "istek": len(istekler),
        "ana_w": round(ana_w),
        "ajan_w": round(ajan_w),
        "toplam_b": tb,
        "kategoriler": _kategoriler(cagri_b, usd),
        "usd": round(sum(v[0] for v in maliyet.values()), 2),
        "ana_usd": round(sum(usd(m, w) for i in istekler for m, w in i.get("_wm", [])), 2),
        "ajan_usd": round(sum(a["usd"] for a in ajanlar), 2),
        "kur": {k: round(v * 1e6, 3) for k, v in kur.items()},
        "sabit_yuk": ilk_baglam,
        "son_baglam": baglam[-1]["boy"] if baglam else 0,
        "baglam": baglam,
        "istekler": [{"no": i["no"], "saat": _saat(i["bas"]), "sure_dk": round(((i["son"] - i["bas"]).total_seconds() if i["son"] and i["bas"] else 0) / 60),
                      "cagri": i["cagri"], "w": round(i["w"]), "ajan_w": round(i["ajan_w"]), "ajanlar": i["ajanlar"],
                      "usd": round(sum(usd(m, w) for m, w in i.get("_wm", [])), 2), "ajan_usd": round(i.get("ajan_usd", 0), 2),
                      "dusunme": i["b"].get("dusunme", 0), "yazi": i["b"].get("yazi", 0), "okuma": i["b"].get("okuma", 0),
                      "yazma": i["b"].get("yazma1", 0) + i["b"].get("yazma5", 0),
                      "model": i["model"], "effort": i["effort"], "araclar": dict(i["araclar"].most_common(6))} for i in istekler],
        "okumalar": [{"arac": s["arac"], "hedef": s["hedef"], "istek": s["istek"], "tok": round(s["tok"]), "tasima": s["tasima"], "w": round(s["w"])}
                     for s in sorted(sonuclar, key=lambda s: -s["w"])[:25]],
        "arac_toplam": {},
        "ajanlar": ajanlar,
        "kacirma": kacirma,
    }
    at = defaultdict(lambda: {"adet": 0, "tok": 0, "w": 0})
    for s in sonuclar:
        a = at[s["arac"]]
        a["adet"] += 1
        a["tok"] += round(s["tok"])
        a["w"] += round(s["w"])
    oz["arac_toplam"] = dict(sorted(at.items(), key=lambda kv: -kv[1]["w"]))
    oz["oneriler"] = _oneriler(oz)
    return oz


def _kategoriler(cagri_b, usd):
    """Harcama, dolar karşılığıyla (model fiyatı dahil) beş kalemde."""
    k = Counter()
    for model, b in cagri_b:
        k["Bağlamı yeniden okuma (önbellek okuma)"] += usd(model, b["okuma"] * W["okuma"])
        k["Bağlama yeni ekleme (önbellek yazma)"] += usd(model, b["yazma1"] * W["yazma1"] + b["yazma5"] * W["yazma5"])
        k["Düşünme"] += usd(model, b["dusunme"] * W["cikti"])
        k["Yazma (metin + araç komutu)"] += usd(model, b["yazi"] * W["cikti"])
        k["Önbelleksiz girdi"] += usd(model, b["girdi"] * W["girdi"])
    return {a: round(v, 3) for a, v in k.items()}


def _oneriler(oz):
    k, top = oz["kategoriler"], max(1, sum(oz["kategoriler"].values()))
    o = []
    pay = lambda ad: 100 * k[ad] / top  # noqa: E731
    if pay("Bağlamı yeniden okuma (önbellek okuma)") >= 50:
        o.append(f"Harcamanın %{pay('Bağlamı yeniden okuma (önbellek okuma)'):.0f}'i aynı konuşmayı her çağrıda yeniden okumak. "
                 f"Bağlam {oz['son_baglam'] // 1000}k tokena çıktı: bir iş bitince yeni oturum (kullanıcı 'devam' yazar), aynı oturumda yeni konu açma.")
    if oz["okumalar"] and oz["okumalar"][0]["w"] > 0.05 * max(1, oz["ana_w"]):
        r = oz["okumalar"][0]
        o.append(f"En pahalı tek okuma: {r['arac']} {r['hedef']} (~{r['tok'] // 1000}k token, {r['tasima']} çağrı boyunca taşındı). "
                 "Büyük çıktıları kırp (head/grep), dosyayı aralıkla oku.")
    if pay("Düşünme") >= 20:
        o.append(f"Düşünme payı %{pay('Düşünme'):.0f}: rutin işlerde effort'u medium/low tut.")
    if oz["ajan_usd"] > oz["ana_usd"] * 0.3:
        o.append(f"Alt ajanlar ana oturumun %{100 * oz['ajan_usd'] / max(0.01, oz['ana_usd']):.0f}'i kadar harcadı; her ajan ~{max([a['ilk_baglam'] for a in oz['ajanlar']] or [0]) // 1000}k "
                 "tokenla başlar: yalnız bağımsız, büyük işlere ajan aç; brief kısa olsun.")
    kk = [x for x in oz["kacirma"] if "değişti" in x["neden"] or "ara" in x["neden"]]
    if kk:
        o.append(f"{len(kk)} kez tüm bağlam yeniden yazıldı (model değişimi ya da 1 saatten uzun ara): ~{sum(x['token'] for x in kk) // 1000}k token. "
                 "Model/effort değiştireceksen ya da uzun ara verdiysen aynı oturuma değil yeni oturuma 'devam' yaz.")
    opus = [i for i in oz["istekler"] if "opus" in (i["model"] or "")]
    if opus and oz["kur"]:
        ks = sorted(oz["kur"].values())
        if len(ks) > 1:
            o.append(f"Aynı token Opus'ta Sonnet'in ~{ks[-1] / ks[0]:.1f} katı: rutin işler (test, teslim, küçük düzeltme) Sonnet'te; Opus mimari ve zor hatalara.")
    cagri_istek = oz["cagri"] / max(1, oz["istek"])
    if cagri_istek > 15:
        o.append(f"İstek başına ortalama {cagri_istek:.0f} model çağrısı: her araç çağrısı tüm bağlamı yeniden okur; komutları birleştir, paralel çağır.")
    return o


def yaz(oz):
    klasor = os.path.join(KOK, "docs", "token")
    os.makedirs(klasor, exist_ok=True)
    veri_yol = os.path.join(klasor, "veri.json")
    try:
        with open(veri_yol, encoding="utf-8") as f:
            veri = json.load(f)
    except Exception:
        veri = {"oturumlar": []}
    veri["oturumlar"] = [o for o in veri["oturumlar"] if o.get("oturum") != oz["oturum"]] + [oz]
    veri["oturumlar"].sort(key=lambda o: o.get("olculdu", ""), reverse=True)
    with open(veri_yol, "w", encoding="utf-8") as f:
        json.dump(veri, f, ensure_ascii=False, separators=(",", ":"))
    sablon = open(os.path.join(KOK, "tools", "token-rapor.html"), encoding="utf-8").read()
    html = sablon.replace("/*VERI*/null", json.dumps(veri, ensure_ascii=False).replace("</", "<\\/"))
    with open(os.path.join(klasor, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def konsol(oz):
    k = oz["kategoriler"]
    top = max(1, sum(k.values()))
    print(f"Oturum {oz['oturum'][:8]} · {oz['baslangic']} → {oz['bitis']} · {oz['istek']} istek · {oz['cagri']} model çağrısı · "
          f"≈ ${oz['ana_usd'] + oz['ajan_usd']:.2f} liste fiyatı karşılığı (ana ${oz['ana_usd']}, ajanlar ${oz['ajan_usd']})")
    print(f"Sabit yük (ilk bağlam): {oz['sabit_yuk']:,} token · son bağlam: {oz['son_baglam']:,} token")
    for ad, v in sorted(k.items(), key=lambda kv: -kv[1]):
        print(f"  {100 * v / top:5.1f}%  {ad}")
    tum = max(0.01, oz["ana_usd"] + oz["ajan_usd"])
    print("En pahalı istekler:")
    for i in sorted(oz["istekler"], key=lambda i: -(i["usd"] + i["ajan_usd"]))[:5]:
        print(f"  #{i['no']} {i['saat']} · {i['cagri']} çağrı · ${i['usd'] + i['ajan_usd']:.2f} (%{(i['usd'] + i['ajan_usd']) / tum * 100:.0f}) · {i['model']} {i['effort']}")
    for o in oz["oneriler"]:
        print("  → " + o)


def main(argv):
    sid = argv[argv.index("--oturum") + 1] if "--oturum" in argv else None
    if not sid:
        adaylar = [p for p in glob.glob(os.path.join(PROJ, "*", "*.jsonl"))]
        if not adaylar:
            print("Oturum kaydı yok (bu ortamda Claude Code kaydı bulunamadı); rapor atlandı.")
            return 0
        sid = os.path.splitext(os.path.basename(max(adaylar, key=os.path.getmtime)))[0]
    oz = olc(sid)
    konsol(oz)
    if "--yaz" in argv:
        yaz(oz)
        print("docs/token/ güncellendi")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
