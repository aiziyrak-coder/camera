"""Hisobotlar (`/api/hisobot`): xodimlar va talabalar — alohida.

Bitta so'rov bitta hisobotni to'liq qaytaradi: yon paneldagi mezonlar
(har biri qisqa ko'rsatkich bilan), tanlangan mezon bo'yicha plitkalar,
kunlik trend, bo'linma/guruh kesimi va "eng muammoli birinchi" odamlar.

Aholi (population) har doim bir tur: `talaba` yoki `xodim` — sonlar,
filtrlar va mezonlar hech qachon aralashmaydi.

Filtrlar:
  talaba — fakultet -> kurs -> guruh (kurs va guruh group_or_position
           matnidan: "2-kurs, DI-2301"); yo'nalish ma'lumoti bazada yo'q.
  xodim  — bo'linma turi (kafedra / dekanat / bo'lim / lavozim) -> bo'linma
           (app/services/situation.build_catalog bilan bir xil).

HALOLLIK: faqat tizim haqiqatan o'lchaydigan mezonlar. Odamga bog'lanmagan
signal (masalan oq xalat — hodisada odam ismi yozilmaydi) odamlar
jadvalisiz, faqat umumiy son va bino kesimi bilan ko'rsatiladi.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date as date_type, datetime, time as time_type, timedelta
from typing import Any, Callable, Iterable

from sqlalchemy import and_, false, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIModuleConfig, AttendanceRecord, Event, LessonAttendance, LessonSession, StudentStaff
from app.services import situation as svc
from app.services.attendance_policy import Policy, load_policy
from app.services.event_status import REJECTED_STATUSES, fold_review_counts
from app.services.staff_export import split_course
from app.timezone import INSTITUTE_TZ, INSTITUTE_TZ_NAME

KINDS = ("talaba", "xodim")
PRESENT = ("keldi", "kech_keldi")
PEOPLE_LIMIT = 300
NO_FACULTY = "none"
NO_FACULTY_LABEL = "Fakultetsiz"
NO_GROUP_LABEL = "Guruh ko'rsatilmagan"
UNIT_KIND_LABELS = {"kafedra": "Kafedralar", "dekanat": "Dekanatlar", "bolim": "Bo'limlar", "lavozim": "Lavozim bo'yicha"}

STAFF_ATTENDANCE_CODE = 6
STUDENT_ATTENDANCE_CODE = 7
OFF_HOURS_CODE = 3
COAT_CODE = 10
SLEEP_CODE = 20
PUNCTUALITY_CODE = 22


# ─────────────────────────────────────────── aholi va filtrlar

@dataclass(frozen=True)
class Member:
    id: uuid.UUID
    name: str
    raw: str | None  # group_or_position
    faculty_id: uuid.UUID | None
    photo_key: str | None
    enrolled: bool


@dataclass
class Filters:
    faculty: str | None = None  # uuid yoki "none"
    course: int | None = None
    group: str | None = None
    unit_kind: str | None = None
    unit: str | None = None
    q: str | None = None

    def sql_faculty(self):
        if not self.faculty:
            return None
        if self.faculty == NO_FACULTY:
            return StudentStaff.faculty_id.is_(None)
        try:
            return StudentStaff.faculty_id == uuid.UUID(self.faculty)
        except ValueError:
            return StudentStaff.id.is_(None)  # noto'g'ri id — bo'sh natija


async def population(db: AsyncSession, kind: str) -> list[Member]:
    """Faol aholi (talabalar ~10k, xodimlar ~800) — 15 soniya keshlanadi."""

    async def load() -> list[Member]:
        rows = await db.execute(
            select(StudentStaff.id, StudentStaff.full_name, StudentStaff.group_or_position, StudentStaff.faculty_id,
                   StudentStaff.biometric_photo_key, StudentStaff.biometrics_status == "tasdiqlangan")
            .where(StudentStaff.type == kind)
            .where(StudentStaff.active.is_(True))
        )
        return [Member(*row) for row in rows.all()]

    return await svc.cached(("hisobot_population", kind), load)


def student_course_group(raw: str | None) -> tuple[int | None, str]:
    return split_course(raw)


def filter_members(members: Iterable[Member], kind: str, f: Filters,
                   unit_of: Callable[[str | None], svc.UnitInfo] | None = None) -> list[Member]:
    """Sof funksiya: fakultet/kurs/guruh (talaba) yoki bo'linma (xodim) va ism."""
    needle = svc.norm_name(f.q) if f.q else ""
    group_key = svc.norm_name(f.group) if f.group else ""
    out = []
    for m in members:
        if kind == "talaba":
            if f.faculty:
                if f.faculty == NO_FACULTY:
                    if m.faculty_id is not None:
                        continue
                elif str(m.faculty_id) != f.faculty:
                    continue
            if f.course is not None or group_key:
                course, group = student_course_group(m.raw)
                if f.course is not None and course != f.course:
                    continue
                if group_key and svc.norm_name(group) != group_key:
                    continue
        elif unit_of is not None and (f.unit_kind or f.unit):
            info = unit_of(m.raw)
            if f.unit and info.id != f.unit:
                continue
            if f.unit_kind and info.kind != f.unit_kind:
                continue
        if needle and needle not in svc.norm_name(m.name):
            continue
        out.append(m)
    return out


