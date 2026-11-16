# Arxitektura

Sana: 2026-11-17. Faqat hozir ishlayotgan qismlar. O'chirilgan modullarning
qoldiqlari — `REQUIREMENTS_GAPS.md` T20–T21.

```
 Brauzer (admin)          Telefon (talaba/xodim)         iMentor (tashqi)
      │ HTTPS                    │ HTTPS                       │ HTTPS + X-API-Key
      ▼                          ▼                             ▼
 nginx (cam.fermi.uz — statik SPA; camapi.fermi.uz — API; storage.camapi.fermi.uz — MinIO)
      │
      ├── camera-api-api-1        AI_ROLE=api     — HTTP so'rovlar (FastAPI, uvicorn)
      ├── camera-api-ai-worker-1  AI_ROLE=worker  — fon vazifalari (leader lock bilan)
      │        telegram_bot · hemis_sync (24 soat) · hemis_photos (o'chiq) ·
      │        hemis_attendance · system_alerts (disk, HEMIS, zaxira)
      ├── camera-api-db-1         Postgres 17 — asosiy baza
      ├── camera-api-minio-1      MinIO — yuz rasmlari (old/chap/o'ng)
      └── camera-api-redis-1      Redis — limitlar, kesh, leader lock
```

## Asosiy oqimlar

1. **Ro'yxatdan o'tish (ochiq):** `/royxatdan-otish` → `POST /api/public/enrollment/lookup`
   (JSHSHIR/pasport) yoki `/register` (topilmasa) → rozilik → kamera:
   `pose-check` har kadrda → `/{id}/submit` (3 rasm: old, chap, o'ng).
   Yuz vektori (ArcFace 512) hisoblanadi; HEMIS rasmi bilan solishtiriladi
   (`identity_check.py`); boshqa tasdiqlangan odamga o'xshasa yoki HEMIS
   rasmiga o'xshamasa — `kutilmoqda` (administrator tasdig'i).
2. **Tasdiqlash:** `/tasdiqlash` → approve/reject.
3. **HEMIS:** `hemis_sync` har 24 soatda talaba/xodim ro'yxati, guruhlar,
   dars jadvali (`lesson_sessions`), davomat (`attendance_records`, manba hemis).
4. **iMentor:** `/api/v1/integration/students/lookup` va `/face-identify`.
5. **Taqdimot:** `/api/public/taqdimot` — faqat umumiy sonlar, 5 daqiqa kesh.
6. **Zaxira:** cron 02:15 UTC `deploy/backup.sh` (pg_dump + MinIO tar) →
   natija `integration_sync_runs` (source=zaxira) → panelda; egasining
   kompyuteriga `deploy/zaxira-nusxa.ps1` (Task Scheduler, 10:00).

## Ruxsatlar

`require_permission(key)` — rol × kalit matritsasi bazada (`permissions`),
super-admin uchun ham avtomatik ruxsat yo'q (matritsa hal qiladi). Asosiy
kalitlar: registerPeople, exportData, manageIntegrations,
manageNotifications, manageRoles, managePrivacy, manageOrgStructure.

## Ma'lum arxitektura muammolari

- **OPS-1:** `api-yangilash.sh` faqat `api` ni qayta quradi; fon vazifalari
  ishlaydigan `ai-worker` 2026-11-12 obrazida qolgan (keyingi o'zgarishlar,
  masalan zaxira ogohlantirishi, unda yo'q). Ikkalasi bitta obrazdan —
  ikkalasi birga yangilanishi kerak.
- Obraz 3.95 GB: torch/ultralytics/mediapipe faqat o'chirilgan modullar
  uchun (`STORAGE_OPTIMIZATION_REPORT.md`).
- O'lik kod: kamera/AI modullari import qilinadi, lekin ishlamaydi.
