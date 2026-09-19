# Situatsion markaz API (`/api/situation/*`)

Kod: `app/routers/situation.py`, `app/services/situation.py`, `app/schemas/situation.py`.
Testlar: `tests/test_situation_*.py` (dunyo: `tests/situation_world.py`).

Barcha JSON kalitlari **camelCase**. Vaqtlar `"HH:MM"` — Toshkent vaqti (serverda formatlanadi).
Sanalar `"YYYY-MM-DD"`. Noto'g'ri sana → `422`. Topilmasa → `404` (`{"detail": "..."}`).

**Ruxsat:** `manageAttendance` yoki `viewReports` (`/lessons` uchun qo'shimcha `manageLessons` ham yetarli).
Tizimga kirmagan → `401`, huquq yo'q → `403`.

**Kesh:** `overview`, `kafedras` va ichki agregatlar (birliklar, kun darslari, guruh ro'yxati hajmi)
jarayon ichida **15 soniya** sana bo'yicha keshlanadi — tez-tez so'rash (devor ekrani) arzon.

## Umumiy tushunchalar

### `AttendanceStatus` (odamning bir kundagi holati)
`"keldi" | "kech_keldi" | "kelmadi" | "dam_olish" | "kutilmoqda" | "malumot_yoq"`

- yozuv bo'lsa — yozuv holati;
- yozuv yo'q, **yuzi tasdiqlangan** (`biometricsStatus == "tasdiqlangan"`) va sana bugun → `"kutilmoqda"` (hali ko'rinmagan);
- aks holda → `"malumot_yoq"` (o'tgan kun yoki yuzi tizimda yo'q — kamera uni taniy olmaydi).

UI: keldi=success, kech_keldi=warning, kelmadi=danger, kutilmoqda/malumot_yoq=muted.

### `Counts` (bir to'plam odamning kunlik davomati)
```ts
interface Counts {
  total: number;     // faol odamlar (active=true)
  enrolled: number;  // yuzi tasdiqlanganlar — davomati bilinishi mumkin bo'lganlar
  present: number;   // kelganlar (kech kelganlar ham SHU YERDA)
  late: number;      // present ichidan kech kelganlar
  absent: number;    // "kelmadi" yozuvi borlar
  dayOff: number;    // "dam_olish"
  notYet: number;    // tasdiqlangan, bugun hali ko'rinmagan (faqat bugun/kelajak sanada > 0)
  noData: number;    // holatini bilib bo'lmaydiganlar (tasdiqlanmagan yoki o'tgan kunda yozuvsiz)
  rate: number | null; // present / (present + absent + notYet) * 100, 1 xona; asos 0 → null
}
```
`total = present + absent + dayOff + notYet + noData` (late — present ichida).

### `LessonState`: `"upcoming" | "ongoing" | "finished"`
Davomiylik — `settings.lesson_duration_minutes`. Boshlanish vaqti yo'q dars: sana < bugun → finished, aks holda upcoming.

### `TeacherStatus` (o'qituvchi darsga keldimi)
`"oz_vaqtida" | "kechikdi" | "kelmadi" | "kutilmoqda" | "nomalum"`
Manbalar: AI tekshiruvi (`teacherOnTime`) va dars xonasi kamerasidagi tashrif (`teacherArrivedAt`).
Kechikish chegarasi — `settings.attendance_late_to_lesson_grace_minutes`.
- `teacherOnTime === true` yoki xonaga chegara ichida kirgan → `oz_vaqtida`;
- xonaga chegaradan keyin kirgan → `kechikdi`;
- AI "ko'rinmadi" dedi, tashrif yo'q: dars davom etmoqda → `kechikdi`, tugagan → `kelmadi`;
- dars boshlanmagan / chegara o'tmagan → `kutilmoqda`; ma'lumot yo'q (kamera yoki teacherId yo'q) → `nomalum`.

### `Lesson`
```ts
interface Lesson {
  id: string; date: string; subject: string; groupName: string; faculty: string;
  teacher: string; teacherId: string | null; teacherPhotoUrl: string | null;
  startsAt: string | null; endsAt: string | null;       // "09:00"
  room: string | null;      // dars kamerasining nomi
  building: string | null;
  state: LessonState;
  teacherStatus: TeacherStatus;
  teacherArrivedAt: string | null;  // o'qituvchi xonada birinchi ko'ringan payt
  teacherOnTime: boolean | null;    // AI tekshiruvining xom natijasi (null — tekshirilmagan)
  expected: number;   // guruhdagi yuzi tasdiqlangan faol talabalar
  present: number;    // yakunlangan: keldi+kech_keldi; aks holda hozircha ishonchli ko'ringanlar
  late: number;
  absent: number | null;  // yakunlanmagan darsda null (hali noma'lum)
  seen: number;           // ishonchli ko'ringanlar (sightings >= min)
  finalized: boolean;
  attentionScore: number | null;  // o'lchanmagan → null (0 emas)
  activityScore: number | null;
  sleepIncidents: number;
}
```

