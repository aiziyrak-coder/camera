"""Hisobotlar sahifasi (`/api/hisobot/*`): xodimlar va talabalar alohida.

  GET /api/hisobot/filters?kind=talaba|xodim      — filtr variantlari
  GET /api/hisobot/report?kind=&from=&to=&criterion=&faculty=&course=&group=&unit_kind=&unit=&q=
  GET /api/hisobot/export.xlsx (report bilan bir xil parametrlar) — Excel

Hisob-kitob app/services/hisobot.py da.
"""

from io import BytesIO
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.services import hisobot, situation as svc

router = APIRouter(prefix="/api/hisobot", tags=["hisobot"])

ReadDep = Annotated[CurrentUser, Depends(require_permission("viewReports"))]
DbDep = Annotated[AsyncSession, Depends(get_db)]
KindQuery = Annotated[Literal["talaba", "xodim"], Query()]


def _filters(faculty: str | None, course: int | None, group: str | None, unit_kind: str | None, unit: str | None,
             q: str | None) -> hisobot.Filters:
    clean = lambda v: (v or "").strip() or None  # noqa: E731
    return hisobot.Filters(clean(faculty), course, clean(group), clean(unit_kind), clean(unit), clean(q))


@router.get("/filters")
async def filters(db: DbDep, _: ReadDep, kind: KindQuery = "xodim") -> dict:
    return await hisobot.filter_options(db, kind)


@router.get("/report")
async def report(
    db: DbDep, _: ReadDep, kind: KindQuery = "xodim",
    date_from: Annotated[str | None, Query(alias="from")] = None,
    date_to: Annotated[str | None, Query(alias="to")] = None,
    criterion: str | None = None, faculty: str | None = None, course: Annotated[int | None, Query(ge=1, le=7)] = None,
    group: str | None = None, unit_kind: str | None = None, unit: str | None = None, q: str | None = None,
) -> dict:
    start, end = svc.resolve_range(date_from, date_to, default_days=1)
    return await hisobot.report(db, kind, start, end, _filters(faculty, course, group, unit_kind, unit, q), criterion)


@router.get("/export.xlsx")
async def export(
    db: DbDep, _: ReadDep, kind: KindQuery = "xodim",
    date_from: Annotated[str | None, Query(alias="from")] = None,
    date_to: Annotated[str | None, Query(alias="to")] = None,
    criterion: str | None = None, faculty: str | None = None, course: Annotated[int | None, Query(ge=1, le=7)] = None,
    group: str | None = None, unit_kind: str | None = None, unit: str | None = None, q: str | None = None,
) -> Response:
    start, end = svc.resolve_range(date_from, date_to, default_days=1)
    data = await hisobot.report(db, kind, start, end, _filters(faculty, course, group, unit_kind, unit, q), criterion,
                                limit=None)
    content = build_workbook(data)
    label = next(c["label"] for c in data["criteria"] if c["key"] == data["criterion"])
    name = f"hisobot-{'talabalar' if kind == 'talaba' else 'xodimlar'}-{data['criterion']}-{start}_{end}.xlsx"
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}", "X-Report-Title": quote(label)},
    )


def build_workbook(data: dict) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Hisobot"
    bold = Font(bold=True)
    label = next(c["label"] for c in data["criteria"] if c["key"] == data["criterion"])
    body = data["report"]
    ws.append([f"{'Talabalar' if data['kind'] == 'talaba' else 'Xodimlar'} — {label}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Davr: {data['period']['from']} — {data['period']['to']}", f"Aholi: {data['population']['total']}"])
    ws.append([])
    for tile in body["tiles"]:
        ws.append([tile["label"], f"{tile['value']} {tile['unit']}".strip(), tile["hint"] or ""])
    if body.get("note"):
        ws.append(["Izoh", body["note"]])
    ws.append([])

    if body["breakdown"] and body["breakdown"]["rows"]:
        ws.append([body["breakdown"]["title"]])
        ws.cell(ws.max_row, 1).font = bold
        ws.append(["Nomi", f"Qiymat ({body['breakdown']['unit']})", "Izoh", "Soni"])
        for row in body["breakdown"]["rows"]:
            ws.append([row["name"], row["value"], row["detail"] or "", row["headcount"]])
        ws.append([])

    if body["columns"]:
        people = wb.create_sheet("Odamlar")
        header = ["№", "F.I.Sh.", "Bo'linma / guruh"] + [
            f"{c['label']} ({c['unit']})" if c["unit"] else c["label"] for c in body["columns"]]
        people.append(header)
        for cell in people[1]:
            cell.font = bold
        for i, row in enumerate(body["people"], start=1):
            people.append([i, row["full_name"], row["unit"]] + [row["values"].get(c["key"]) for c in body["columns"]])
        people.column_dimensions["B"].width = 36
        people.column_dimensions["C"].width = 36
    ws.column_dimensions["A"].width = 34
    ws.column_dimensions["B"].width = 22
    ws.column_dimensions["C"].width = 30
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
