# Funksiyalar ro'yxati (Feature Inventory)

Sana: 2026-11-17 (1-sikl). Holatlar:
`VERIFIED` — tekshirilgan · `UNTESTED` — kod bor, uchidan-uchiga sinalmagan ·
`PARTIAL` · `BROKEN` · `MISSING` · `OBSOLETE` · `DECISION` — biznes qarori
kerak · `BLOCKED` — tashqi narsa yo'q (kalit, qurilma).

"Dalil" ustunida nima bilan tekshirilgani. Production'da tizimga kirib
tugma bosilmagan (qoida: prod'ga login qilinmaydi) — UI oqimlari lokal
nusxada (mock API) va backend so'rovlari prod bazada faqat-o'qish
rejimida tekshirilgan.

| ID | Funksiya | Rol | Holat | Muammo / izoh | Dalil |
|---|---|---|---|---|---|
| F01 | Login (parol) | hamma xodim | UNTESTED | ochiq topilma S-M2 | `auth.py:66`; testlar — TEST_REPORT |
| F02 | 2FA (TOTP) | hamma | UNTESTED | 8 foydalanuvchidan 1 tasida yoqilgan; majburiy emas | prod: `admin_2fa_required=False` |
| F03 | Parolni tiklash (email) | hamma | BLOCKED | SMTP sozlanmagan → xat ketmaydi (S-M1 jurnal muammosi tuzatildi) | prod: `smtp_host` bo'sh |
| F04 | Chiqish, sessiya | hamma | UNTESTED | token localStorage'da (S-L16) | `auth.tsx` |
| F05 | Boshqaruv paneli | registerPeople | VERIFIED (UI, mock) | "kameralar taniydi" yozuvi — kamera tahlili hozir yo'q | lokal preview |
| F06 | Yuzlar bazasi: ro'yxat, qidiruv, filtr | registerPeople | PARTIAL | "Yuzi yo'q" filtri `yoq` yuboradi, karta `missing+pending` sanaydi — `kutilmoqda` paydo bo'lsa farq qiladi (FE-1) | `Faces.tsx:44,212`; `students_staff.py:185` |
| F07 | Excel eksport (filtr bo'yicha) | exportData | VERIFIED (backend) | ochiq topilmalar S-M5, S-M7 | prod: 40 qator = ekrandagi son |
| F08 | Odam kartasi: tahrirlash | registerPeople | UNTESTED | — | `PersonPanel.tsx` |
| F09 | Odamni o'chirish | registerPeople | BROKEN (UX) | HEMIS odamida har doim 409 va UI'da yo'q "Birlashtirish" tugmasini aytadi | `PersonPanel.tsx:90`; backend 409 |
| F10 | Tasdiqlash navbati (bittalab) | registerPeople | UNTESTED | faqat birinchi 50 ta ko'rinadi, sahifalash yo'q | `Review.tsx:23` |
| F11 | "Hammasini tasdiqlash" | registerPeople | UNTESTED (prod) | S-H2 kodda tuzatildi, test bilan | `students_staff.py:1281` |
| F12 | Ochiq ro'yxatdan o'tish (telefon) | ochiq | PARTIAL | S-H1 kodda tuzatildi; ochiq topilmalar S-M3, S-M4 | `enrollment.py` |
| F13 | QR / havola, umumiy plakat | registerPeople | VERIFIED | QR dekod qilib tekshirilgan | `qr-plakat.pdf` |
| F14 | HEMIS: holat, tekshirish, sinxron | manageIntegrations | VERIFIED (prod) | oxirgi muvaffaqiyatli 2026-11-14 18:26, har 24 soatda | prod `integration_sync_runs` |
| F15 | HEMIS rasmidan yuz olish | — | OBSOLETE (qaror bilan o'chiq) | buyurtmachi qarori: faqat 3 tomonlama ro'yxat | `config.py` hemis_photo_* |
| F16 | HEMIS davomat sinxroni | — | VERIFIED (prod) | 104 354 yozuv, manba `hemis` | prod `attendance_records` |
| F17 | Telegram bot (ulash, buyruqlar) | manageNotifications | BLOCKED | bot tokeni sozlanmagan | prod: `telegram.is_configured()=False` |
| F18 | Ota-onaga "keldi/kelmadi" xabari | — | MISSING | xabar yaratuvchi jarayon ishga tushmaydi; UI'dagi tugmalar faqat sozlamani ko'rsatadi | `main.py:65-72`; `notify_attendance` chaqiruvchisi yo'q |
| F19 | Tizim ogohlantirishlari (disk, HEMIS, zaxira) | — | PARTIAL | tekshiruv ishlaydi, yetkazish Telegram'ga bog'liq (BLOCKED); panelda ko'rinadi | `system_alerts.py` |
| F20 | Foydalanuvchilar boshqaruvi | manageRoles | PARTIAL | "siz" belgisi va o'z-o'zini o'chirish tugmasi xato (FE-2) | `Users.tsx:64,81` |
| F21 | Ruxsatlar matritsasi | super-admin | PARTIAL | backend bor, UI yo'q; 5 ta kalit ishlatilmaydi | `users.py:387`; `seed.py` |
| F22 | Bino bo'yicha cheklov | manageRoles | BROKEN | saqlanadi, hech qayerda qo'llanmaydi (hozir hech kimga qo'yilmagan) | `access_scope` faqat `users.py` da |
| F23 | Ochiq taqdimot (jonli raqamlar) | ochiq | VERIFIED (prod) | faqat umumiy sonlar | `/api/public/taqdimot` 200 |
| F24 | Kunlik zaxira + panelda holat | — | VERIFIED (prod) | — | `backup.log`, `integration_sync_runs` source=zaxira |
| F25 | Off-site nusxa (D:\Camera-zaxira) | — | VERIFIED | faqat kompyuter yoqiq bo'lsa | Task Scheduler natija 0 |
| F26 | Zaxiradan tiklash | — | MISSING (sinalmagan) | tiklash hech qachon sinab ko'rilmagan | — |
| F27 | iMentor integratsiyasi (`/api/v1/integration`) | API kaliti | UNTESTED (runtime) | kod yaxshi (hmac, limit); prod'da chaqirilayotgani tekshirilmagan | `integration_v1.py` |
| F28 | Maxfiylik (rozilik, o'chirish, eksport) | managePrivacy | PARTIAL | backend bor, UI yo'q | `privacy.py` |
| F29 | Dublikatlarni birlashtirish | registerPeople | PARTIAL | backend bor, UI yo'q (F09 shunga yo'naltiradi) | `students_staff.py:652-887` |
| F30 | Tuzilma (bino, fakultet, guruh) CRUD | manageOrgStructure | PARTIAL | backend bor, UI yo'q | `org_structure.py` |
| F31 | "Situation"/hisobot endpointlari | viewReports | OBSOLETE | yangilanmaydigan jadvallardan o'qiydi, UI yo'q | `situation.py` |
| F32 | Kamera / NVR davomat tahlili (300 kamera) | — | MISSING · DECISION · BLOCKED | NVR manzili noma'lum; aniqlik sinovi o'tkazilmagan | `DECISIONS_AND_BLOCKERS.md` D1–D3 |
