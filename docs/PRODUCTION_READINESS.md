# Production'ga tayyorlik darvozasi

Sana: 2026-11-17 · **Holat: NOT READY**

| Mezon | Holat | Dalil / sabab |
|---|---|---|
| Reliz doirasidagi asosiy oqimlar tekshirilgan | ❌ | ro'yxatdan o'tish, tasdiqlash, HEMIS — qisman (FEATURE_INVENTORY) |
| O'lik tugmalar yo'q | ⚠️ | HEMIS odamini o'chirish (F09), "Birlashtirish" yo'q |
| Ruxsatlar tekshirilgan | ⚠️ | backend'da har endpointda bor; bino cheklovi ishlamaydi (S-M9) |
| Toza production build | ✅ | frontend build, tsc |
| Testlar o'tadi | ⚠️ | frontend 104/104 ✅; backend — kutilmoqda (TEST_REPORT) |
| Kod CI'dan o'tgan | ❌ | 25+ commit push qilinmagan (D4) |
| Migratsiyalar tekshirilgan | ✅ | prod `z5a2b3c4d5e6` = head |
| Kritik integratsiyalar | ⚠️ | HEMIS ✅; Telegram ❌ (token yo'q); SMTP ❌; iMentor — tekshirilmagan |
| Deploy va rollback tekshirilgan | ❌ | rollback sinalmagan; OPS-1 (ai-worker yangilanmaydi) |
| Reliz to'sig'i bo'lgan zaiflik yo'q | ❌ | S-H1, S-H2 ochiq |
| Sirlar va ma'lumot himoyasi | ⚠️ | S-M1 (reset havolasi log'da), CSP majburiy emas |
| Kuzatuv va tiklash | ⚠️ | zaxira ✅, off-site ✅; **tiklash hech qachon sinalmagan** (T06) |
| Unumdorlik maqsadlari | — | maqsadlar hali belgilanmagan |
| Hujjatlar | ⚠️ | audit hujjatlari bor; foydalanuvchi qo'llanmasi yo'q |
| Mijoz qabuli va reliz ruxsati | ❌ | — |

Keyingi darvoza: **READY FOR STAGING** — S-H1, S-H2, S-M1 tuzatilgan,
backend testlari o'tgan, CI yashil, zaxiradan tiklash sinalgan.
