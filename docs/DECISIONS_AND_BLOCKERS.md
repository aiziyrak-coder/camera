# Qarorlar va to'siqlar

Sana: 2026-11-17. Bu yerdagi narsalarni men o'zim hal qila olmayman:
biznes qarori, kirish huquqi yoki tashqi qurilma kerak.

## Qaror kerak

| ID | Savol | Nima uchun muhim | Mening tavsiyam |
|---|---|---|---|
| D1 | 300 kamera tahlili: qaysi kriteriyalar? | Yuk shunga bog'liq | Tanlangan: **davomat + dars davomati** (2026-11-16, egasi) |
| D2 | Video manbai: NVR yozuvi | NVR bor va yozmoqda (egasi, 2026-11-17) | NVR'dan o'qish — serverda alohida yozish shart emas |
| D3 | Suratli tahlil aniqligi qabul mezoni | Yondashuv to'g'riligini isbotlash | ≥80% — davom; 50–80% — ko'p surat; <50% — boshqa yo'l |
| D4 | GitHub'ga push (25 commit) va CI | Kod CI'da tekshirilmagan | Ruxsat bersangiz — push va CI natijasi |
| D5 | Bino bo'yicha cheklov kerakmi? | Hozir ishlamaydi, hech kimga qo'yilmagan | Kerak bo'lmasa — UI'dan olib tashlash |
| D6 | Telegram bot va ota-onaga xabar kerakmi? | UI va'da qiladi, amalda ishlamaydi | Kerak bo'lsa — bot token (BotFather) va davomat manbai (HEMIS davomati asosida) |
| D7 | Administratorlar uchun 2FA majburiy bo'lsinmi? | 8 tadan 1 tasida yoqilgan | Ha (`ADMIN_2FA_REQUIRED=true`) |
| D8 | Parol tiklash xati: SMTP sozlansinmi? | Hozir xat ketmaydi | Ha, yoki tiklash faqat admin orqali |

## To'siqlar (BLOCKED)

| ID | Nima kerak | Kimdan |
|---|---|---|
| B1 | NVR'ning IP manzili (keyin login/parol — ilova sahifasida o'zingiz kiritasiz) | Egasi / o'rnatgan usta |
| B2 | Telegram bot tokeni | Egasi (BotFather) |
| B3 | SMTP hisob ma'lumotlari | Egasi |
| B4 | Suratli tahlil sinovi uchun dars vaqti (08:00–17:00) | Vaqt |
| B5 | nginx konfiguratsiyasini o'zgartirish (CSP) — tizim fayli, sudo kerak | Egasi |
| B6 | Production'ga kodni chiqarish — har bir chiqarish uchun egasining ruxsati | Egasi |

## Qabul qilingan qarorlar (tarix)

- 2026-09-26 / 2026-10-02: yuz faqat 3 tomonlama ro'yxat orqali; HEMIS rasmi bilan tasdiqlash o'chiq.
- 2026-11-12: platforma yuzlar bazasi, HEMIS, Telegram, foydalanuvchilar va iMentor'ga qisqartirildi.
- 2026-11-15: hamma uchun bitta QR; zaxira nusxasi egasining kompyuteriga (D:\Camera-zaxira).
- 2026-11-16: dizayn — bitta asosiy rang (indigo), rang-baranglik yo'q.
