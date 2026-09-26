"""Situatsion markaz — institut, fakultet, guruh, kafedra, dars va shaxs
kesimidagi "hozir nima bo'lyapti" ko'rinishlari uchun ma'lumot.

Hisob-kitob app/services/situation.py da: bu yerda faqat parametrlar,
ruxsat va javob shakli. Har endpoint `date` (YYYY-MM-DD, standart —
institut vaqti bilan bugun) oladi.
"""

import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.models import (
    AttendanceRecord,
    Building,
    Camera,
    Faculty,
    LessonAttendance,
    LessonSession,
    PresenceVisit,
    StudentGroup,
    StudentStaff,
)
from app.pagination import PageParams, paginate
from app.schemas.base import CamelModel
from app.schemas.situation import (
    ArrivalOut,
    CalendarDayOut,
    CamerasSummaryOut,
    CourseOut,
    EventsSummaryOut,
    FacultyDetailOut,
    FacultyStatOut,
    GroupDetailOut,
    GroupInfoOut,
    GroupStatOut,
    GroupStudentOut,
    HourBucketOut,
    KafedraDetailOut,
    KafedraStatOut,
    LessonPageOut,
    LessonsSummaryOut,
    LessonStateCountsOut,
    OverviewOut,
    PeriodTotalsOut,
    PersonInfoOut,
    PersonLessonOut,
    PersonProfileOut,
    PersonTotalsOut,
    PersonVisitOut,
    TeacherRowOut,
    TeachersTodayOut,
    TrendPointOut,
)
from app.services import situation as svc
from app.services.staff_export import NO_FACULTY_LABEL, course_label
from app.timezone import local_now, to_local
from app.timezone import business_date

router = APIRouter(prefix="/api/situation", tags=["situation"])

# Kim qachon kelgani — shaxsiy ma'lumot: davomat yurituvchi va hisobot
# ko'ruvchi rollar uchun (app/routers/presence.py bilan bir xil).
ReadDep = Annotated[CurrentUser, Depends(require_permission("manageAttendance", "viewReports"))]
# "Darslar" sahifasi manageLessons huquqi bilan ochiladi.
LessonsReadDep = Annotated[
    CurrentUser, Depends(require_permission("manageAttendance", "viewReports", "manageLessons"))
]
DbDep = Annotated[AsyncSession, Depends(get_db)]
DateQuery = Annotated[str | None, Query(description="YYYY-MM-DD, standart — bugun (Toshkent vaqti)")]


def _uuid_or_404(value: str, message: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, message) from None


# ─────────────────────────────────────────── 1. Umumiy holat

@router.get("/overview", response_model=OverviewOut)
async def overview(db: DbDep, _: ReadDep, date: DateQuery = None) -> OverviewOut:
    """Institut bo'yicha bir kun: talabalar, xodimlar, darsi bor
    o'qituvchilar, darslar, kameralar, hodisalar, fakultetlar kesimi,
    soatbay kelish va oxirgi kelganlar."""
    day = svc.resolve_day(date)
    return await svc.cached(("overview", day), lambda: _build_overview(db, day))


async def _build_overview(db: AsyncSession, day) -> OverviewOut:
    pending = day >= svc.today()
    now = datetime.now(timezone.utc)
    rows = await svc.unit_rows(db, day)
    lessons = await svc.day_lessons(db, day)
    names = await svc.faculty_names(db)
    students = svc.type_counts(rows, "talaba", pending)
    return OverviewOut(
        date=day.isoformat(),
        is_today=day == svc.today(),
        generated_at=local_now().isoformat(timespec="seconds"),
        students=students.out(),
        students_data_available=svc.students_data_available(students),
        students_enrolled_pct=svc.pct(students.enrolled, students.total),
        staff=svc.type_counts(rows, "xodim", pending).out(),
        teachers=TeachersTodayOut(**svc.teachers_today(lessons, now)),
        lessons=LessonsSummaryOut(**svc.lessons_summary(lessons, now)),
        cameras=CamerasSummaryOut(**await svc.camera_summary(db)),
        events=EventsSummaryOut(**await svc.event_summary(db, day)),
        by_faculty=[FacultyStatOut(**r) for r in svc.faculty_rows(rows, names, pending)],
        arrivals_by_hour=[HourBucketOut(**r) for r in await svc.arrivals_by_hour(db, day)],
        last_arrivals=[ArrivalOut(**r) for r in await svc.last_arrivals(db, day)],
    )


# ─────────────────────────────────────────── 2-3. Fakultet va guruhlar

def _group_stat(agg: svc.GroupAgg, names: dict, fallback: dict) -> GroupStatOut:
    """fallback — StudentGroup jadvalidagi (fakultet, kurs): talabasi
    hali yo'q yoki ma'lumoti to'liq bo'lmagan guruh uchun."""
    fb_faculty, fb_course = fallback.get(agg.name, (None, None))
    faculty_id = agg.faculty_id or fb_faculty
    return GroupStatOut(
        name=agg.name,
        faculty_id=str(faculty_id) if faculty_id else None,
        faculty=names.get(faculty_id) if faculty_id else None,
        course=agg.course if agg.course is not None else fb_course,
        curator=None,
        **agg.counts.fields(),
    )