@dataclass(frozen=True)
class GroupKey:
    id: str
    name: str


def breakdown_level(kind: str, f: Filters, faculty_names: dict, unit_of) -> tuple[str, Callable[[Member], GroupKey]]:
    """Kesim darajasi: tanlangan filtrdan bir pog'ona pastroq."""
    if kind == "talaba":
        if not f.faculty:
            def by_faculty(m: Member) -> GroupKey:
                if m.faculty_id is None:
                    return GroupKey(NO_FACULTY, NO_FACULTY_LABEL)
                return GroupKey(str(m.faculty_id), faculty_names.get(m.faculty_id, NO_FACULTY_LABEL))
            return "Fakultetlar kesimida", by_faculty
        if f.course is None and not f.group:
            def by_course(m: Member) -> GroupKey:
                course, _ = student_course_group(m.raw)
                return GroupKey(str(course or 0), f"{course}-kurs" if course else "Kurs ko'rsatilmagan")
            return "Kurslar kesimida", by_course

        def by_group(m: Member) -> GroupKey:
            _, group = student_course_group(m.raw)
            return GroupKey(group or "", group or NO_GROUP_LABEL)
        return "Guruhlar kesimida", by_group

    def by_unit(m: Member) -> GroupKey:
        info = unit_of(m.raw)
        return GroupKey(info.id, info.name)
    return "Bo'linmalar kesimida", by_unit


# ─────────────────────────────────────────── o'lchovlar

@dataclass
class Att:
    present: int = 0
    late: int = 0
    absent: int = 0
    late_minutes: int = 0
    early: int = 0
    checked_out: int = 0  # erta ketishni baholash mumkin bo'lgan kunlar

    def add(self, other: "Att") -> "Att":
        for name in ("present", "late", "absent", "late_minutes", "early", "checked_out"):
            setattr(self, name, getattr(self, name) + getattr(other, name))
        return self

    @property
    def rate(self) -> float | None:
        return svc.pct(self.present, self.present + self.absent)


@dataclass
class Tri:
    """Uch holatli sanoq: dars qatnashuvi yoki o'qituvchining darsga kelishi."""
    ok: int = 0
    late: int = 0
    miss: int = 0

    def add(self, other: "Tri") -> "Tri":
        self.ok += other.ok
        self.late += other.late
        self.miss += other.miss
        return self

    @property
    def total(self) -> int:
        return self.ok + self.late + self.miss

    @property
    def rate(self) -> float | None:
        return svc.pct(self.ok + self.late, self.total)


@dataclass
class Data:
    kind: str
    start: date_type
    end: date_type
    policy: Policy
    members: list[Member]
    att: dict[uuid.UUID, Att] = field(default_factory=dict)
    att_daily: dict[date_type, Att] = field(default_factory=dict)
    lessons: dict[uuid.UUID, Tri] = field(default_factory=dict)
    lessons_daily: dict[date_type, Tri] = field(default_factory=dict)
    events: dict[int, dict[uuid.UUID, int]] = field(default_factory=dict)
    events_daily: dict[int, Counter] = field(default_factory=dict)
    coat_status: dict[str, int] = field(default_factory=dict)
    coat_daily: Counter = field(default_factory=Counter)
    coat_buildings: Counter = field(default_factory=Counter)
    active_modules: set[int] = field(default_factory=set)


def _minutes(column):
    return func.extract("hour", column) * 60 + func.extract("minute", column)


def _local_day(column):
    return func.date(func.timezone(literal_column(f"'{INSTITUTE_TZ_NAME}'"), column))


def _bounds(start: date_type, end: date_type) -> tuple[datetime, datetime]:
    return (datetime.combine(start, time_type.min, tzinfo=INSTITUTE_TZ),
            datetime.combine(end + timedelta(days=1), time_type.min, tzinfo=INSTITUTE_TZ))


