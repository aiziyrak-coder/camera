#!/usr/bin/env bash
# Kunlik zaxira: baza (pg_dump -Fc), yuz rasmlari (MinIO) va .env.
# Cron: 0 2 * * * /opt/camera/deploy/backup.sh >> /home/admin_root/camera-backups/backup.log 2>&1
#
# Server umumiy (23 ta loyiha): faqat shu loyihaning konteynerlariga tegadi,
# hech narsa prune qilinmaydi. Eski nusxalar RETENTION_DAYS dan keyin o'chadi.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/camera/camera-api}
OUT_DIR=${OUT_DIR:-$HOME/camera-backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
WEB_ROOT=${WEB_ROOT:-/var/www/cam.fermi.uz}
MINIO_VOLUME=${MINIO_VOLUME:-camera-api_minio_data}
STAMP=$(date +%F-%H%M)

mkdir -p "$OUT_DIR"
cd "$APP_DIR"

# 1. Baza. Vaqtinchalik faylga yoziladi va faqat muvaffaqiyatli tugagach
#    yakuniy nomga o'tkaziladi — yarim yozilgan dump zaxira bo'lib qolmasin.
tmp="$OUT_DIR/.db-$STAMP.part"
if docker compose exec -T db sh -c 'pg_dump -U $POSTGRES_USER -Fc $POSTGRES_DB' > "$tmp"; then
    mv "$tmp" "$OUT_DIR/db-$STAMP.dump"
    echo "$(date -Is) baza: $(du -h "$OUT_DIR/db-$STAMP.dump" | cut -f1)"
else
    rm -f "$tmp"
    echo "$(date -Is) XATO: baza zaxirasi olinmadi" >&2
    exit 1
fi

# 2. .env (kamera parollari shifrlash kaliti shu yerda — usiz baza tiklansa
#    ham kameralarga ulanib bo'lmaydi).
if [ -r "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$OUT_DIR/env-$STAMP.bak"
    chmod 600 "$OUT_DIR/env-$STAMP.bak"
fi

# 3. Yuz rasmlari (MinIO) — har kuni. Bu bazadagi yagona qayta tiklab
#    bo'lmaydigan ma'lumot (vektorlarni rasmlardan qayta hisoblasa bo'ladi,
#    rasmlarni esa yo'q). Hajmi ~1.5 GB.
#    Kunlik nusxa 7 kun, yakshanbadagisi haftalik sifatida 60 kun saqlanadi.
#    Xato bo'lsa skript to'xtamaydi (tozalash bajarilsin), oxirida 1 qaytaradi.
failed=0
if [ "$(date +%u)" = "7" ]; then
    minio_out="$OUT_DIR/minio-$STAMP.tgz"
else
    minio_out="$OUT_DIR/minio-kun-$STAMP.tgz"
fi
# MinIO obrazida tar yo'q — arxivni ishlab turgan api konteynerining obrazi
# bilan olamiz. `docker compose images -q` eski (o'chirilgan) obraz ID sini
# qaytarardi va 2026-10-11 dan beri bu qadam har yakshanba yiqilardi.
api_container=$(docker compose ps -q api | head -1)
img=$(docker inspect -f '{{.Image}}' "$api_container" 2>/dev/null || true)
if [ -n "$img" ]     && docker run --rm -v "$MINIO_VOLUME":/data:ro --entrypoint tar "$img" -cz -C /data camera-uploads > "$minio_out.part"     && gzip -t "$minio_out.part"; then
    mv "$minio_out.part" "$minio_out"
    echo "$(date -Is) rasmlar: $(du -h "$minio_out" | cut -f1)"
else
    rm -f "$minio_out.part"
    echo "$(date -Is) XATO: rasmlar zaxirasi olinmadi" >&2
    failed=1
fi
if [ "$(date +%u)" = "7" ]; then
    tar -czf "$OUT_DIR/www-$STAMP.tgz" -C "$WEB_ROOT" . 2>/dev/null || true
fi

# 4. Eskilarini tozalash.
find "$OUT_DIR" -maxdepth 1 -name 'db-*.dump' -mtime +"$RETENTION_DAYS" -delete
find "$OUT_DIR" -maxdepth 1 -name 'env-*.bak' -mtime +"$RETENTION_DAYS" -delete
find "$OUT_DIR" -maxdepth 1 -name 'minio-kun-*.tgz' -mtime +7 -delete
find "$OUT_DIR" -maxdepth 1 -name 'minio-20*.tgz' -mtime +60 -delete
find "$OUT_DIR" -maxdepth 1 -name 'www-*.tgz' -mtime +60 -delete

# 5. Holat fayli: oxirgi muvaffaqiyatli zaxira vaqti (kuzatish uchun).
if [ "$failed" = 0 ]; then
    date -Is > "$OUT_DIR/oxirgi-muvaffaqiyatli"
fi
echo "$(date -Is) tayyor; jami: $(du -sh "$OUT_DIR" | cut -f1)"
exit "$failed"