@router.get("/faculties/{faculty_id}", response_model=FacultyDetailOut)
async def faculty_detail(faculty_id: str, db: DbDep, _: ReadDep, date: DateQuery = None) -> FacultyDetailOut:
    """Fakultet: kurslar va ularning guruhlari (har guruh — shu kungi davomat)."""
    fid = _uuid_or_404(faculty_id, "Fakultet topilmadi")
    faculty = await db.get(Faculty, fid)
    if faculty is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fakultet topilmadi")
    day = svc.resolve_day(date)
    pending = day >= svc.today()
    rows = [r for r in await svc.unit_rows(db, day) if r.type == "talaba" and r.faculty_id == fid]
    names = {fid: faculty.name}

    # Kurs bo'yicha jami — guruhi yozilmagan talabalar ham kursga kiradi.
    course_totals: dict[int | None, svc.Counts] = defaultdict(svc.Counts)
    for row in rows:
        course, _group = svc.student_group(row.unit)
        course_totals[course].add(row.enrolled, row.status, row.n, pending)

    groups = svc.aggregate_groups(rows, pending)
    fallback = {}
    for name, g_faculty, g_course in await svc.student_group_rows(db):
        if g_faculty == fid:
            fallback[name] = (g_faculty, g_course)
            if name not in groups:
                groups[name] = svc.GroupAgg(name)
                groups[name].course_votes[g_course] += 0
                course_totals.setdefault(g_course, svc.Counts())

    by_course: dict[int | None, list[GroupStatOut]] = defaultdict(list)
    for agg in groups.values():
        if not agg.name:
            continue
        stat = _group_stat(agg, names, fallback)
        by_course[stat.course].append(stat)

    courses = []
    for course in sorted(set(course_totals) | set(by_course), key=lambda c: (c is None, c or 0)):
        courses.append(
            CourseOut(
                course=course,
                label=course_label(course),
                groups=sorted(by_course.get(course, []), key=lambda g: g.name),
                totals=course_totals.get(course, svc.Counts()).out(),
            )
        )
    totals = svc.Counts()
    for counts in course_totals.values():
        totals.merge(counts)
    return FacultyDetailOut(
        id=str(fid), name=faculty.name, date=day.isoformat(), is_today=day == svc.today(),
        totals=totals.out(), courses=courses,
    )


@router.get("/groups", response_model=list[GroupStatOut])
async def groups_list(
    db: DbDep,
    _: ReadDep,
    date: DateQuery = None,
    faculty_id: Annotated[str | None, Query(alias="facultyId")] = None,
    course: Annotated[int | None, Query(ge=1, le=12)] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
) -> list[GroupStatOut]:
    """Barcha guruhlar tekis ro'yxatda (qidiruv / tez o'tish uchun), nom bo'yicha."""
    day = svc.resolve_day(date)
    pending = day >= svc.today()
    groups = svc.aggregate_groups(await svc.unit_rows(db, day), pending)
    names = await svc.faculty_names(db)
    fallback = {}
    for name, g_faculty, g_course in await svc.student_group_rows(db):
        fallback.setdefault(name, (g_faculty, g_course))
        groups.setdefault(name, svc.GroupAgg(name))

    fid = _uuid_or_404(faculty_id, "Fakultet topilmadi") if faculty_id else None
    needle = svc.norm_name(search) if search else ""
    out = []
    for agg in groups.values():
        if not agg.name:
            continue
        stat = _group_stat(agg, names, fallback)
        if fid and stat.faculty_id != str(fid):
            continue
        if course and stat.course != course:
            continue
        if needle and needle not in svc.norm_name(agg.name):
            continue
        out.append(stat)
    return sorted(out, key=lambda g: g.name)


# ─────────────────────────────────────────── 4. Guruh

