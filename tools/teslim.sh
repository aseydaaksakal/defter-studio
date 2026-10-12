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
  if ! python3 tests/e2e.py "$KLASOR"; then
    echo "✗ Testler geçmedi; teslim durduruldu. Ekran görüntüleri: $KLASOR"
    [ "$STATIC" != 0 ] && kill "$STATIC"; [ "$MOCK" != 0 ] && kill "$MOCK"; exit 1
  fi
  [ "$STATIC" != 0 ] && kill "$STATIC"; [ "$MOCK" != 0 ] && kill "$MOCK"
fi

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

# 5) Bütün bağlantılar
echo; echo "Bağlantılar:"; grep -oE 'https?://[^ |)]+' LINKLER.md | awk '!seen[$0]++' | sed 's/^/  /'
