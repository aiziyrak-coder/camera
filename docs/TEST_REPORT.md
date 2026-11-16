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

## Backend — tanlangan to'plam o'tdi, to'liq to'plam CI'da

**Muhit:** production obrazi (`camera-api-api:latest`, prod kutubxonalari)
ichida, serverda **ajratilgan** vaqtinchalik konteynerlar: alohida
Postgres 17 + Redis (o'z tarmog'i, `--cpus 4`, `nice 10`); production
bazasiga ulanish yo'q; ish tugagach konteynerlar, tarmoq va fayllar
o'chirildi. (Lokal obraz qurish Debian mirror sekinligi sabab to'xtatildi.)

**Buyruq:** `python -m pytest -q -p no:cacheprovider --timeout=300` — 17 fayl:
system_alerts, self_registration_approval, security_audit_fixes,
identity_check, enrollment, pinfl_enrollment, presentation, students_staff,
students_staff_delete, students_staff_edit, manual_merge, auth,
auth_session, two_factor, person_dedupe, integration_v1, hemis_schedule.

**Natija:** 230 o'tdi, 1 yiqildi —
`test_enrollment.py::TestEnrollmentSubmit::test_submit_persists_averaged_embedding`
MinIO talab qiladi (`127.0.0.1:9000`, bu muhitda yo'q). O'zgarishlardan
oldingi kod (HEAD) bilan ham aynan shu natija — regressiya emas.

**Topilgan va tuzatilgan test nuqsoni:** 5 ta faylda `pytestmark =
pytest.mark.anyio` testlarni boshqa event loop'da yurgizgan → sessiya
darajasidagi baza ulanishi bilan "attached to a different loop". Ya'ni 2FA,
dublikatlarni birlashtirish, iMentor integratsiyasi, HEMIS jadvali va tizim
ogohlantirishlari testlari **amalda ishlamagan**. Belgi olib tashlangach o'tdi.

**Yangi testlar (1c0540e):** `TestClaimingAListedRecord` (4),
`test_approve_all_leaves_identity_doubts_for_one_by_one_review`,
`test_reset_link_is_not_logged_even_for_users_with_email_when_smtp_is_missing`.

**Ma'lum, hali ko'rilmagan:** `test_real_models.py`, `test_video_tahlil_cli.py`
o'chirilgan modullarni import qiladi; ~25 test fayli faqat o'lik kodni sinaydi.

## Production (faqat o'qish)

`/health` 200; himoyalangan API tokensiz 401; `/docs` 404; `/metrics` 403;
CORS faqat cam.fermi.uz; 24 soatda 0 xato; migratsiya head; zaxira va
off-site nusxa muvaffaqiyatli. Tafsilot: `PROJECT_AUDIT.md` 5-bo'lim.