@router.get("/groups/{group_name:path}", response_model=GroupDetailOut)
async def group_detail(group_name: str, db: DbDep, _: ReadDep, date: DateQuery = None) -> GroupDetailOut:
    """Guruh: talabalar yuz setkasi (shu kungi holati bilan), shu kungi
    darslari va oxirgi 14 kunlik davomat foizi."""
    day = svc.resolve_day(date)
    pending = day >= svc.today()
    rows = await db.execute(
        select(
            StudentStaff.id, StudentStaff.full_name, StudentStaff.group_or_position, StudentStaff.faculty_id,
            StudentStaff.biometric_photo_key, StudentStaff.biometrics_status,
            AttendanceRecord.status, AttendanceRecord.check_in, AttendanceRecord.check_out,
        )
        .outerjoin(
            AttendanceRecord,
            and_(AttendanceRecord.student_staff_id == StudentStaff.id, AttendanceRecord.date == day),
        )
        .where(StudentStaff.type == "talaba")
        .where(StudentStaff.active.is_(True))
        .where(svc.member_prefilter(group_name))
        .order_by(StudentStaff.full_name)
    )
    members = [r for r in rows.all() if svc.is_member(r[2], group_name)]

    group_row = (
        await db.execute(select(StudentGroup).where(StudentGroup.name == group_name).limit(1))
    ).scalar_one_or_none()
    lessons = await svc.fetch_lessons(db, LessonSession.date == day, LessonSession.group_name == group_name)
    if not members and group_row is None and not lessons:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Guruh topilmadi")

    counts = svc.Counts()
    faculty_votes: Counter = Counter()
    course_votes: Counter = Counter()
    students = []
    enrolled_ids = set()
    for pid, name, unit, faculty_id, key, bio, record_status, check_in, check_out in members:
        enrolled = bio == "tasdiqlangan"
        if enrolled:
            enrolled_ids.add(pid)
        counts.add(enrolled, record_status, 1, pending)
        faculty_votes[faculty_id] += 1
        course_votes[svc.student_group(unit)[0]] += 1
        students.append(
            GroupStudentOut(
                id=str(pid), full_name=name, photo_url=svc.photo_url(key), initials=svc.initials(name),
                status=svc.person_status(record_status, enrolled, day),
                check_in=svc.hm(check_in), check_out=svc.hm(check_out), biometrics_status=bio,
            )
        )

    faculty_id = next((f for f, _n in faculty_votes.most_common() if f), None) or (
        group_row.faculty_id if group_row else None
    )
    course = next((c for c, _n in course_votes.most_common() if c is not None), None)
    if course is None and group_row is not None:
        course = group_row.course
    faculty_name = (await svc.faculty_names(db)).get(faculty_id) if faculty_id else None

    return GroupDetailOut(
        date=day.isoformat(),
        is_today=day == svc.today(),
        group=GroupInfoOut(
            name=group_name, faculty_id=str(faculty_id) if faculty_id else None, faculty=faculty_name,
            course=course, totals=counts.out(),
        ),
        students=students,
        lessons=await svc.lessons_out(db, lessons),
        trend=[TrendPointOut(**p) for p in await svc.group_trend(db, group_name, day, enrolled_ids)],
    )


# ─────────────────────────────────────────── 5-6. Kafedralar

@router.get("/kafedras", response_model=list[KafedraStatOut])
async def kafedras(
    db: DbDep,
    _: ReadDep,
    date: DateQuery = None,
    kind: Annotated[Literal["kafedra", "dekanat", "bolim", "all"], Query()] = "all",
) -> list[KafedraStatOut]:
    """Bo'linmalar (kafedra, dekanat, bo'lim): xodimlar davomati va shu
    kungi darslardagi o'qituvchi kechikishlari. Bo'linmalar xodimlarning
    group_or_position matnidan yig'iladi (svc.build_catalog), Department
    yozuvi bo'lsa u bilan nom bo'yicha birlashadi. Sof lavozim yozilganlar
    ("Farrosh", "Assistent") — oxirida "Lavozim bo'yicha" qatorida."""
    day = svc.resolve_day(date)
    rows = await svc.cached(("kafedras", day), lambda: _build_kafedras(db, day))
    if kind == "all":
        return rows
    return [r for r in rows if r.kind == kind]


async def _build_kafedras(db: AsyncSession, day) -> list[KafedraStatOut]:
    pending = day >= svc.today()
    now = datetime.now(timezone.utc)
    catalog = await svc.unit_catalog(db)
    unassigned = svc.UNASSIGNED_KAFEDRA_ID

    counts: dict[str, svc.Counts] = defaultdict(svc.Counts)
    for row in await svc.unit_rows(db, day):
        if row.type == "xodim":
            counts[catalog.unit_id(row.unit)].add(row.enrolled, row.status, row.n, pending)

    staff_keys = {pid: catalog.unit_id(unit) for pid, unit in catalog.staff}
    lessons: Counter = Counter()
    late: Counter = Counter()
    missed: Counter = Counter()
    for lesson in await svc.day_lessons(db, day):
        key = staff_keys.get(lesson.teacher_id)
        if key is None:
            continue
        lessons[key] += 1
        verdict = svc.teacher_status(lesson, now)
        if verdict == "kechikdi":
            late[key] += 1
        elif verdict == "kelmadi":
            missed[key] += 1

    out = []
    for unit in catalog.units.values():
        c = counts.get(unit.id, svc.Counts())
        if unit.unassigned and not (c.total or lessons[unit.id]):
            continue
        fields = c.fields()
        fields.pop("total")
        out.append(KafedraStatOut(
            id=unit.id, name=unit.name, kind=unit.kind, building=unit.building, unassigned=unit.unassigned,
            staff_total=c.total, **fields, lessons_today=lessons[unit.id], teacher_late_lessons=late[unit.id],
            teacher_missed_lessons=missed[unit.id],
        ))
    return out


