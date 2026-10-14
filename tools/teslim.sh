#!/usr/bin/env bash
# Defter Studio teslim betiği:
#   test → gizli bilgi taraması → DEGISIKLIKLER.md'ye tarihli satır → LINKLER.md tarihi → commit → push → bağlantılar
# Kullanım:  bash tools/teslim.sh "kısa açıklama"      (testleri atlamak için: TESTSIZ=1 bash tools/teslim.sh "...")
# İsteğe bağlı: TESLIM_EK="Co-Authored-By: ..." commit mesajının sonuna eklenir.
set -euo pipefail
cd "$(dirname "$0")/.."
NOT="${1:-}"
if [ -z "$NOT" ]; then echo 'Kullanım: bash tools/teslim.sh "kısa açıklama"'; exit 1; fi
TARIH="$(date +%Y-%m-%d)"
SURUM="$(grep -m1 -oE '— [0-9]+\.[0-9]+\.[0-9]+' DEGISIKLIKLER.md | tr -d '— ' || echo '?')"

# 1) Testler (sahte model; gerçek model ve internet gerekmez)
if [ "${TESTSIZ:-0}" != "1" ]; then
  STATIC=0; MOCK=0
  curl -s -o /dev/null http://localhost:8099/ || { python3 -m http.server 8099 >/dev/null 2>&1 & STATIC=$!; }
  curl -s -o /dev/null http://localhost:8098/health || { python3 tests/mock_llm.py >/dev/null 2>&1 & MOCK=$!; }
  sleep 1.5
  KLASOR="$(mktemp -d)"
  if [ -x server/.venv/bin/python ]; then server/.venv/bin/python tests/server_test.py || { echo "✗ Sunucu testleri geçmedi"; exit 1; }; elif python3 -c "import fastapi" 2>/dev/null; then python3 tests/server_test.py || { echo "✗ Sunucu testleri geçmedi"; exit 1; }; fi
  if ! python3 tests/e2e.py "$KLASOR"; then
    echo "✗ Testler geçmedi; teslim durduruldu. Ekran görüntüleri: $KLASOR"
    [ "$STATIC" != 0 ] && kill "$STATIC"; [ "$MOCK" != 0 ] && kill "$MOCK"; exit 1
  fi
  [ "$STATIC" != 0 ] && kill "$STATIC"; [ "$MOCK" != 0 ] && kill "$MOCK"
fi

# 1b) Kendini güncelleyen sunucu için dosya özetleri (server/manifest.json)
python3 tools/baglam-denetim.py || { echo "✗ Bağlam denetimi başarısız (CLAUDE.md/ayar); düzelt, sonra yeniden dene."; exit 1; }
python3 tools/uret-manifest.py
python3 tools/uret-zip.py
python3 tools/token-rapor.py --yaz || echo "! Token raporu üretilemedi (oturum kaydı yok); atlandı."

# 2) Gizli bilgi taraması (API anahtarı, GitHub belirteci) — bulunursa dur
git add -A
if git diff --cached -U0 | grep -E '^\+' | grep -vE '^\+\+\+' | grep -qE '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{32,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})'; then
  echo "✗ Değişikliklerde gizli anahtara benzeyen bir dize var. Kaldırıp yeniden deneyin."; git reset -q; exit 1
fi

# 3) Değişiklik günlüğü ve bağlantı tarihi
if ! grep -qF -- "$NOT" DEGISIKLIKLER.md; then
  python3 - "$TARIH" "$NOT" <<'PY'
import sys
t, n = sys.argv[1], sys.argv[2]
p = 'DEGISIKLIKLER.md'; s = open(p, encoding='utf-8').read()
s = s.replace('# Değişiklikler\n', f'# Değişiklikler\n\n## {t} — teslim\n- {n}\n', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
fi
sed -i -E "s/^Son güncelleme: .*/Son güncelleme: $TARIH · sürüm $SURUM/" LINKLER.md

# 4) Commit + push
git add -A
if git diff --cached --quiet; then echo "Değişiklik yok."; else
  MSG="$NOT"; [ -n "${TESLIM_EK:-}" ] && MSG="$MSG

$TESLIM_EK"
  git commit -q -m "$MSG"
fi
git push -q origin main
echo "✓ Teslim edildi: $(git log --oneline -1)"
echo "  GitHub Pages 1-2 dakika içinde güncellenir."

# 5) Yerel = Pages eşitliği (Pages yayınlanana dek bekler)
python3 tools/esitlik.py || echo "! Eşitlik doğrulanamadı (ağ ya da Pages gecikmesi); kanıtlanana dek 'bitti' deme."

# 6) Bağlantı (yalnız kur.bat)
echo; echo "Bağlantılar:"; echo "  https://aseydaaksakal.github.io/defter-studio/kur.zip"; echo "  https://aseydaaksakal.github.io/defter-studio/docs/token/"