async def _attendance(db: AsyncSession, data: Data, cond) -> None:
    policy, kind = data.policy, data.kind
    start_t = policy.start_for(kind)
    start_min = start_t.hour * 60 + start_t.minute
    end_min = policy.work_end.hour * 60 + policy.work_end.minute
    today = svc.today()
    status = AttendanceRecord.status
    present = status.in_(PRESENT)
    # Erta ketish: oxirgi ko'rilgan payt (check_out) ish tugashidan oldin,
    # faqat o'tgan ish kunlari (bugungi check_out hali yakuniy emas).
    can_judge = and_(present, AttendanceRecord.check_out.is_not(None), AttendanceRecord.date < today,
                     func.extract("isodow", AttendanceRecord.date).in_(policy.work_days))
    early = and_(can_judge, _minutes(AttendanceRecord.check_out) < end_min)
    late_min = func.coalesce(func.sum(_minutes(AttendanceRecord.check_in) - start_min).filter(
        and_(status == "kech_keldi", AttendanceRecord.check_in.is_not(None))), 0)
    cols = (func.count().filter(present), func.count().filter(status == "kech_keldi"),
            func.count().filter(status == "kelmadi"), late_min, func.count().filter(early),
            func.count().filter(can_judge))
    base = (
        select(*cols)
        .select_from(AttendanceRecord)
        .join(StudentStaff, StudentStaff.id == AttendanceRecord.student_staff_id)
        .where(cond)
        .where(AttendanceRecord.date.between(data.start, min(data.end, today)))
    )
    per_person = base.add_columns(AttendanceRecord.student_staff_id).group_by(AttendanceRecord.student_staff_id)
    for *vals, pid in (await db.execute(per_person)).all():
        data.att[pid] = Att(*(int(v) for v in vals))
    per_day = base.add_columns(AttendanceRecord.date).group_by(AttendanceRecord.date)
    for *vals, day in (await db.execute(per_day)).all():
        data.att_daily[day] = Att(*(int(v) for v in vals))


def _tri_cols(ok, late, miss):
    return func.count().filter(ok), func.count().filter(late), func.count().filter(miss)


async def _student_lessons(db: AsyncSession, data: Data, cond) -> None:
    st = LessonAttendance.status
    base = (
        select(*_tri_cols(st == "keldi", st == "kech_keldi", st == "kelmadi"))
        .select_from(LessonAttendance)
        .join(LessonSession, LessonSession.id == LessonAttendance.lesson_session_id)
        .join(StudentStaff, StudentStaff.id == LessonAttendance.student_staff_id)
        .where(cond)
        .where(LessonSession.date.between(data.start, data.end))
    )
    for *vals, pid in (await db.execute(base.add_columns(LessonAttendance.student_staff_id)
                                        .group_by(LessonAttendance.student_staff_id))).all():
        data.lessons[pid] = Tri(*vals)
    for *vals, day in (await db.execute(base.add_columns(LessonSession.date).group_by(LessonSession.date))).all():
        data.lessons_daily[day] = Tri(*vals)


async def _teacher_lessons(db: AsyncSession, data: Data, cond) -> None:
    """O'qituvchining darsga kelishi (#22): teacher_on_time True/False —
    tekshirilmagan (NULL) darslar hisobga kirmaydi."""
    on_time = LessonSession.teacher_on_time
    base = (
        select(*_tri_cols(on_time.is_(True), false(), on_time.is_(False)))
        .select_from(LessonSession)
        .join(StudentStaff, StudentStaff.id == LessonSession.teacher_id)
        .where(cond)
        .where(on_time.is_not(None))
        .where(LessonSession.date.between(data.start, data.end))
    )
    for *vals, pid in (await db.execute(base.add_columns(LessonSession.teacher_id)
                                        .group_by(LessonSession.teacher_id))).all():
        data.lessons[pid] = Tri(*vals)
    for *vals, day in (await db.execute(base.add_columns(LessonSession.date).group_by(LessonSession.date))).all():
        data.lessons_daily[day] = Tri(*vals)


async def _named_events(db: AsyncSession, data: Data, code: int) -> None:
    """Odam ismi yozilgan signallar (#3, #20) — ism bo'yicha odamga bog'lanadi.
    Rad etilgan signal hisobga kirmaydi."""
    lo, hi = _bounds(data.start, data.end)
    rows = await db.execute(
        select(Event.person_name, _local_day(Event.occurred_at), func.count())
        .where(Event.module_code == code)
        .where(Event.is_trial.is_(False))
        .where(Event.status.not_in(REJECTED_STATUSES))
        .where(Event.person_name.is_not(None))
        .where(Event.occurred_at >= lo, Event.occurred_at < hi)
        .group_by(Event.person_name, _local_day(Event.occurred_at))
    )
    by_name: dict[str, list[uuid.UUID]] = defaultdict(list)
    for m in data.members:
        by_name[svc.norm_name(m.name)].append(m.id)
    per_person: Counter = Counter()
    daily: Counter = Counter()
    for name, day, count in rows.all():
        ids = by_name.get(svc.norm_name(name))
        if not ids:
            continue
        for pid in ids:
            per_person[pid] += count
        daily[day] += count
    data.events[code] = dict(per_person)
    data.events_daily[code] = daily