@router.get("/kafedras/{department_id}", response_model=KafedraDetailOut)
async def kafedra_detail(
    department_id: str,
    db: DbDep,
    _: ReadDep,
    date: DateQuery = None,
    date_from: Annotated[str | None, Query(alias="from")] = None,
    date_to: Annotated[str | None, Query(alias="to")] = None,
) -> KafedraDetailOut:
    """Kafedra o'qituvchilari: bugungi holati va darslari, hamda davr
    (standart — `date` gacha 30 kun) bo'yicha darsga o'z vaqtida kelishi."""
    info, ids = await svc.department_staff_ids(db, department_id)
    day = svc.resolve_day(date)
    start, end = svc.resolve_range(date_from, date_to, default_end=day)
    pending = day >= svc.today()
    now = datetime.now(timezone.utc)

    people = []
    if ids:
        people = (
            await db.execute(
                select(
                    StudentStaff.id, StudentStaff.full_name, StudentStaff.group_or_position,
                    StudentStaff.biometric_photo_key, StudentStaff.biometrics_status,
                    AttendanceRecord.status, AttendanceRecord.check_in, AttendanceRecord.check_out,
                )
                .outerjoin(
                    AttendanceRecord,
                    and_(AttendanceRecord.student_staff_id == StudentStaff.id, AttendanceRecord.date == day),
                )
                .where(StudentStaff.id.in_(ids))
                .order_by(StudentStaff.full_name)
            )
        ).all()

    id_set = set(ids)
    today_lessons: dict = defaultdict(svc.Punctuality)
    for lesson in await svc.day_lessons(db, day):
        if lesson.teacher_id in id_set:
            today_lessons[lesson.teacher_id].add(lesson, now)

    period_lessons: dict = defaultdict(svc.Punctuality)
    period_total = svc.Punctuality()
    day_counts: dict = defaultdict(Counter)
    if ids:
        for lesson in await svc.fetch_lessons(
            db, LessonSession.teacher_id.in_(ids), LessonSession.date.between(start, end)
        ):
            period_lessons[lesson.teacher_id].add(lesson, now)
            period_total.add(lesson, now)
        for pid, record_status, n in (
            await db.execute(
                select(AttendanceRecord.student_staff_id, AttendanceRecord.status, func.count())
                .where(AttendanceRecord.student_staff_id.in_(ids))
                .where(AttendanceRecord.date.between(start, end))
                .group_by(AttendanceRecord.student_staff_id, AttendanceRecord.status)
            )
        ).all():
            day_counts[pid][record_status] += n

    today = svc.Counts()
    teachers = []
    for pid, name, unit, key, bio, record_status, check_in, check_out in people:
        enrolled = bio == "tasdiqlangan"
        today.add(enrolled, record_status, 1, pending)
        t, p, d = today_lessons.get(pid, svc.Punctuality()), period_lessons.get(pid, svc.Punctuality()), day_counts[pid]
        teachers.append(
            TeacherRowOut(
                id=str(pid), full_name=name, photo_url=svc.photo_url(key), initials=svc.initials(name),
                position=unit, biometrics_status=bio, status=svc.person_status(record_status, enrolled, day),
                check_in=svc.hm(check_in), check_out=svc.hm(check_out),
                lessons_scheduled=t.lessons, lessons_on_time=t.on_time, lessons_late=t.late, lessons_missed=t.missed,
                period_lessons=p.lessons, period_on_time=p.on_time, period_late=p.late, period_missed=p.missed,
                on_time_rate=p.on_time_rate, avg_activity_score=p.avg_activity,
                period_present_days=d["keldi"] + d["kech_keldi"], period_late_days=d["kech_keldi"],
                period_absent_days=d["kelmadi"],
            )
        )

    return KafedraDetailOut(
        id=info.id,
        name=info.name,
        kind=info.kind,
        building=info.building,
        unassigned=info.unassigned,
        date=day.isoformat(),
        is_today=day == svc.today(),
        today=today.out(),
        teachers=teachers,
        period=PeriodTotalsOut(
            date_from=start.isoformat(), date_to=end.isoformat(),
            lessons=period_total.lessons, on_time=period_total.on_time, late=period_total.late,
            missed=period_total.missed, unknown=period_total.unknown, on_time_rate=period_total.on_time_rate,
            avg_activity_score=period_total.avg_activity,
            present_days=sum(d["keldi"] + d["kech_keldi"] for d in day_counts.values()),
            late_days=sum(d["kech_keldi"] for d in day_counts.values()),
            absent_days=sum(d["kelmadi"] for d in day_counts.values()),
        ),
    )


# ─────────────────────────────────────────── 7. Darslar

