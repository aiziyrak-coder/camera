# Loyiha auditi — boshlang'ich holat (0-bosqich)

Sana: 2026-11-17 · Tekshiruvchi: Claude (avtonom audit, 1-sikl)
Holat: **NOT READY** (sabablari — `PRODUCTION_READINESS.md`)

Bu hujjat faqat tekshirilgan faktlarni o'z ichiga oladi. Har band yonida
dalil: fayl:qator, buyruq yoki production'dagi faqat-o'qish so'rovi.

## 1. Mahsulot nima

Farg'ona jamoat salomatligi tibbiyot instituti uchun **yuzlar bazasi**:
talaba va xodimlarning yuzini ro'yxatdan o'tkazish, tasdiqlash va saqlash.
Asosiy foydalanuvchilar — administratorlar (dekanat, kadrlar), talaba/xodim
(ochiq telefon sahifasi orqali o'zini ro'yxatdan o'tkazadi), tashqi tizim
(iMentor — API kaliti bilan).

2026-11-12 da (commit `4ab7990`) platforma ataylab qisqartirilgan: kamera
tahlili, davomat AI, hodisalar, NVR, video tahlil o'chirilgan. Qolgan
qamrov: yuzlar bazasi, tasdiqlash, HEMIS, Telegram, foydalanuvchilar,
iMentor integratsiyasi, ochiq taqdimot, zaxira kuzatuvi.

Keyingi rejalashtirilgan ish (biznes qarori kerak): 300 kamera, NVR
yozuvidan davomat va dars davomati (`DECISIONS_AND_BLOCKERS.md`, D1–D2).

## 2. Texnologiyalar

| Qism | Texnologiya | Joyi |
|---|---|---|
| Frontend | React 19, Vite 8, TypeScript, Tailwind 3, react-router 7 | `src/` |
| Backend | FastAPI, SQLAlchemy async, Alembic, Postgres 17 | `camera-api/app/` |
| Saqlash | MinIO (S3) — yuz rasmlari | `camera-api/app/storage.py` |
| Yuz tanish | insightface buffalo_l (det_10g + w600k_r50, int8), onnxruntime CPU | `app/services/face_recognition.py` |
| Fon vazifalari | 5 ta loop: telegram_bot, hemis_sync, hemis_photos, hemis_attendance, system_alerts | `app/main.py:65-72` |
| Server | Proxmox VM (institut ichida), 32 vCPU (AVX yo'q), 94 GB RAM, 23 ta boshqa loyiha bilan umumiy | 192.168.0.101 |
| Proxy | nginx 1.24, Let's Encrypt (muddati 2027-01-17) | `deploy/nginx/` |

## 3. Git va ish muhiti (2026-11-17)

- Branch `main`, ishchi nusxa toza (`git status` bo'sh).
- `main` origin'dan **25 commit oldinda** — GitHub'ga push qilinmagan, ya'ni
  bu 25 commit **CI'da hech qachon tekshirilmagan** (`.github/workflows/ci.yml` bor).
- `git stash` da `faceid-wip` — boshqa ish, tegilmadi.
- Server repo (`/opt/camera`) — `git bundle` orqali fast-forward; serverda
  boshqa odamning mahalliy o'zgarishlari bor (`docker-compose.override.yml`,
  `mediamtx.yml`) — tegilmagan.

## 4. Boshlang'ich natijalar (baseline)

| Tekshiruv | Buyruq | Natija |
|---|---|---|
| Frontend tiplari | `npx tsc --noEmit -p tsconfig.app.json` | ✅ xatosiz |
| Frontend testlar | `npx vitest run` | ✅ 15 fayl, 104 test o'tdi |
| Frontend lint | `npx oxlint` | ✅ xato yo'q, 4 ogohlantirish (fast-refresh) |
| Frontend build | `npx vite build` | ✅; asosiy JS 265 KB (gzip 84 KB) |
| npm audit (prod) | `npm audit --omit=dev` | ❌ 1 critical: `dompurify ≤3.4.16` ← `jspdf` (kodda **ishlatilmaydi**) |
| Backend testlar | lokal Docker + toza Postgres | ⏳ `TEST_REPORT.md` ga qarang |
| Backend lint | `ruff check` | ishlatilmagan importlar bor (kritik emas) |

## 5. Production holati (faqat o'qish, 2026-11-16 19:41 UTC)

| Narsa | Holat | Dalil |
|---|---|---|
| API, DB, MinIO, Redis, ai-worker | hammasi `healthy` | `docker ps` |
| Migratsiya | `z5a2b3c4d5e6 (head)` = kod head | `alembic current/heads` |
| 24 soatdagi xatolar (api, ai-worker) | 0 | `docker logs --since 24h` |
| Disk | 67% band, 326 GB bo'sh | `df -h /` |
| Kunlik zaxira | 2026-11-16 02:15 UTC muvaffaqiyatli | `backup.log` |
| Off-site nusxa (D:\Camera-zaxira) | 2026-11-16 10:00 muvaffaqiyatli, natija 0 | Task Scheduler |
| HTTPS sarlavhalar | HSTS, nosniff, X-Frame, Referrer, Permissions — bor; **CSP faqat Report-Only** | `curl -D -` |
| CORS | faqat `https://cam.fermi.uz` (begona originga ruxsat yo'q) | `curl -H Origin:` |
| `/docs`, `/openapi.json`, `/redoc` | 404 (yopiq) | `curl` |
| `/metrics` | 403 tashqaridan | `curl` |
| Himoyalangan API'lar tokensiz | 401 | `curl` |

## 6. Asosiy topilmalar (qisqa)

Batafsil: `FEATURE_INVENTORY.md`, `SECURITY_AUDIT.md`, `REQUIREMENTS_GAPS.md`.

1. **Xavfsizlik (High):** ochiq ro'yxatdan o'tishda birovning HEMIS yozuviga
   o'z yuzini bog'lash mumkin; "Hammasini tasdiqlash" shubhali yuzlarni ham
   tasdiqlaydi (S-H1, S-H2).
2. **Xavfsizlik (Medium):** SMTP sozlanmagan → parol tiklash havolasi server
   jurnaliga yoziladi (S-M1); login cheklovi faqat IP bo'yicha (S-M2);
   ochiq rasm endpointlarida "piksel bombasi" himoyasi yo'q (S-M3).
3. **Ishlamaydigan va'dalar:** Telegram bot sozlanmagan (token yo'q) —
   Telegram sahifasi, ota-onaga xabar, tizim ogohlantirishlari yetkazilmaydi.
   Ota-onaga "keldi/kelmadi" xabarini yaratuvchi jarayon umuman yo'q.
4. **Bino cheklovi** saqlanadi, lekin hech qayerda qo'llanmaydi (hozir hech
   kimga qo'yilmagan — ma'lumot ochilishi yo'q).
5. **O'lik kod:** ~170 ta eskirgan sozlama, kamera/AI modullari (masalan
   `jobs/attendance_ai.py` 1971 qator) import qilinadi, lekin ishlamaydi;
   frontendda `/api/access/*` ga murojaat qiluvchi ishlatilmaydigan funksiyalar.
6. **Frontend xatolari:** "Siz" belgisi va o'zini o'chirish tugmasi noto'g'ri
   (login ↔ to'liq ism solishtiriladi); HEMIS odamini o'chirish har doim 409
   va mavjud bo'lmagan "Birlashtirish" tugmasini ko'rsatadi.