async def _coat_events(db: AsyncSession, data: Data) -> None:
    lo, hi = _bounds(data.start, data.end)
    rows = await db.execute(
        select(Event.status, _local_day(Event.occurred_at), Event.building, func.count())
        .where(Event.module_code == COAT_CODE)
        .where(Event.is_trial.is_(False))
        .where(Event.occurred_at >= lo, Event.occurred_at < hi)
        .group_by(Event.status, _local_day(Event.occurred_at), Event.building)
    )
    by_status: Counter = Counter()
    for st, day, building, count in rows.all():
        by_status[st] += count
        if st not in REJECTED_STATUSES:
            data.coat_daily[day] += count
            data.coat_buildings[building or "Bino ko'rsatilmagan"] += count
    data.coat_status = fold_review_counts(by_status)


async def collect(db: AsyncSession, kind: str, start: date_type, end: date_type, f: Filters,
                  scope_members: list[Member], members: list[Member]) -> Data:
    data = Data(kind, start, end, await load_policy(db), members)
    data.active_modules = set((await db.execute(
        select(AIModuleConfig.code).where(AIModuleConfig.active.is_(True)))).scalars().all())
    # SQL doirasi: tur + faol (+ fakultet). Qolgan filtrlar Pythonda —
    # agar ular aholini toraytirgan bo'lsa, id ro'yxati qo'shiladi.
    cond = and_(StudentStaff.type == kind, StudentStaff.active.is_(True))
    faculty_cond = f.sql_faculty() if kind == "talaba" else None
    if faculty_cond is not None:
        cond = and_(cond, faculty_cond)
    if len(members) < len(scope_members):
        cond = and_(cond, StudentStaff.id.in_([m.id for m in members]) if members else StudentStaff.id.is_(None))

    await _attendance(db, data, cond)
    if kind == "talaba":
        await _student_lessons(db, data, cond)
        await _named_events(db, data, SLEEP_CODE)
    else:
        await _teacher_lessons(db, data, cond)
        await _named_events(db, data, OFF_HOURS_CODE)
        await _coat_events(db, data)
    return data


# ─────────────────────────────────────────── mezonlar

def _fmt_pct(value: float | None) -> str:
    return "—" if value is None else f"{value:g}%".replace(".", ",")


def _days(start: date_type, end: date_type) -> list[date_type]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _tile(label: str, value: Any, unit: str = "", hint: str | None = None, tone: str = "neutral") -> dict:
    return {"label": label, "value": value, "unit": unit, "hint": hint, "tone": tone}


def _rate_tone(rate: float | None) -> str:
    if rate is None:
        return "neutral"
    return "success" if rate >= 90 else "warning" if rate >= 75 else "danger"


@dataclass
class Criterion:
    key: str
    label: str
    description: str
    kinds: tuple[str, ...]


CRITERIA = [
    Criterion("davomat", "Davomat", "Kelgan va kelmagan kunlar ulushi", KINDS),
    Criterion("kechikish", "Kechikish", "Ish/dars boshlanishidan kech kelishlar", KINDS),
    Criterion("erta_ketish", "Erta ketish", "Ish tugashidan oldin oxirgi marta ko'rilgan kunlar", ("xodim",)),
    Criterion("dars_otkazish", "Darsga o'z vaqtida kirish", "Jadvaldagi darsga o'qituvchining kelishi (#22)",
              ("xodim",)),
    Criterion("dars_qatnashish", "Darsga qatnashish", "Dars jadvali bo'yicha qatnashuv", ("talaba",)),
    Criterion("forma", "Forma (oq xalat)", "Oq xalatsiz ko'rilgan xodimlar signallari (#10)", ("xodim",)),
    Criterion("tashqari_kirish", "Ish vaqtidan tashqari kirish", "Kechki va dam olish kunidagi kirishlar (#3)",
              ("xodim",)),
    Criterion("uxlash", "Darsda uxlash", "Tanilgan talabaning darsda uxlab qolishi (#20)", ("talaba",)),
]


def criteria_for(kind: str) -> list[Criterion]:
    return [c for c in CRITERIA if kind in c.kinds]


def _sum_att(data: Data, members: Iterable[Member]) -> Att:
    total = Att()
    for m in members:
        if m.id in data.att:
            total.add(data.att[m.id])
    return total


def _sum_tri(data: Data, members: Iterable[Member]) -> Tri:
    total = Tri()
    for m in members:
        if m.id in data.lessons:
            total.add(data.lessons[m.id])
    return total