@router.get("/lessons", response_model=LessonPageOut)
async def lessons(
    db: DbDep,
    _: LessonsReadDep,
    params: Annotated[PageParams, Depends()],
    date: DateQuery = None,
    faculty_id: Annotated[str | None, Query(alias="facultyId")] = None,
    group: Annotated[str | None, Query(max_length=100)] = None,
    teacher_id: Annotated[str | None, Query(alias="teacherId")] = None,
    department_id: Annotated[str | None, Query(alias="departmentId")] = None,
    state: Annotated[Literal["upcoming", "ongoing", "finished"] | None, Query(alias="status")] = None,
) -> LessonPageOut:
    """Kun darslari: vaqt, xona, o'qituvchining kelishi, talabalar
    davomati va sifat ballari. Boshlanish vaqti bo'yicha, sahifalab."""
    day = svc.resolve_day(date)
    now = datetime.now(timezone.utc)
    filters = [LessonSession.date == day]
    if faculty_id:
        faculty = await db.get(Faculty, _uuid_or_404(faculty_id, "Fakultet topilmadi"))
        if faculty is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Fakultet topilmadi")
        # Dars jadvalida fakultet nom bilan yozilgan.
        filters.append(func.lower(func.btrim(LessonSession.faculty)) == faculty.name.strip().lower())
    if group:
        filters.append(LessonSession.group_name == group)
    if teacher_id:
        filters.append(LessonSession.teacher_id == _uuid_or_404(teacher_id, "O'qituvchi topilmadi"))
    if department_id:
        _info, ids = await svc.department_staff_ids(db, department_id)
        filters.append(LessonSession.teacher_id.in_(ids) if ids else false())

    counts_row = (
        await db.execute(
            select(
                func.count().filter(svc.state_clause("upcoming", now)),
                func.count().filter(svc.state_clause("ongoing", now)),
                func.count().filter(svc.state_clause("finished", now)),
            ).select_from(LessonSession).where(*filters)
        )
    ).one()

    stmt = select(LessonSession.id).where(*filters)
    if state:
        stmt = stmt.where(svc.state_clause(state, now))
    stmt = stmt.order_by(
        LessonSession.scheduled_start_time.asc().nulls_last(), LessonSession.group_name, LessonSession.id
    )
    ids, total = await paginate(db, stmt, params)
    rows = await svc.fetch_lessons(db, LessonSession.id.in_(ids)) if ids else []
    order = {lesson_id: i for i, lesson_id in enumerate(ids)}
    rows.sort(key=lambda r: order[r.id])
    return LessonPageOut(
        items=await svc.lessons_out(db, rows, now),
        total=total,
        page=params.page,
        page_size=params.page_size,
        total_pages=max(1, -(-total // params.page_size)),
        date=day.isoformat(),
        counts=LessonStateCountsOut(upcoming=counts_row[0], ongoing=counts_row[1], finished=counts_row[2]),
    )


# ─────────────────────────────────────────── 8. Shaxs

@router.get("/people/{person_id}", response_model=PersonProfileOut)
async def person_profile(
    person_id: str,
    db: DbDep,
    _: ReadDep,
    date_from: Annotated[str | None, Query(alias="from")] = None,
    date_to: Annotated[str | None, Query(alias="to")] = None,
) -> PersonProfileOut:
    """Shaxs sahifasi: ma'lumot, davr bo'yicha kunlik kalendar va jami,
    darslar (talaba — o'z davomati, o'qituvchi — o'tgan darslari va
    kelishi) hamda oxirgi 20 tashrif (kamera/bino/vaqt)."""
    pid = _uuid_or_404(person_id, "Yozuv topilmadi")
    person = await db.get(StudentStaff, pid)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Yozuv topilmadi")
    start, end = svc.resolve_range(date_from, date_to)
    current = svc.today()
    now = datetime.now(timezone.utc)
    enrolled = person.biometrics_status == "tasdiqlangan"

    course, group = svc.student_group(person.group_or_position) if person.type == "talaba" else (None, None)
    department = None
    if person.type == "xodim":
        catalog = await svc.unit_catalog(db)
        department = catalog.units.get(catalog.unit_id(person.group_or_position))
        if department is not None and department.unassigned:
            department = None

    info = PersonInfoOut(
        id=str(person.id), full_name=person.full_name, type=person.type,
        photo_url=svc.photo_url(person.biometric_photo_key), initials=svc.initials(person.full_name),
        faculty_id=str(person.faculty_id) if person.faculty_id else None,
        faculty=person.faculty.name if person.faculty else (NO_FACULTY_LABEL if person.type == "talaba" else None),
        unit=person.group_or_position, group=group or None, course=course,
        department_id=department.id if department else None,
        department=department.name if department else None,
        biometrics_status=person.biometrics_status, parent_notify=person.parent_notify_enabled,
        active=person.active,
    )

    records = {
        d: (record_status, check_in, check_out)
        for d, record_status, check_in, check_out in (
            await db.execute(
                select(AttendanceRecord.date, AttendanceRecord.status, AttendanceRecord.check_in,
                       AttendanceRecord.check_out)
                .where(AttendanceRecord.student_staff_id == pid)
                .where(AttendanceRecord.date.between(start, end))
            )
        ).all()
    }
    calendar = []
    totals = PersonTotalsOut()
    arrivals = []
    d = start
    while d <= min(end, current):
        record_status, check_in, check_out = records.get(d, (None, None, None))
        day_status = svc.person_status(record_status, enrolled, d)
        calendar.append(CalendarDayOut(date=d.isoformat(), status=day_status, check_in=svc.hm(check_in),
                                       check_out=svc.hm(check_out)))
        totals.days += 1
        if day_status in svc.PRESENT_STATUSES:
            totals.present += 1
            if check_in:
                arrivals.append(check_in.hour * 60 + check_in.minute)
        if day_status == "kech_keldi":
            totals.late += 1
        elif day_status == "kelmadi":
            totals.absent += 1
        elif day_status == "dam_olish":
            totals.day_off += 1
        elif day_status == "malumot_yoq":
            totals.no_data += 1
        d += timedelta(days=1)
    totals.rate = svc.pct(totals.present, totals.present + totals.absent)
    if arrivals:
        avg = round(sum(arrivals) / len(arrivals))
        totals.avg_arrival = f"{avg // 60:02d}:{avg % 60:02d}"

    in_period = LessonSession.date.between(start, end)
    if person.type == "talaba":
        lesson_rows = await svc.fetch_lessons(
            db, LessonSession.group_name == group, in_period, limit=300, newest_first=True
        ) if group else []
    else:
        lesson_rows = await svc.fetch_lessons(
            db, LessonSession.teacher_id == pid, in_period, limit=300, newest_first=True
        )
    own = {}
    if person.type == "talaba" and lesson_rows:
        own = {
            lesson_id: (att_status, first_seen)
            for lesson_id, att_status, first_seen in (
                await db.execute(
                    select(LessonAttendance.lesson_session_id, LessonAttendance.status, LessonAttendance.first_seen_at)
                    .where(LessonAttendance.student_staff_id == pid)
                    .where(LessonAttendance.lesson_session_id.in_([r.id for r in lesson_rows]))
                )
            ).all()
        }
    lesson_counts = await svc.lesson_counts(db, [r.id for r in lesson_rows])
    roster = await svc.roster_sizes(db)
    lessons_out = []
    for row in lesson_rows:
        att_status, first_seen = own.get(row.id, (None, None))
        lessons_out.append(
            PersonLessonOut(
                **svc.lesson_fields(row, lesson_counts.get(row.id), roster, now),
                attendance_status=att_status, first_seen=svc.hm(first_seen),
            )
        )

    # Tashriflar HAM tanlangan davrga tegishli bo'lishi kerak: sahifada ular
    # "tanlangan davrda qayerda ko'ringan" deb ko'rsatiladi. Ilgari faqat
    # yuqori chegara qo'yilardi va o'tgan oy tanlanganda ham eski (davrdan
    # oldingi) tashriflar chiqib, kalendar bilan zid ko'rinardi.
    period_start, _ = svc.day_bounds(start)
    _, period_end = svc.day_bounds(end)
    visits = (
        await db.execute(
            select(PresenceVisit.id, PresenceVisit.first_seen_at, PresenceVisit.last_seen_at, PresenceVisit.sightings,
                   Camera.name, Camera.zone, Building.name)
            .outerjoin(Camera, Camera.id == PresenceVisit.camera_id)
            .outerjoin(Building, Building.id == Camera.building_id)
            .where(PresenceVisit.student_staff_id == pid)
            .where(PresenceVisit.first_seen_at >= period_start)
            .where(PresenceVisit.first_seen_at < period_end)
            .order_by(PresenceVisit.first_seen_at.desc())
            .limit(20)
        )
    ).all()
    recent_visits = [
        PersonVisitOut(
            id=str(vid), date=business_date(first).isoformat(), camera=camera or "O'chirilgan kamera",
            building=building, zone=zone, first_seen=svc.hm(first), last_seen=svc.hm(last),
            duration_minutes=max(0, round((last - first).total_seconds() / 60)), sightings=sightings,
        )
        for vid, first, last, sightings, camera, zone, building in visits
    ]

    return PersonProfileOut(
        person=info, date_from=start.isoformat(), date_to=end.isoformat(), calendar=calendar, totals=totals,
        lessons=lessons_out, recent_visits=recent_visits,
    )


# ─────────────────────────────────────────── Holat bo'yicha odamlar ro'yxati

PeopleStatus = Literal["hammasi", "kelgan", "keldi", "kech_keldi", "kelmadi", "kutilmoqda", "yuzsiz", "dam_olish", "malumot_yoq"]


class StatusPersonOut(CamelModel):
    id: str
    full_name: str
    type: str
    group: str
    course: int | None
    faculty: str | None
    # Xodim: lavozimi va tuzilmadagi bo'linmasi.
    position: str | None = None
    unit: str | None = None
    status: str
    check_in: str | None
    biometrics_status: str


class StatusCountsOut(CamelModel):
    hammasi: int = 0
    kelgan: int = 0
    keldi: int = 0
    kech_keldi: int = 0
    kelmadi: int = 0
    kutilmoqda: int = 0
    yuzsiz: int = 0
    dam_olish: int = 0
    malumot_yoq: int = 0


class StatusPeopleOut(CamelModel):
    date: str
    counts: StatusCountsOut
    total: int
    page: int
    page_size: int
    items: list[StatusPersonOut]


@router.get("/people-status", response_model=StatusPeopleOut)
async def people_by_status(
    db: DbDep,
    _: ReadDep,
    date: DateQuery = None,
    status_: Annotated[PeopleStatus, Query(alias="status")] = "hammasi",
    type_: Annotated[Literal["talaba", "xodim"], Query(alias="type")] = "talaba",
    faculty_id: Annotated[str | None, Query(alias="facultyId")] = None,
    course: Annotated[int | None, Query(ge=1, le=12)] = None,
    group: Annotated[str | None, Query(max_length=100)] = None,
    department_id: Annotated[str | None, Query(alias="departmentId", max_length=100)] = None,
    org_unit_id: Annotated[str | None, Query(alias="orgUnitId", max_length=100)] = None,
    position_group: Annotated[Literal["oqituvchi", "mamuriy", "texnik"] | None, Query(alias="positionGroup")] = None,
    position: Annotated[str | None, Query(max_length=200)] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=500)] = 100,
) -> StatusPeopleOut:
    """Sanoq ortidagi odamlar (kelgan = keldi + kech_keldi): "kech kelganlar 37" -> aynan kimlar. Filtrlar
    (fakultet/kurs/guruh/qidiruv) bilan; `counts` — shu filtrlardagi har
    holat soni (status filtrisiz), ya'ni sanoqlar va ro'yxat bir-biriga mos.

    Holatlar: keldi (vaqtida), kech_keldi, kelmadi, kutilmoqda (bugun,
    yuzi bor, hali ko'rinmagan), yuzsiz (yuzi bazada yo'q — kamera tanimaydi),
    dam_olish, malumot_yoq."""
    day = svc.resolve_day(date)
    fid = _uuid_or_404(faculty_id, "Fakultet topilmadi") if faculty_id else None
    stmt = (
        select(
            StudentStaff.id, StudentStaff.full_name, StudentStaff.type, StudentStaff.group_or_position,
            StudentStaff.faculty_id, StudentStaff.biometrics_status, AttendanceRecord.status, AttendanceRecord.check_in,
            StudentStaff.org_unit_id, StudentStaff.position,
        )
        .outerjoin(
            AttendanceRecord,
            and_(AttendanceRecord.student_staff_id == StudentStaff.id, AttendanceRecord.date == day),
        )
        .where(StudentStaff.type == type_, StudentStaff.active.is_(True))
        .order_by(StudentStaff.full_name)
    )
    if fid:
        stmt = stmt.where(StudentStaff.faculty_id == fid)
    if group:
        stmt = stmt.where(svc.member_prefilter(group))
    if department_id:
        # Kafedra / bo'lim (xodimlar) — /kafedras dagi bilan bir xil ro'yxat.
        _unit, staff_ids = await svc.department_staff_ids(db, department_id)
        stmt = stmt.where(StudentStaff.id.in_(staff_ids or [uuid.uuid4()]))
    from app.models import OrgUnit
    from app.services import org_structure as org

    unit_names: dict = {}
    if type_ == "xodim":
        units = (await db.execute(select(OrgUnit).where(OrgUnit.active.is_(True)))).scalars().all()
        unit_names = {u.id: u.name.strip() for u in units}
        if org_unit_id == UNASSIGNED:
            stmt = stmt.where(StudentStaff.org_unit_id.is_(None))
        elif org_unit_id:
            wanted = org.descendants(org.build_tree(list(units)), _uuid_or_404(org_unit_id, "Bo'linma topilmadi"))
            if not wanted:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Bo'linma topilmadi")
            stmt = stmt.where(StudentStaff.org_unit_id.in_(wanted))
        if position:
            stmt = stmt.where(func.coalesce(StudentStaff.position, "") == ("" if position == "Lavozim ko'rsatilmagan" else position))
    rows = (await db.execute(stmt)).all()
    names = await svc.faculty_names(db)
    needle = svc.norm_name(search) if search else ""

    counts = StatusCountsOut()
    matched: list[StatusPersonOut] = []
    for pid, name, ptype, unit, faculty, bio, record_status, check_in, person_unit, person_position in rows:
        if group and not svc.is_member(unit, group):
            continue
        if position_group and org.position_group(person_position) != position_group:
            continue
        person_course, group_name = svc.student_group(unit) if ptype == "talaba" else (None, unit or "")
        if course and person_course != course:
            continue
        if needle and needle not in svc.norm_name(name):
            continue
        enrolled = bio == "tasdiqlangan"
        state = svc.person_status(record_status, enrolled, day)
        buckets = {"hammasi", state}
        if state in svc.PRESENT_STATUSES:
            buckets.add("kelgan")
        if not enrolled:
            buckets.add("yuzsiz")
        for bucket in buckets:
            setattr(counts, bucket, getattr(counts, bucket) + 1)
        if status_ in buckets:
            matched.append(
                StatusPersonOut(
                    id=str(pid), full_name=name, type=ptype, group=group_name or "", course=person_course,
                    faculty=names.get(faculty) if faculty else None, status=state,
                    check_in=svc.hm(check_in), biometrics_status=bio, position=person_position,
                    unit=unit_names.get(person_unit) if person_unit else None,
                )
            )
    if status_ in ("kelgan", "keldi", "kech_keldi"):
        matched.sort(key=lambda p: p.check_in or "99:99")
    start = (page - 1) * page_size
    return StatusPeopleOut(
        date=day.isoformat(), counts=counts, total=len(matched), page=page, page_size=page_size,
        items=matched[start:start + page_size],
    )


