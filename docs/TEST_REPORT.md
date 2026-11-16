# Test hisoboti

Sana: 2026-11-17 (1-sikl).

## Frontend — o'tdi

| Tekshiruv | Buyruq | Muhit | Natija |
|---|---|---|---|
| Tiplar | `npx tsc --noEmit -p tsconfig.app.json` | Windows, Node 22.14 | ✅ |
| Unit testlar | `npx vitest run` | jsdom | ✅ 15 fayl, 104 test (paketlar olib tashlangandan keyin ham) |
| Lint | `npx oxlint` | — | ✅ 0 xato, 4 ogohlantirish |
| Build | `npx vite build --assetsDir app` | — | ✅ |
| CI PWA tekshiruvi (qo'lda takrorlandi) | `ci.yml:46-51` | — | ✅ |
| Zaiflik | `npm audit --omit=dev` | — | ✅ 0 (oldin 1 critical) |

**Cheklov:** frontend testlarining bir qismi o'lik koddan (masalan
`integrationsApi.test.ts` — `/api/access/*` funksiyalari) foydalanadi —
ular o'tadi, lekin ishlab turgan funksiyani tekshirmaydi.

## Backend — kutilmoqda

- Lokal `pytest` avval ishlamagan (Postgres yo'q). Endi: lokal Docker'da
  yopiq tarmoqli vaqtinchalik Postgres 17 (`camaudit-db`) va loyihaning
  o'z Dockerfile'idan obraz (`camaudit-api:local`) — qurilmoqda (Debian
  mirror sekin).
- Ma'lum (kod o'qishdan): `test_real_models.py`, `test_video_tahlil_cli.py`
  o'chirilgan modullarni ichkarida import qiladi — ffmpeg bor muhitda
  yiqilishi kutiladi; `test_admin_2fa.py:26`, `test_security_audit_fixes.py:306`,
  `test_security_setup.py:128` o'chirilgan yo'llar 404 bergani uchun
  "to'g'ri sabab bilan emas" o'tadi; ~25 ta test fayli faqat o'lik kodni sinaydi.

## Production (faqat o'qish)

`/health` 200; himoyalangan API tokensiz 401; `/docs` 404; `/metrics` 403;
CORS faqat cam.fermi.uz; 24 soatda 0 xato; migratsiya head; zaxira va
off-site nusxa muvaffaqiyatli. Tafsilot: `PROJECT_AUDIT.md` 5-bo'lim.