def indicator(data: Data, key: str) -> tuple[str, str]:
    """Yon paneldagi qisqa ko'rsatkich va uning rangi."""
    members = data.members
    if key == "davomat":
        rate = _sum_att(data, members).rate
        return _fmt_pct(rate), _rate_tone(rate)
    if key == "kechikish":
        n = _sum_att(data, members).late
        return str(n), "warning" if n else "neutral"
    if key == "erta_ketish":
        n = _sum_att(data, members).early
        return str(n), "warning" if n else "neutral"
    if key in ("dars_otkazish", "dars_qatnashish"):
        rate = _sum_tri(data, members).rate
        return _fmt_pct(rate), _rate_tone(rate)
    if key == "forma":
        n = sum(data.coat_daily.values())
        return str(n), "danger" if n else "neutral"
    code = OFF_HOURS_CODE if key == "tashqari_kirish" else SLEEP_CODE
    n = sum(data.events.get(code, {}).values())
    return str(n), "danger" if n else "neutral"


def note_for(data: Data, key: str) -> str | None:
    att_code = STAFF_ATTENDANCE_CODE if data.kind == "xodim" else STUDENT_ATTENDANCE_CODE
    if key in ("davomat", "kechikish", "erta_ketish"):
        if att_code not in data.active_modules:
            return "Davomat moduli o'chirilgan — yangi yozuvlar yig'ilmaydi."
        if not any(m.enrolled for m in data.members):
            return "Tanlangan odamlarning birortasining yuzi ro'yxatga olinmagan — kamera ularni taniy olmaydi."
        if key == "erta_ketish" and not data.policy.track_last_seen:
            return "Oxirgi ko'rilgan vaqt yozilmayapti (ish vaqti sozlamasi) — erta ketish aniqlanmaydi."
    if key == "dars_otkazish":
        if PUNCTUALITY_CODE not in data.active_modules:
            return "O'qituvchining darsga kelishi moduli (#22) o'chirilgan."
        if not data.lessons_daily:
            return "Bu davrda tekshirilgan dars yo'q — dars jadvali (o'qituvchi, xona kamerasi) kiritilmagan bo'lishi mumkin."
    if key == "dars_qatnashish" and not data.lessons_daily:
        return "Bu davrda dars davomati yig'ilmagan — dars jadvali kiritilmagan."
    if key == "forma":
        if COAT_CODE not in data.active_modules:
            return "Oq xalat moduli (#10) o'chirilgan."
        return "Signalda odam ismi yozilmaydi — shu sabab bo'linma va ism filtrlari bu mezonga ta'sir qilmaydi."
    if key == "tashqari_kirish" and OFF_HOURS_CODE not in data.active_modules:
        return "Ish vaqtidan tashqari kirish moduli (#3) o'chirilgan."
    if key == "uxlash" and SLEEP_CODE not in data.active_modules:
        return "Uxlab qolish moduli (#20) o'chirilgan."
    return None


@dataclass
class Spec:
    """Mezonning odam/guruh qiymati va ko'rinishi."""
    columns: list[dict]
    values: Callable[[uuid.UUID], dict | None]  # None — bu odam bo'yicha ma'lumot yo'q
    sort_key: str
    worst_desc: bool  # True — katta qiymat yomon
    group_value: Callable[[list[Member]], tuple[float | int | None, str]]
    group_unit: str


def _att_values(data: Data):
    def values(pid):
        a = data.att.get(pid)
        if a is None or a.present + a.absent == 0:
            return None
        return {"rate": a.rate, "present": a.present, "late": a.late, "absent": a.absent,
                "late_avg": round(a.late_minutes / a.late) if a.late else None, "early": a.early}
    return values