# ─────────────────────────────────────────── Institut tuzilmasi (xodimlar filtri)


class OrgNodeOut(CamelModel):
    id: str
    name: str
    kind: str
    kind_label: str
    depth: int
    parent_id: str | None
    total: int
    present: int
    absent: int
    no_data: int


class PositionOut(CamelModel):
    name: str
    group: str | None
    total: int
    present: int
    absent: int
    no_data: int


class OrgTreeOut(CamelModel):
    date: str
    units: list[OrgNodeOut]
    positions: list[PositionOut]
    position_groups: dict[str, int]


UNASSIGNED = "yoq"


def _bucket(record_status: str | None, enrolled: bool, pending: bool) -> str:
    if record_status in svc.PRESENT_STATUSES:
        return "present"
    if record_status == "kelmadi" or (enrolled and pending and record_status is None):
        return "absent"
    return "no_data"


async def _staff_rows(db: AsyncSession, day):
    return (
        await db.execute(
            select(
                StudentStaff.id, StudentStaff.org_unit_id, StudentStaff.position, StudentStaff.biometrics_status,
                AttendanceRecord.status,
            )
            .outerjoin(
                AttendanceRecord,
                and_(AttendanceRecord.student_staff_id == StudentStaff.id, AttendanceRecord.date == day),
            )
            .where(StudentStaff.type == "xodim", StudentStaff.active.is_(True))
        )
    ).all()


