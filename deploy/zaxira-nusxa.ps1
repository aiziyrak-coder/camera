# Server zaxirasining nusxasi shu kompyuterga (off-site nusxa).
#
# Server diski buzilsa, u yerdagi zaxiralar ham yo'qoladi. Bu skript har kuni
# serverdagi eng yangi zaxirani D:\Camera-zaxira ga ko'chiradi:
#   * baza (db-*.dump)    — har kuni, 7 kun saqlanadi (~60 MB dona);
#   * rasmlar (minio-*.tgz) — oxirgi 2 tasi (har biri to'liq, ~1.3 GB);
#   * .env (env-*.bak)    — 7 kun (kamera parollarini ochish kaliti shu yerda).
# Har fayl SHA-256 bilan serverdagisiga solishtiriladi; mos kelmasa o'chiriladi
# va ertasi kuni qayta yuklanadi. Windows "Vazifalar rejalashtiruvchisi" har
# kuni 10:00 da (kompyuter o'chiq bo'lsa — yoqilganda) ishga tushiradi.
#
# Ichida yuz rasmlari va maxfiy kalitlar bor — papkani boshqalarga bermang.

$ErrorActionPreference = 'Stop'
$Dest = 'D:\Camera-zaxira'
$Key = Join-Path $env:USERPROFILE '.ssh\camera_deploy'
$Target = 'admin_root@87.192.230.208'
$SshOpts = @('-p', '2222', '-i', $Key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4')
$ScpOpts = @('-P', '2222', '-i', $Key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4')
$Log = Join-Path $Dest 'nusxa.log'

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
function Log($text) {
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text
    Add-Content -Path $Log -Value $line -Encoding utf8
    Write-Output $line
}

$failed = $false
try {
    # Serverdagi eng yangi fayllar va ularning SHA-256 si.
    $remote = 'cd ~/camera-backups && for p in "db-*.dump" "minio-*.tgz" "env-*.bak"; do f=$(ls -1t $p 2>/dev/null | head -1); [ -n "$f" ] && sha256sum "$f"; done'
    $listing = & ssh.exe @SshOpts $Target $remote
    if ($LASTEXITCODE -ne 0 -or -not $listing) { throw "serverdan ro'yxat olinmadi (ssh $LASTEXITCODE)" }

    foreach ($row in $listing) {
        $hash, $name = ($row -split '\s+', 2)
        $name = $name.Trim()
        if ($name -notmatch '^(db-[\d-]+\.dump|minio-[\w-]+\.tgz|env-[\d-]+\.bak)$') { throw "kutilmagan fayl nomi: $name" }
        $final = Join-Path $Dest $name
        if ((Test-Path $final) -and ((Get-FileHash $final -Algorithm SHA256).Hash -eq $hash.ToUpper())) {
            Log "bor: $name"
            continue
        }
        $part = "$final.part"
        & scp.exe @ScpOpts -q "${Target}:camera-backups/$name" $part
        if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $part -ErrorAction SilentlyContinue; Log "XATO: $name yuklanmadi (scp $LASTEXITCODE)"; $failed = $true; continue }
        if ((Get-FileHash $part -Algorithm SHA256).Hash -ne $hash.ToUpper()) {
            Remove-Item -LiteralPath $part
            Log "XATO: $name buzilgan holda keldi (SHA-256 mos emas)"
            $failed = $true
            continue
        }
        Move-Item -LiteralPath $part -Destination $final -Force
        Log ("yuklandi: {0} ({1:N0} MB)" -f $name, ((Get-Item $final).Length / 1MB))
    }

    # Eskilarini tozalash — faqat shu papkadagi zaxira fayllari.
    $cutoff = (Get-Date).AddDays(-7)
    Get-ChildItem -LiteralPath $Dest -File | Where-Object { $_.Name -match '^(db-.*\.dump|env-.*\.bak)$' -and $_.LastWriteTime -lt $cutoff } |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName; Log "o'chirildi (7 kundan eski): $($_.Name)" }
    Get-ChildItem -LiteralPath $Dest -File | Where-Object { $_.Name -match '^minio-.*\.tgz$' } | Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 2 | ForEach-Object { Remove-Item -LiteralPath $_.FullName; Log "o'chirildi (rasmlar, eng yangi 2 tasi qoladi): $($_.Name)" }
    Get-ChildItem -LiteralPath $Dest -File -Filter '*.part' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-12) } |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName }
} catch {
    Log "XATO: $($_.Exception.Message)"
    $failed = $true
}

$total = (Get-ChildItem -LiteralPath $Dest -File | Measure-Object Length -Sum).Sum / 1GB
$free = (Get-PSDrive ($Dest.Substring(0, 1))).Free / 1GB
if ($failed) {
    Log ("TUGADI XATO BILAN; papkada {0:N1} GB, diskda {1:N1} GB bo'sh" -f $total, $free)
    exit 1
}
Set-Content -Path (Join-Path $Dest 'oxirgi-muvaffaqiyatli.txt') -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Encoding utf8
Log ("TAYYOR; papkada {0:N1} GB, diskda {1:N1} GB bo'sh" -f $total, $free)
