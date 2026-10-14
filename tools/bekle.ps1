param([string]$Url, [string]$Log, [int]$Sn = 300)
# Sunucu /health yanit verene dek bekler (en cok $Sn sn); arada son gunluk satirini yazar.
for ($i = 0; $i -lt $Sn; $i++) {
  try { $r = Invoke-RestMethod -Uri $Url -TimeoutSec 3; if ($r.ok) { exit 0 } } catch {}
  if ($i % 15 -eq 14) {
    $son = ''
    if (Test-Path $Log) { $son = (Get-Content $Log -Tail 1 -ErrorAction SilentlyContinue) }
    Write-Host ('  ... ' + ($i + 1) + ' sn: sunucu henuz yanit vermedi. Son satir: ' + $son)
  }
  Start-Sleep 1
}
exit 1
