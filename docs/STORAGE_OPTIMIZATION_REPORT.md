# Hajm, saqlash va resurs optimallashtirish hisoboti (17-bosqich)

Sana: 2026-11-17. Holat: **qisman bajarildi** — frontend va repo qismi
tugadi va tekshirildi; backend obrazi o'zgarishi tayyor, obraz qurilib
testdan o'tmaguncha commit qilinmagan.

## 1. Ish papkasi (E:\Camera) — toifalar bo'yicha

| Toifa | Joyi | Hajm | Qaror |
|---|---|---|---|
| **Foydalanuvchi ma'lumoti (PII!)** | `E:\Camera\zaxira\yuzlar-20261112` (yuz rasmlari tar 1.35 GB + baza dump'lari 214 MB) | 1.6 GB | **Tegilmadi.** 2026-11-12 tozalashdan oldingi to'liq zaxira. O'chirish/ko'chirish — faqat egasining qarori (biometrik ma'lumot ochiq diskda) |
| Python muhiti (dev) | `camera-api/.venv` | 1.6 GB | qayta yaratiladi; torch 509 MB, polars 168 MB, sympy 70 MB, mediapipe 46 MB — ishlatilmaydi (pastda) |
| Node paketlari | `node_modules` | 336 → **172 MB** | ✅ 5 ta ishlatilmaydigan paket olib tashlandi |
| Git tarixi | `.git` | 25 MB | tarix qayta yozilmadi (xavfli, ruxsatsiz) |
| Build artifact | `dist` | 1.8 MB → **588 KB** | ✅ ishlatilmaydigan shriftlar chiqdi |
| Kesh | `__pycache__` (12 MB), `.pytest_cache` | ~12 MB | ignore qilingan; zararsiz |
| AI modellar | `yolov8n.pt`, `yolov8n-pose.pt` | 13 MB | ishlatilmaydi; git'da yo'q (`*.pt` ignore); endi obrazga ham tushmaydi |
| Hujjatlar/hisobotlar | `E:\Camera\*.pdf, *.xlsx, *.docx` | ~18 MB | egasining hujjatlari — tegilmadi |

**Dublikatlar (SHA-256):** faqat `dist/` ↔ `public/` (shrift, ikonka) —
build nusxasi, kutilgan. Boshqa takror yo'q.

## 2. Bajarilgan va tekshirilgan (commit `531888a`)

| O'zgarish | Oldin | Keyin | Tekshiruv |
|---|---|---|---|
| Ishlatilmaydigan paketlar: hls.js, jspdf, motion, pdfjs-dist, recharts | 217 paket, 336 MB | 165 paket, 172 MB | `grep` import yo'q; tsc ✅, vitest 104/104 ✅, oxlint 0 xato ✅, build ✅ |
| npm audit (prod) | 1 critical (dompurify ← jspdf) | **0** | `npm audit --omit=dev` |
| Git'dagi 9 ta `.tgz` deploy arxivi (2026-10-05 tasodifan) | kuzatilgan fayllar 21.3 MB | **3.8 MB** | hech qayerda murojaat yo'q; git tarixida qoladi (qaytarish: `git checkout 531888a~1 -- <fayl>`) |
| `public/fonts` (NotoSans, o'chirilgan PDF hisobot uchun) | 1.2 MB | 0 | `src`, `index.html`, `sw.js` da murojaat yo'q; CI PWA tekshiruvi ✅ |
| `.gitignore`: `*.tgz` | — | — | — |
| `.dockerignore`: `*.pt, *.task, *.tgz, *.xlsx, nvr-eksport/` | YOLO og'irliklari obrazga tushardi | tushmaydi | — |
| JS bundle | 265 KB (gzip 84) | 265 KB | o'zgarmadi — olib tashlangan paketlar baribir import qilinmagan edi |

## 3. Tayyorlangan, hali tasdiqlanmagan (commit qilinmagan)

**Backend obrazidan torch, ultralytics, mediapipe ni olib tashlash.**
- Dalil: `app/` da faqat `gpu_status.py:24` va `thread_limits.py:40` da
  `import torch` — ikkalasi `ImportError` ni kutadi va torch'siz ishlaydi.
  `ultralytics`, `mediapipe` — import yo'q.
- Ular bilan ketadigan bog'liqliklar: torchvision, sympy, polars,
  matplotlib, opencv-contrib.
- Production obrazi hozir **3.95 GB** (api va ai-worker). Kutilgan
  tejash ~0.8–1.2 GB — **taxmin, obraz qurilgach o'lchanadi**.
- Shart: toza Postgres'da backend testlari eski va yangi obrazda bir xil
  natija bersin (`TEST_REPORT.md`). Keyin production'ga chiqarish —
  egasining ruxsati bilan.

## 4. Frontend tahlili

- Har sahifa alohida bo'lak (lazy route): Dashboard 9 KB, Faces 24 KB,
  Enroll 21 KB, Taqdimot 63 KB.
- Asosiy bo'lak 265 KB (react, react-dom, router, kit) — keyingi qadam:
  `lucide-react` faqat nomli importlar (tree-shaking ishlaydi), qo'shimcha
  bo'lish foydasi kichik; o'lchab ko'rmasdan o'zgartirilmadi.
- Shrift Google Fonts'dan (Inter) — lokal nusxa yo'q.

## 5. Production server (o'lchandi, o'zgartirilmadi)

- `docker system df`: obrazlar 68.8 GB (25.1 GB qaytariladigan), build kesh
  100.9 GB (21.2 GB qaytariladigan) — **butun server bo'yicha, 23 loyiha**.
  `docker system prune` taqiqlangan (boshqa loyihalar). Bu loyiha uchun
  xavfsiz qadam: eski `camera-api` obraz teglarini aniqlab, faqat ularni
  o'chirish — egasining ruxsati bilan.
- RAM: api 771 MB, ai-worker 523 MB; CPU ~0.1–0.4% (dam olish holatida).