def spec_for(data: Data, key: str) -> Spec | None:
    col = lambda k, label, unit="", better="down": {"key": k, "label": label, "unit": unit, "better": better}  # noqa: E731
    if key == "davomat":
        def gv(ms):
            a = _sum_att(data, ms)
            return a.rate, f"{a.present} keldi · {a.absent} kelmadi"
        return Spec([col("rate", "Davomat", "%", "up"), col("present", "Keldi", "kun", "up"),
                     col("late", "Kechikdi", "kun"), col("absent", "Kelmadi", "kun")],
                    _att_values(data), "rate", False, gv, "%")
    if key == "kechikish":
        base = _att_values(data)

        def values(pid):
            v = base(pid)
            return v if v and v["late"] else None

        def gv(ms):
            a = _sum_att(data, ms)
            return a.late, f"{_fmt_pct(svc.pct(a.late, a.present))} kelganlardan"
        return Spec([col("late", "Kechikdi", "kun"), col("late_avg", "O'rtacha", "daq"),
                     col("present", "Kelgan kunlar", "kun", "up")], values, "late", True, gv, "ta")
    if key == "erta_ketish":
        base = _att_values(data)

        def values(pid):
            v = base(pid)
            return v if v and v["early"] else None

        def gv(ms):
            a = _sum_att(data, ms)
            return a.early, f"{_fmt_pct(svc.pct(a.early, a.checked_out))} baholangan kunlardan"
        return Spec([col("early", "Erta ketdi", "kun"), col("present", "Kelgan kunlar", "kun", "up")],
                    values, "early", True, gv, "ta")
    if key in ("dars_otkazish", "dars_qatnashish"):
        teacher = key == "dars_otkazish"

        def values(pid):
            t = data.lessons.get(pid)
            if t is None or t.total == 0:
                return None
            return {"rate": t.rate, "ok": t.ok, "late": t.late, "miss": t.miss, "total": t.total}

        def gv(ms):
            t = _sum_tri(data, ms)
            return t.rate, f"{t.total} dars"
        cols = [col("rate", "O'z vaqtida" if teacher else "Qatnashuv", "%", "up"), col("total", "Darslar", "ta", "none")]
        cols += ([col("miss", "Kelmagan/kechikkan", "ta")] if teacher
                 else [col("late", "Kechikdi", "ta"), col("miss", "Qatnashmadi", "ta")])
        return Spec(cols, values, "rate", False, gv, "%")
    if key in ("tashqari_kirish", "uxlash"):
        counts = data.events.get(OFF_HOURS_CODE if key == "tashqari_kirish" else SLEEP_CODE, {})

        def values(pid):
            n = counts.get(pid, 0)
            return {"events": n} if n else None

        def gv(ms):
            n = sum(counts.get(m.id, 0) for m in ms)
            return n, f"{sum(1 for m in ms if counts.get(m.id))} kishi"
        return Spec([col("events", "Signallar", "ta")], values, "events", True, gv, "ta")
    return None  # forma — odamga bog'lanmaydi


def _trend(data: Data, key: str) -> dict:
    days = [d for d in _days(data.start, min(data.end, svc.today()))]
    points = []
    for day in days:
        if key == "davomat":
            a = data.att_daily.get(day)
            value = a.rate if a else None
        elif key == "kechikish":
            value = data.att_daily[day].late if day in data.att_daily else 0
        elif key == "erta_ketish":
            value = data.att_daily[day].early if day in data.att_daily else 0
        elif key in ("dars_otkazish", "dars_qatnashish"):
            t = data.lessons_daily.get(day)
            value = t.rate if t else None
        elif key == "forma":
            value = data.coat_daily.get(day, 0)
        else:
            code = OFF_HOURS_CODE if key == "tashqari_kirish" else SLEEP_CODE
            value = data.events_daily.get(code, Counter()).get(day, 0)
        points.append({"date": day.isoformat(), "value": value})
    rate = key in ("davomat", "dars_otkazish", "dars_qatnashish")
    return {"unit": "%" if rate else "ta", "points": points}


