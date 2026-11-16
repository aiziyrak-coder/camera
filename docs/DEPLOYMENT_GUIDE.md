# Deploy qo'llanmasi

Sana: 2026-11-17. Hozirgi amaldagi tartib (sudo talab qilinmaydi;
`admin_root` docker guruhida). Server umumiy (23 loyiha) — faqat
`camera-api` konteynerlariga tegiladi, `docker system prune` hech qachon.

## Frontend

```bash
npx vite build --assetsDir app
tar -czf fe.tgz -C dist .
scp -P 2222 -i ~/.ssh/camera_deploy fe.tgz admin_root@87.192.230.208:/tmp/frontend-dizayn.tgz
# serverda: yangi papkaga ochish → rsync (index.html, fonts, icons'siz) → index.html'ni atomik almashtirish
```

Teskari qaytarish: oldingi build'ni xuddi shu tartibda qayta joylash
(`/var/www` haftalik zaxirasi — `~/camera-backups/www-*.tgz`).

## Backend

1. Kod: `git bundle create x.bundle <server HEAD>..main` → `scp` → serverda
   `git fetch /tmp/x.bundle main && git merge --ff-only FETCH_HEAD`
   (`/opt/camera`). Serverdagi `docker-compose.override.yml`, `mediamtx.yml`
   mahalliy o'zgarishlariga tegilmaydi.
2. Qayta qurish: `sh ~/camera-cron/api-yangilash.sh` — `config -q` →
   `build api` → `up -d --no-deps api` → `/health` kutish (6 daqiqagacha) →
   taqdimot endpointi. API 2–3 daqiqa ishlamaydi.
3. **OPS-1 (tuzatilishi kerak):** skript `ai-worker` ni yangilamaydi —
   fon vazifalari eski kodda qoladi. Tuzatish: `build api ai-worker` va
   `up -d --no-deps api ai-worker`.
4. Migratsiyalar konteyner ishga tushganda avtomatik (`alembic upgrade head`).
   Hozirgi head: `z5a2b3c4d5e6`.

Compose fayllari: `-f docker-compose.yml -f docker-compose.override.yml
-f docker-compose.mediamtx-shard.yml -f docker-compose.ai-worker.yml`.

## Teskari qaytarish (backend)

`git -C /opt/camera reset --hard <oldingi commit>` emas — `git checkout
<oldingi commit> -- .` ham emas: serverda boshqa odamning o'zgarishlari bor.
Xavfsiz yo'l: oldingi commitni bundle bilan qayta yuborib, revert commit
qilish va qayta qurish. Migratsiya o'zgargan bo'lsa — `alembic downgrade`
oldindan sinalgan bo'lishi shart. **Bu tartib hali sinalmagan (T06 bilan
birga sinash kerak).**

## Kuzatuv

- `/health` (DB + storage), `docker ps` (healthcheck), panelda "Kunlik zaxira".
- Telegram ogohlantirishlari — bot sozlanmaguncha ishlamaydi (B2).