@router.get("/tuzilma", response_model=OrgTreeOut)
async def org_tree(db: DbDep, _: ReadDep, date: DateQuery = None) -> OrgTreeOut:
    """Xodimlar filtri uchun institut tuzilmasi (HEMIS): rahbariyat,
    fakultetlar va ularning kafedralari, bo'limlar, markazlar, turar joylar —
    har biri bugungi sanoqlar bilan (ichki bo'linmalar bilan birga).
    Shuningdek lavozimlar ro'yxati va toifalar (o'qituvchi/ma'muriy/texnik)."""
    from app.models import OrgUnit
    from app.services import org_structure as org

    day = svc.resolve_day(date)
    pending = day >= svc.today()
    units = (await db.execute(select(OrgUnit).where(OrgUnit.active.is_(True)))).scalars().all()
    roots = org.build_tree(list(units))
    parent_of = {u.id: u.parent_id for u in units}

    direct: dict = defaultdict(lambda: Counter())
    positions: dict[str, Counter] = defaultdict(Counter)
    groups: Counter = Counter()
    for _pid, unit_id, position, bio, record_status in await _staff_rows(db, day):
        bucket = _bucket(record_status, bio == "tasdiqlangan", pending)
        key = unit_id if unit_id in parent_of else UNASSIGNED
        direct[key][bucket] += 1
        direct[key]["total"] += 1
        name = (position or "").strip() or "Lavozim ko'rsatilmagan"
        positions[name][bucket] += 1
        positions[name]["total"] += 1
        groups[org.position_group(position) or "nomalum"] += 1

    rolled: dict = defaultdict(Counter)
    for unit_id, counts in direct.items():
        node = unit_id
        seen = set()
        while node is not None and node not in seen:
            seen.add(node)
            rolled[node].update(counts)
            node = parent_of.get(node) if node != UNASSIGNED else None

    out: list[OrgNodeOut] = []

    def emit(items, depth):
        for item in items:
            counts = rolled.get(item.id, Counter())
            out.append(OrgNodeOut(
                id=str(item.id), name=item.name, kind=item.kind, kind_label=org.KIND_LABELS.get(item.kind, item.kind),
                depth=depth, parent_id=str(item.parent_id) if item.parent_id else None, total=counts["total"],
                present=counts["present"], absent=counts["absent"], no_data=counts["no_data"],
            ))
            emit(item.children, depth + 1)

    emit(roots, 0)
    if UNASSIGNED in rolled:
        counts = rolled[UNASSIGNED]
        out.append(OrgNodeOut(
            id=UNASSIGNED, name="Tuzilmaga bog'lanmagan xodimlar", kind="boshqa", kind_label="Boshqa bo‘linmalar",
            depth=0, parent_id=None, total=counts["total"], present=counts["present"], absent=counts["absent"],
            no_data=counts["no_data"],
        ))
    return OrgTreeOut(
        date=day.isoformat(),
        units=out,
        positions=sorted(
            (PositionOut(name=name, group=org.position_group(name), total=c["total"], present=c["present"],
                         absent=c["absent"], no_data=c["no_data"]) for name, c in positions.items()),
            key=lambda p: (-p.total, p.name),
        ),
        position_groups=dict(groups),
    )