def _tiles(data: Data, key: str) -> list[dict]:
    ms = data.members
    enrolled = sum(1 for m in ms if m.enrolled)
    if key in ("davomat", "kechikish", "erta_ketish"):
        a = _sum_att(data, ms)
        people_with = [data.att[m.id] for m in ms if m.id in data.att]
        if key == "davomat":
            return [
                _tile("Davomat", _fmt_pct(a.rate), hint=f"{a.present + a.absent} kun-yozuvdan", tone=_rate_tone(a.rate)),
                _tile("Keldi", a.present, "kun", f"{a.late} tasi kechikib", "success"),
                _tile("Kelmadi", a.absent, "kun", f"{sum(1 for p in people_with if p.absent)} kishi", "danger"),
                _tile("Kuzatuvda", enrolled, "kishi", f"{len(ms)} kishidan yuzi ro'yxatda", "info"),
            ]
        if key == "kechikish":
            late_people = sum(1 for p in people_with if p.late)
            return [
                _tile("Kechikishlar", a.late, "ta", f"{_fmt_pct(svc.pct(a.late, a.present))} kelgan kunlardan",
                      "warning"),
                _tile("Kechikkanlar", late_people, "kishi", f"{len(people_with)} kishidan", "warning"),
                _tile("O'rtacha kechikish", round(a.late_minutes / a.late) if a.late else "—", "daq",
                      f"Boshlanish {data.policy.start_for(data.kind).strftime('%H:%M')}, "
                      f"+{data.policy.grace_minutes} daq ruxsat"),
                _tile("O'z vaqtida", a.present - a.late, "kun", None, "success"),
            ]
        early_people = sum(1 for p in people_with if p.early)
        return [
            _tile("Erta ketishlar", a.early, "ta", f"{_fmt_pct(svc.pct(a.early, a.checked_out))} baholangan kunlardan",
                  "warning"),
            _tile("Erta ketganlar", early_people, "kishi", f"{len(people_with)} kishidan", "warning"),
            _tile("Ish tugashi", data.policy.work_end.strftime("%H:%M"), "", "Sozlamalar → Ish vaqti"),
            _tile("Baholangan kunlar", a.checked_out, "kun", "Bugungi kun hisobga kirmaydi"),
        ]
    if key in ("dars_otkazish", "dars_qatnashish"):
        t = _sum_tri(data, ms)
        who = sum(1 for m in ms if m.id in data.lessons)
        if key == "dars_otkazish":
            return [
                _tile("O'z vaqtida", _fmt_pct(t.rate), hint=f"{t.total} tekshirilgan darsdan", tone=_rate_tone(t.rate)),
                _tile("O'z vaqtida kirgan", t.ok, "dars", None, "success"),
                _tile("Kelmagan / kechikkan", t.miss, "dars", None, "danger"),
                _tile("O'qituvchilar", who, "kishi", "Tekshirilgan darsi bor", "info"),
            ]
        return [
            _tile("Qatnashuv", _fmt_pct(t.rate), hint=f"{t.total} dars-yozuvdan", tone=_rate_tone(t.rate)),
            _tile("Qatnashdi", t.ok, "ta", None, "success"),
            _tile("Kechikdi", t.late, "ta", None, "warning"),
            _tile("Qatnashmadi", t.miss, "ta", f"{who} talaba bo'yicha", "danger"),
        ]
    if key == "forma":
        s = data.coat_status
        return [
            _tile("Signallar", sum(data.coat_daily.values()), "ta", "Rad etilganlarsiz", "danger"),
            _tile("Tasdiqlangan", s.get("tasdiqlangan", 0), "ta", None, "danger"),
            _tile("Ko'rilmagan", s.get("yangi", 0), "ta", None, "warning"),
            _tile("Rad etilgan", s.get("rad_etilgan", 0), "ta", "Xato signal", "neutral"),
        ]
    code = OFF_HOURS_CODE if key == "tashqari_kirish" else SLEEP_CODE
    counts = data.events.get(code, {})
    ids = {m.id for m in ms}
    total = sum(n for pid, n in counts.items() if pid in ids)
    people = sum(1 for pid in counts if pid in ids)
    return [
        _tile("Signallar", total, "ta", "Rad etilganlarsiz", "danger" if total else "neutral"),
        _tile("Kishilar", people, "kishi", f"{len(ms)} kishidan", "warning" if people else "neutral"),
        _tile("Kishi boshiga", f"{total / people:.1f}".replace(".", ",") if people else "—", "ta"),
    ]


def _row_out(m: Member, unit: str, values: dict) -> dict:
    return {"id": str(m.id), "full_name": m.name, "initials": svc.initials(m.name),
            "photo_url": svc.photo_url(m.photo_key), "unit": unit, "values": values}


def build_report(data: Data, key: str, group_title: str, group_of: Callable[[Member], GroupKey],
                 unit_label: Callable[[Member], str], limit: int | None = PEOPLE_LIMIT) -> dict:
    spec = spec_for(data, key)
    report: dict = {"tiles": _tiles(data, key), "trend": _trend(data, key), "note": note_for(data, key),
                    "columns": [], "people": [], "people_total": 0, "breakdown": None,
                    "sort_key": None, "worst_desc": True}
    if spec is None:  # forma
        rows = [{"id": name, "name": name, "value": n, "detail": None, "headcount": None}
                for name, n in data.coat_buildings.most_common()]
        report["breakdown"] = {"title": "Binolar kesimida", "unit": "ta", "better": "down", "rows": rows}
        return report

    groups: dict[GroupKey, list[Member]] = defaultdict(list)
    for m in data.members:
        groups[group_of(m)].append(m)
    rows = []
    for g, ms in groups.items():
        value, detail = spec.group_value(ms)
        rows.append({"id": g.id, "name": g.name, "value": value, "detail": detail, "headcount": len(ms)})
    rate_like = spec.group_unit == "%"
    known = sorted((r for r in rows if r["value"] is not None), key=lambda r: r["value"], reverse=not rate_like)
    unknown = sorted((r for r in rows if r["value"] is None), key=lambda r: svc.norm_name(r["name"]))
    report["breakdown"] = {"title": group_title, "unit": spec.group_unit, "better": "up" if rate_like else "down",
                           "rows": known + unknown}

    people = []
    for m in data.members:
        values = spec.values(m.id)
        if values is not None:
            people.append((m, values))
    sign = -1 if spec.worst_desc else 1
    people.sort(key=lambda mv: (sign * (mv[1][spec.sort_key] or 0), svc.norm_name(mv[0].name)))
    report["people_total"] = len(people)
    picked = people if limit is None else people[:limit]
    report["people"] = [_row_out(m, unit_label(m), v) for m, v in picked]
    report["columns"] = spec.columns
    report["sort_key"] = spec.sort_key
    report["worst_desc"] = spec.worst_desc
    return report