---

## 1. `GET /api/situation/overview?date=`
```ts
interface Overview {
  date: string; isToday: boolean; generatedAt: string; // "2026-09-19T14:11:38+05:00"
  students: Counts;
  staff: Counts;
  teachers: { scheduled: number; onTime: number; late: number; absent: number; unknown: number };
  // shu kuni darsi bor o'qituvchilar, har biri bir marta: absent — kamida bitta darsga kelmagan,
  // late — kechikkan (kelmagani yo'q), onTime — tekshirilganlarining hammasiga o'z vaqtida.
  lessons: { total: number; finished: number; ongoing: number; upcoming: number; avgAttention: number | null };
  cameras: { total: number; active: number; online: number; videoFlowing: number };
  // active: status=faol; online: faol+tarmoqda; videoFlowing: faol+tarmoqda+tasvir bor
  events: { open: number; today: number; highOpen: number; overdue: number };
  // sinov (is_trial) signallarisiz; open = yangi+jarayonda; today = tanlangan kunda; overdue = ochiq va SLA o'tgan
  byFaculty: Array<Counts & { id: string | null; name: string }>;
  // faqat talabalar; talabasi yo'q fakultetlar ham (total 0, rate null); "Fakultetsiz" (id null) oxirida
  arrivalsByHour: Array<{ hour: number; students: number; staff: number }>;
  // kamida 7..19 soat to'liq (bo'shlari 0), tashqaridagilar ma'lumot bo'lsa qo'shiladi
  lastArrivals: Array<{
    id: string; fullName: string; photoUrl: string | null; initials: string;
    type: "talaba" | "xodim"; unit: string; // talaba — guruh ("DI-2301"), xodim — kafedra/lavozim
    faculty: string | null; time: string; status: string;
  }>; // shu kungi eng oxirgi 10 ta kelish (check-in), yangisi birinchi
}
```

## 2. `GET /api/situation/faculties/{facultyId}?date=`
```ts
interface FacultyDetail {
  id: string; name: string; date: string; isToday: boolean;
  totals: Counts;
  courses: Array<{
    course: number | null; label: string;   // "2-kurs" | "Kurs ko'rsatilmagan"
    groups: GroupStat[];                     // nom bo'yicha
    totals: Counts;                          // guruhi yozilmagan talabalar ("4-kurs") ham shu yerda
  }>; // kurs bo'yicha o'sib boruvchi, null oxirida
}
interface GroupStat extends Counts {
  name: string; facultyId: string | null; faculty: string | null; course: number | null;
  curator: null;  // hozircha ma'lumot yo'q
}
```
Guruh = `group_or_position` dan `split_course` bilan ajratilgan nom ("2-kurs, DI-2301" → "DI-2301").
`student_groups` jadvalidagi, talabasi yo'q guruhlar ham (0 bilan) chiqadi.

## 3. `GET /api/situation/groups?facultyId=&course=&search=&date=`
`GroupStat[]` — tekis ro'yxat, nom bo'yicha. `search` — nomda qism (katta-kichik harf farqsiz).

