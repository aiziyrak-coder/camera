#!/bin/bash
# Production (cam.fermi.uz) ni GitHub'dagi main holatiga keltirish.
# Serverda, root huquqi bilan:
#
#   sudo bash /opt/camera/deploy/server-pull.sh
#
# 1) kod  2) production .env sozlamalari  3) frontend  4) MediaMTX sozlamasi
# 5) nginx (zaxira bilan; `nginx -t` o'tmasa avvalgi holat qaytadi)
# 6) Docker: MediaMTX shardlari + API (migratsiyalar API ishga tushganda)
set -euo pipefail

APP_DIR=/opt/camera
GIT="git -c safe.directory=${APP_DIR}"

main() {
  cd "$APP_DIR"

  echo "=== 1. Git ==="
  $GIT fetch origin main
  $GIT reset --hard origin/main
  # Bu skriptning o'zi ham yangilangan bo'lishi mumkin — yangisini ishga tushiramiz.
  if [[ -z "${CAMERA_PULL_REEXEC:-}" ]]; then
    CAMERA_PULL_REEXEC=1 exec bash "$APP_DIR/deploy/server-pull.sh" "$@"
  fi
  $GIT log -1 --format='    %h %s'

  echo "=== 2. Production .env ==="
  python3 "$APP_DIR/deploy/merge_env.py" "$APP_DIR/deploy/env.production.scale" "$APP_DIR/camera-api/.env"

  echo "=== 3. Frontend ==="
  npm ci --no-audit --no-fund
  npm run build
  rsync -a --delete dist/ /var/www/cam.fermi.uz/

  echo "=== 4. MediaMTX sozlamasi ==="
  # cp faylni joyida yozadi (inode o'zgarmaydi) — konteyner o'zgarishni ko'radi.
  cmp -s deploy/mediamtx.yml camera-api/mediamtx.yml || cp deploy/mediamtx.yml camera-api/mediamtx.yml

  echo "=== 5. Nginx ==="
  python3 "$APP_DIR/deploy/nginx_sync.py"

  echo "=== 6. Docker ==="
  cp deploy/docker-compose.override.yml deploy/docker-compose.mediamtx-shard.yml deploy/docker-compose.gpu.yml camera-api/
  cd "$APP_DIR/camera-api"
  local compose=(docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.mediamtx-shard.yml)
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    compose+=(-f docker-compose.gpu.yml)
  fi
  "${compose[@]}" up -d --build

  echo "=== 7. Tekshiruv ==="
  local healthy=""
  for _ in $(seq 1 36); do
    if curl -sf http://127.0.0.1:18080/health >/dev/null; then healthy=1; break; fi
    sleep 5
  done
  curl -s http://127.0.0.1:18080/health; echo
  "${compose[@]}" ps
  [[ -n "$healthy" ]] || { echo "XATO: API 3 daqiqada sog'lom holatga kelmadi — '${compose[*]} logs api'"; exit 1; }
  bash "$APP_DIR/deploy/test-login.sh" \
    || echo "DIQQAT: demo parol hali ishlaydi — Foydalanuvchilar va Rollar sahifasida almashtiring"

  if ! grep -q '^STREAM_URL_SECRET=.' "$APP_DIR/camera-api/.env"; then
    echo "ESLATMA: jonli video hali imzosiz. Yoqish: sudo bash $APP_DIR/deploy/enable-stream-auth.sh"
  fi
  echo "=== Tayyor ==="
}

main "$@"
exit
