#!/usr/bin/env bash
# Claude artifact önizlemesi için uygulamayı tek HTML dosyasına paketler (esbuild + satır içi CSS).
# Kullanım:  bash tools/onizleme.sh <çıktı_klasörü>
# Çıktı: <klasör>/index.html (+ vendor/mammoth.browser.min.js, vendor/pdf.worker.min.mjs destek dosyaları)
# Not: önizlemede Piper (tarayıcı sesi) ve OCR çalışmaz; tam sürüm GitHub Pages'tedir.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:?Kullanım: bash tools/onizleme.sh <çıktı_klasörü>}"
mkdir -p "$OUT/vendor"
ESB="${ESBUILD:-}"
if [ -z "$ESB" ]; then
  T="${TMPDIR:-/tmp}/defter-esbuild"
  [ -x "$T/node_modules/.bin/esbuild" ] || (mkdir -p "$T" && cd "$T" && npm i -s esbuild >/dev/null)
  ESB="$T/node_modules/.bin/esbuild"
fi
"$ESB" js/app.js --bundle --format=esm --minify --log-level=warning --outfile="$OUT/bundle.js" --external:./vendor/piper/piper-tts-web.js
cp js/vendor/mammoth.browser.min.js js/vendor/pdf.worker.min.mjs "$OUT/vendor/"
python3 - "$OUT" <<'PY'
import re, sys
out = sys.argv[1]
css = open('css/app.css', encoding='utf-8').read()
js = open(f'{out}/bundle.js', encoding='utf-8').read().replace('</script', '<\\/script')
esc = lambda s: re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', lambda m: '\\x%02x' % ord(m.group()), s)
html = f'<title>Defter Studio</title>\n<style>\n{css}\n</style>\n<div id="app"><div class="boot">Defter Studio yükleniyor…</div></div>\n<script type="module">\n{esc(js)}\n</script>\n'
open(f'{out}/index.html', 'w', encoding='utf-8').write(html)
print(f'{out}/index.html', round(len(html) / 1024), 'KB')
PY