## 4. `GET /api/situation/groups/{groupName}?date=`
`groupName` URL-encode qilinsin (`/` ham qabul qilinadi).
```ts
interface GroupDetail {
  date: string; isToday: boolean;
  group: { name: string; facultyId: string | null; faculty: string | null; course: number | null; totals: Counts };
  students: Array<{
    id: string; fullName: string; photoUrl: string | null; initials: string;
    status: AttendanceStatus; checkIn: string | null; checkOut: string | null;
    biometricsStatus: "tasdiqlangan" | "kutilmoqda" | "yoq";
  }>; // F.I.Sh. bo'yicha, faqat faol
  lessons: Lesson[];  // shu kungi darslar, boshlanish vaqti bo'yicha
  trend: Array<{ date: string; rate: number | null; present: number; late: number; absent: number }>;
  // 14 kun, eskisi birinchi; yozuvi umuman yo'q kun → rate null
}
```
Guruh topilmasa (talabasi, reestr yozuvi va shu kungi darsi yo'q) → 404.

## 5. `GET /api/situation/kafedras?date=`
```ts
type KafedraStat = {
  id: string;            // Department.id yoki "unassigned"
  name: string; building: string | null; unassigned: boolean;
  staffTotal: number; enrolled: number; present: number; late: number; absent: number;
  dayOff: number; notYet: number; noData: number; rate: number | null;
  lessonsToday: number;           // kafedra o'qituvchilarining shu kungi darslari (teacherId bo'yicha)
  teacherLateLessons: number;     // teacherStatus == "kechikdi"
  teacherMissedLessons: number;   // teacherStatus == "kelmadi"
}[];
```
Xodim kafedraga `group_or_position == Department.name` (katta-kichik harf, bo'shliq, apostrof turlari farqsiz) orqali bog'lanadi.
Nom bo'yicha tartib; mos kelmaganlar — oxirida `"Kafedra biriktirilmagan"` (`id: "unassigned"`), faqat bunday xodim/dars bo'lsa.

## 6. `GET /api/situation/kafedras/{departmentId}?date=&from=&to=`
`departmentId` — uuid yoki `unassigned`. Davr standarti: `to = date`, `from = to − 29 kun` (maks. 366 kun).
```ts
interface KafedraDetail {
  id: string; name: string; building: string | null; unassigned: boolean;
  date: string; isToday: boolean;
  today: Counts;                    // kafedra xodimlarining `date` kungi davomati
  teachers: Array<{
    id: string; fullName: string; photoUrl: string | null; initials: string;
    position: string;               // group_or_position xom holda
    biometricsStatus: string; status: AttendanceStatus; checkIn: string | null; checkOut: string | null;
    // `date` kuni:
    lessonsScheduled: number; lessonsOnTime: number; lessonsLate: number; lessonsMissed: number;
    // davr (from..to):
    periodLessons: number; periodOnTime: number; periodLate: number; periodMissed: number;
    onTimeRate: number | null;      // onTime / (onTime + late + missed) * 100
    avgActivityScore: number | null;
    periodPresentDays: number; periodLateDays: number; periodAbsentDays: number;
  }>; // F.I.Sh. bo'yicha
  period: {
    dateFrom: string; dateTo: string;
    lessons: number; onTime: number; late: number; missed: number; unknown: number;
    onTimeRate: number | null; avgActivityScore: number | null;
    presentDays: number; lateDays: number; absentDays: number;
  };
}
```

## 7. `GET /api/situation/lessons?date=&facultyId=&group=&teacherId=&departmentId=&status=&page=&pageSize=`
`status` = `upcoming | ongoing | finished`. `departmentId` — uuid yoki `unassigned`.
`facultyId` — dars jadvalidagi fakultet NOMI bilan solishtiriladi. Tartib: boshlanish vaqti, keyin guruh.
```ts
interface LessonPage {
  items: Lesson[]; total: number; page: number; pageSize: number; totalPages: number;
  date: string;
  counts: { upcoming: number; ongoing: number; finished: number }; // status filtrisiz (tablar uchun)
}
```
`pageSize` standart 20, maks. 500.

## 8. `GET /api/situation/people/{personId}?from=&to=`
Davr standarti: `to = bugun`, `from = to − 29 kun` (maks. 366 kun, `from > to` → 422).
```ts
interface PersonProfile {
  person: {
    id: string; fullName: string; type: "talaba" | "xodim"; photoUrl: string | null; initials: string;
    facultyId: string | null; faculty: string | null;  // talabada fakultet bo'lmasa "Fakultetsiz"
    unit: string;                       // group_or_position xom holda
    group: string | null; course: number | null;           // talaba
    departmentId: string | null; department: string | null; // xodim (nom bo'yicha topilgan kafedra)
    biometricsStatus: string; parentNotify: boolean; active: boolean;
  };
  dateFrom: string; dateTo: string;
  calendar: Array<{ date: string; status: AttendanceStatus; checkIn: string | null; checkOut: string | null }>;
  // from..min(to, bugun), eskisi birinchi
  totals: {
    days: number; present: number; late: number; absent: number; dayOff: number; noData: number;
    rate: number | null;          // present / (present + absent) * 100
    avgArrival: string | null;    // o'rtacha kelish vaqti "08:41"
  };
  lessons: Array<Lesson & {
    attendanceStatus: "keldi" | "kech_keldi" | "kelmadi" | null; // talaba: shu darsdagi o'z holati (yakunlanmagan → null)
    firstSeen: string | null;                                     // talaba darsda birinchi ko'ringan payt
  }>; // talaba — guruhining davrdagi darslari; xodim — o'zi o'tgan darslar (teacherStatus bilan). Yangisi birinchi, maks. 300
  recentVisits: Array<{
    id: string; date: string; camera: string; building: string | null; zone: string | null;
    firstSeen: string; lastSeen: string; durationMinutes: number; sightings: number;
  }>; // `to` kunining oxirigacha bo'lgan oxirgi 20 tashrif, yangisi birinchi
}
```
