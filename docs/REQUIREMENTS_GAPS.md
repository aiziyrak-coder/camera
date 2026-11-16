# Bo'shliqlar va vazifalar ro'yxati

Sana: 2026-11-17 (1-sikl). Ustuvorlik: **P0** — reliz to'sig'i,
**P1** — muhim, **P2** — sifat/texnik qarz. Holat: `TODO` · `DOING` ·
`DONE` (tekshirilgan) · `DECISION` · `BLOCKED`.

## P0 — reliz to'sig'i

| ID | Vazifa | Fayllar | Qabul mezoni | Holat |
|---|---|---|---|---|
| T01 | Ommaviy tasdiqlash shubhali yuzlarni chetlab o'tsin (S-H2) | `students_staff.py:1281`, `Review.tsx` | `biometrics_review_reason` bor yozuv approve-all'da tasdiqlanmaydi; javobda "o'tkazib yuborildi: N"; test | TODO |
| T02 | Anonim `/register` mavjud yozuvga JSHSHIR yozmasin (S-H1) | `enrollment.py:465`, `person_dedupe.py` | da'vo `kutilmoqda` + sabab bilan administratorga; haqiqiy odam o'z JSHSHIRi bilan topiladi; test | TODO |
| T03 | Parol tiklash havolasi jurnalga yozilmasin (S-M1) | `app/email.py` | log'da token yo'q; test | TODO |
| T04 | Backend testlari toza bazada o'tsin; o'lik kodni sinayotgan va noto'g'ri sabab bilan o'tayotgan testlar ajratilsin | `tests/` | `TEST_REPORT.md` da aniq natija | DOING |
| T05 | 25 ta push qilinmagan commit CI'dan o'tsin | `.github/workflows/ci.yml` | CI yashil — **push uchun ruxsat kerak (D4)** | DECISION |
| T06 | Zaxiradan tiklash haqiqatan sinalsin (alohida bazaga) | `deploy/backup.sh`, `camera-api/docs/BACKUP.md` | zaxira toza Postgres'ga tiklanadi, jadval sonlari mos | TODO |

## P1

| ID | Vazifa | Qabul mezoni | Holat |
|---|---|---|---|
| T07 | Rasm endpointlarida piksel cheklovi, faqat JPEG (S-M3) | katta o'lchamli rasm 413/400 bilan rad etiladi; test | TODO |
| T08 | Login: per-akkaunt cheklov; 2FA 5 xatodan keyin bekor (S-M2) | test | TODO |
| T09 | Excel formula injection (S-M5) + eksport auditi (S-M7) | `=` bilan ism matn sifatida; `audit_log` da yozuv; test | TODO |
| T10 | "Yuzi yo'q" filtri `tasdiqlanmagan` dan foydalansin (FE-1) | karta soni = ro'yxat = Excel | TODO |
| T11 | Foydalanuvchilar: "siz" belgisi va o'zini o'chirish (FE-2) | backend `/me` login'ni ham qaytaradi yoki id solishtiriladi | TODO |
| T12 | HEMIS odamini o'chirish: tugma yashirilsin yoki tushunarli sabab (F09) | 409 ko'rinmaydi | TODO |
| T13 | Tasdiqlash navbatida sahifalash (F10) | 50 dan ortiq yozuv ko'rinadi | TODO |
| T14 | `jspdf` ni olib tashlash (S-L17) | `npm audit` 0 critical | TODO |
| T15 | Telegram/ota-ona va'dalari: UI ishlamaydigan narsani ko'rsatmasin | F17/F18 holati ochiq yozilgan | DECISION (D6) |
| T16 | CSP'ni majburiy qilish (S-M8) | sarlavha `Content-Security-Policy`; sayt buzilmaydi | TODO (nginx — ruxsat kerak) |

## P2 — texnik qarz

| ID | Vazifa | Holat |
|---|---|---|
| T20 | O'lik backend kodini olib tashlash: `jobs/attendance_ai.py` va bog'liq ~20 modul, ~170 sozlama, `app/services/nvr/` bo'sh paket | TODO (T04 dan keyin) |
| T21 | O'lik frontend kodi: `/api/access/*` funksiyalari, `reportLock.ts`, `types/index.ts` dagi 71 eksport | TODO |
| T22 | Eskirgan hujjatlar: `camera-api/docs/KUNLIK_VIDEO_TAHLIL.md`, `SITUATION_API.md` | TODO |
| T23 | `revoked_tokens` / `password_reset_tokens` tozalash | TODO |
| T24 | Bildirishnomadagi o'lik havolalar (`/hodisalar`, `/sozlamalar/kameralar`) | TODO |
| T25 | Noto'g'ri UUID → 400 (S-L14) | TODO |