# ─────────────────────────────────────────── yig'uvchi

@dataclass
class Context:
    kind: str
    start: date_type
    end: date_type
    filters: Filters
    scope: list[Member]
    members: list[Member]
    unit_of: Callable[[str | None], svc.UnitInfo] | None
    faculty_names: dict


async def context(db: AsyncSession, kind: str, start: date_type, end: date_type, f: Filters) -> Context:
    everyone = await population(db, kind)
    unit_of = None
    if kind == "xodim":
        catalog = await svc.unit_catalog(db)
        unit_of = lambda raw: catalog.units[catalog.unit_id(raw)]  # noqa: E731
        scope = everyone
    else:
        scope = filter_members(everyone, kind, Filters(faculty=f.faculty))
    members = filter_members(scope, kind, f, unit_of)
    return Context(kind, start, end, f, scope, members, unit_of, await svc.faculty_names(db))


def unit_label_fn(ctx: Context) -> Callable[[Member], str]:
    if ctx.kind == "xodim":
        return lambda m: ctx.unit_of(m.raw).name if ctx.unit_of else (m.raw or "")

    def label(m: Member) -> str:
        course, group = student_course_group(m.raw)
        parts = [ctx.faculty_names.get(m.faculty_id) if m.faculty_id else None,
                 f"{course}-kurs" if course else None, group or None]
        return " · ".join(p for p in parts if p)
    return label


async def report(db: AsyncSession, kind: str, start: date_type, end: date_type, f: Filters, criterion: str | None,
                 limit: int | None = PEOPLE_LIMIT) -> dict:
    ctx = await context(db, kind, start, end, f)
    data = await collect(db, kind, start, end, f, ctx.scope, ctx.members)
    available = criteria_for(kind)
    key = criterion if any(c.key == criterion for c in available) else available[0].key
    criteria = []
    for c in available:
        value, tone = indicator(data, c.key)
        criteria.append({"key": c.key, "label": c.label, "description": c.description, "indicator": value,
                         "tone": tone})
    title, group_of = breakdown_level(kind, f, ctx.faculty_names, ctx.unit_of)
    body = build_report(data, key, title, group_of, unit_label_fn(ctx), limit)
    return {
        "kind": kind,
        "period": {"from": start.isoformat(), "to": end.isoformat(), "days": (end - start).days + 1},
        "population": {"total": len(ctx.members), "enrolled": sum(1 for m in ctx.members if m.enrolled)},
        "criteria": criteria,
        "criterion": key,
        "report": body,
    }


async def filter_options(db: AsyncSession, kind: str) -> dict:
    everyone = await population(db, kind)
    if kind == "talaba":
        names = await svc.faculty_names(db)
        faculties: Counter = Counter()
        groups: Counter = Counter()
        for m in everyone:
            fid = str(m.faculty_id) if m.faculty_id else NO_FACULTY
            faculties[fid] += 1
            course, group = student_course_group(m.raw)
            groups[(fid, course, group)] += 1
        return {
            "faculties": sorted(
                ({"id": fid, "name": names.get(uuid.UUID(fid), NO_FACULTY_LABEL) if fid != NO_FACULTY
                  else NO_FACULTY_LABEL, "count": n} for fid, n in faculties.items()),
                key=lambda r: (r["id"] == NO_FACULTY, svc.norm_name(r["name"]))),
            "groups": sorted(
                ({"faculty_id": fid, "course": course, "name": group, "count": n}
                 for (fid, course, group), n in groups.items() if group),
                key=lambda r: (r["course"] or 99, svc.norm_name(r["name"]))),
            "courses": sorted({c for (_f, c, _g) in groups if c}),
            "units": [],
            "unit_kinds": [],
        }
    catalog = await svc.unit_catalog(db)
    counts: Counter = Counter(catalog.unit_id(m.raw) for m in everyone)
    units = [{"id": u.id, "name": u.name, "kind": u.kind, "count": counts.get(u.id, 0)}
             for u in catalog.units.values() if counts.get(u.id)]
    return {"faculties": [], "groups": [], "courses": [], "units": units,
            "unit_kinds": [{"id": k, "label": v} for k, v in UNIT_KIND_LABELS.items()
                           if any(u["kind"] == k for u in units)]}
