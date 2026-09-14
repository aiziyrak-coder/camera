"""Talabalar va xodimlar ro'yxatini Excel (.xlsx) faylga chiqarish.

NIMA UCHUN CSV EMAS. Avval ro'yxat ";" ajratgichli CSV bo'lib yuklanardi
va Excel'da ma'lumotlar aralashib ochilardi. Sabab formatning o'zida:
CSV'da ustun ajratgichi fayl ichida yozilmaydi, Excel uni kompyuterning
til sozlamasidan TAXMIN qiladi. Ingliz lokalida u "," kutadi — va ";"
bilan ajratilgan butun qator bitta katakka tushadi. Buni fayl tomonidan
tuzatib bo'lmaydi; .xlsx esa ustunlarni o'zi saqlaydi va har qanday
kompyuterda bir xil ochiladi.

JSHSHIR MATN SIFATIDA. Excel 14 xonali raqamni son deb o'qiydi va uni
3,03027E+13 ko'rinishida ko'rsatadi, oxirgi xonalarni esa yo'qotadi. Nol
bilan boshlanadigan raqam (masalan sinov hisobi 00000000000000) esa
shunchaki 0 bo'lib qoladi. Shuning uchun JSHSHIR katagi matn formatida
yoziladi.

Ikki xil fayl bor va ular turli savolga javob beradi:

  build_people_workbook — "kim": har bir odam alohida qator, ekrandagi
  filtr bo'yicha. Kafedra mudiriga "sizdan kim qoldi" deb yuborish uchun.

  build_stats_workbook — "qancha": fakultet va kafedra kesimida qamrov.
  Rahbariyatga "jarayon qayerda orqada" deb ko'rsatish uchun.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

NAVY = "1F3864"
ZEBRA = "F5F7FB"
BORDER_COLOR = "C9D1E0"

STATUS_LABELS = {
    "tasdiqlangan": "Tasdiqlangan",
    "kutilmoqda": "Kutilmoqda",
    "yoq": "Tasdiqlanmagan",
}

#: Holat katagining foni — ro'yxatni ko'z bilan tez ko'zdan kechirish uchun.
STATUS_FILLS = {
    "tasdiqlangan": "D9F2E3",
    "kutilmoqda": "FFF1CC",
    "yoq": "FBE0E0",
}

_thin = Side(style="thin", color=BORDER_COLOR)
_BORDER = Border(left=_thin, right=_thin, top=_thin, bottom=_thin)
_HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
_HEADER_FILL = PatternFill("solid", fgColor=NAVY)
_WRAP = Alignment(vertical="center", wrap_text=True)
_CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)


# ─────────────────────────────────────────── umumiy yordamchilar

def _title(ws: Worksheet, text: str, subtitle: str, width: int) -> None:
    """1-qator sarlavha, 2-qator izoh; ikkalasi ham jadval kengligida."""
    last = get_column_letter(width)
    ws.merge_cells(f"A1:{last}1")
    ws["A1"] = text
    ws["A1"].font = Font(bold=True, size=15, color=NAVY)
    ws["A1"].alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 26

    ws.merge_cells(f"A2:{last}2")
    ws["A2"] = subtitle
    ws["A2"].font = Font(italic=True, size=10, color="5A6472")
    ws["A2"].alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[2].height = 30


def _header(ws: Worksheet, row: int, headers: list[str]) -> None:
    for col, text in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=text)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = _CENTER
        cell.border = _BORDER
    ws.row_dimensions[row].height = 30


def _widths(ws: Worksheet, widths: list[float]) -> None:
    for col, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width


def _landscape(ws: Worksheet, header_row: int) -> None:
    """Chop etilganda ham o'qiladigan bo'lsin: albom, kenglikka sig'dirish,
    sarlavha har sahifada takrorlanadi."""
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{header_row}:{header_row}"


def _to_bytes(wb: Workbook) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _stamp(now: datetime) -> str:
    return now.strftime("%d.%m.%Y %H:%M")


# ─────────────────────────────────────────── 1. Ro'yxat

@dataclass(frozen=True)
class PersonRow:
    full_name: str
    pinfl: str
    type: str
    faculty: str
    unit: str
    biometrics_status: str


def build_people_workbook(rows: list[PersonRow], filter_label: str, now: datetime) -> bytes:
    """Har bir odam alohida qator — ekrandagi filtr bilan AYNAN bir xil."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Ro'yxat"

    headers = ["№", "F.I.SH.", "JSHSHIR", "Turi", "Fakultet", "Kafedra / Bo'lim", "Yuz holati"]
    confirmed = sum(1 for r in rows if r.biometrics_status == "tasdiqlangan")
    _title(
        ws,
        "Talabalar va xodimlar ro'yxati",
        f"{filter_label}   •   Jami: {len(rows)} ta, shundan yuzi tasdiqlangan: {confirmed} ta"
        f"   •   Tuzilgan sana: {_stamp(now)}",
        len(headers),
    )

    header_row = 4
    _header(ws, header_row, headers)

    for i, r in enumerate(rows, 1):
        row = header_row + i
        values = [
            i,
            r.full_name,
            r.pinfl,
            "Talaba" if r.type == "talaba" else "Xodim",
            r.faculty,
            r.unit,
            STATUS_LABELS.get(r.biometrics_status, r.biometrics_status),
        ]
        zebra = PatternFill("solid", fgColor=ZEBRA) if i % 2 == 0 else None
        for col, value in enumerate(values, 1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = _BORDER
            cell.alignment = _CENTER if col in (1, 3, 4, 7) else _WRAP
            if zebra is not None:
                cell.fill = zebra

        pinfl_cell = ws.cell(row=row, column=3)
        pinfl_cell.number_format = "@"  # matn — yuqoridagi izohga qarang

        status_cell = ws.cell(row=row, column=7)
        fill = STATUS_FILLS.get(r.biometrics_status)
        if fill:
            status_cell.fill = PatternFill("solid", fgColor=fill)
            status_cell.font = Font(bold=True)

    _widths(ws, [6, 38, 18, 10, 34, 40, 16])
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    if rows:
        ws.auto_filter.ref = f"A{header_row}:{get_column_letter(len(headers))}{header_row + len(rows)}"
    _landscape(ws, header_row)
    return _to_bytes(wb)


# ─────────────────────────────────────────── 2. Statistika

@dataclass
class Bucket:
    confirmed: int = 0
    pending: int = 0
    missing: int = 0

    @property
    def total(self) -> int:
        return self.confirmed + self.pending + self.missing

    def add(self, status: str, count: int) -> None:
        if status == "tasdiqlangan":
            self.confirmed += count
        elif status == "kutilmoqda":
            self.pending += count
        else:
            self.missing += count

    def coverage(self) -> float | None:
        """0..1. None — guruhda odam yo'q ("0%" bilan aralashtirmaslik uchun)."""
        return self.confirmed / self.total if self.total else None


@dataclass
class CoverageData:
    totals: Bucket = field(default_factory=Bucket)
    by_faculty: dict[str, Bucket] = field(default_factory=dict)
    by_unit: dict[tuple[str, str], Bucket] = field(default_factory=dict)


def _pct_cell(cell, value: float | None) -> None:
    if value is None:
        cell.value = "—"
        cell.alignment = _CENTER
        return
    cell.value = value
    cell.number_format = "0.0%"
    cell.alignment = _CENTER
    # Qamrov darajasiga qarab fon — qaysi guruh orqada qolgani darhol ko'rinadi
    if value >= 0.8:
        cell.fill = PatternFill("solid", fgColor=STATUS_FILLS["tasdiqlangan"])
    elif value >= 0.4:
        cell.fill = PatternFill("solid", fgColor=STATUS_FILLS["kutilmoqda"])
    else:
        cell.fill = PatternFill("solid", fgColor=STATUS_FILLS["yoq"])


def _bucket_row(ws: Worksheet, row: int, labels: list[str], b: Bucket, *, bold: bool = False,
                zebra: bool = False) -> None:
    values = [*labels, b.total, b.confirmed, b.pending, b.missing]
    fill = PatternFill("solid", fgColor=ZEBRA) if zebra else None
    for col, value in enumerate(values, 1):
        cell = ws.cell(row=row, column=col, value=value)
        cell.border = _BORDER
        cell.alignment = _WRAP if col <= len(labels) else _CENTER
        if bold:
            cell.font = Font(bold=True)
        if fill is not None:
            cell.fill = fill
    pct = ws.cell(row=row, column=len(values) + 1)
    pct.border = _BORDER
    if bold:
        pct.font = Font(bold=True)
    _pct_cell(pct, b.coverage())


def build_stats_workbook(data: CoverageData, scope_label: str, now: datetime) -> bytes:
    """Fakultet va kafedra kesimidagi yuzni tasdiqlash qamrovi."""
    wb = Workbook()

    # ── 1-varaq: umumiy ko'rsatkichlar va fakultetlar
    ws = wb.active
    ws.title = "Umumiy statistika"
    fac_headers = ["Fakultet", "Jami", "Tasdiqlangan", "Kutilmoqda", "Tasdiqlanmagan", "Qamrov"]
    _title(
        ws,
        "Yuzni tasdiqlash statistikasi",
        f"{scope_label}   •   Tuzilgan sana: {_stamp(now)}",
        len(fac_headers),
    )

    t = data.totals
    summary = [
        ("Jami ro'yxatda", t.total),
        ("Yuzi tasdiqlangan", t.confirmed),
        ("Kutilmoqda", t.pending),
        ("Yuzi tasdiqlanmagan", t.missing),
        ("Qamrov", t.coverage()),
    ]
    start = 4
    for offset, (label, value) in enumerate(summary):
        row = start + offset
        label_cell = ws.cell(row=row, column=1, value=label)
        label_cell.font = Font(bold=True)
        label_cell.border = _BORDER
        label_cell.fill = PatternFill("solid", fgColor=ZEBRA)
        value_cell = ws.cell(row=row, column=2)
        value_cell.border = _BORDER
        value_cell.font = Font(bold=True, size=12)
        if label == "Qamrov":
            _pct_cell(value_cell, value)
        else:
            value_cell.value = value
            value_cell.alignment = _CENTER

    header_row = start + len(summary) + 2
    section = ws.cell(row=header_row - 1, column=1, value="Fakultetlar kesimida")
    section.font = Font(bold=True, size=12, color=NAVY)
    _header(ws, header_row, fac_headers)

    ordered = sorted(data.by_faculty.items(), key=lambda kv: (kv[0] == "Fakultetsiz", kv[0]))
    row = header_row
    for i, (name, bucket) in enumerate(ordered, 1):
        row = header_row + i
        _bucket_row(ws, row, [name], bucket, zebra=i % 2 == 0)
    _bucket_row(ws, row + 1, ["JAMI"], t, bold=True)

    _widths(ws, [44, 12, 15, 14, 17, 12])
    _landscape(ws, header_row)

    # ── 2-varaq: kafedra va bo'limlar
    ws2 = wb.create_sheet("Kafedra va bo'limlar")
    unit_headers = ["Fakultet", "Kafedra / Bo'lim", "Jami", "Tasdiqlangan", "Kutilmoqda",
                    "Tasdiqlanmagan", "Qamrov"]
    _title(
        ws2,
        "Kafedra va bo'limlar kesimida",
        f"{scope_label}   •   Qamrovi eng past bo'lganlar har fakultet ichida yuqorida   •   "
        f"Tuzilgan sana: {_stamp(now)}",
        len(unit_headers),
    )
    unit_header_row = 4
    _header(ws2, unit_header_row, unit_headers)

    # Fakultet bo'yicha guruhlab, har guruh ichida qamrovi eng past bo'lgan
    # kafedra yuqorida — "kimga eslatish kerak" degan savolga javob tartibda.
    units = sorted(
        data.by_unit.items(),
        key=lambda kv: (kv[0][0] == "Fakultetsiz", kv[0][0], kv[1].coverage() or 0.0, kv[0][1]),
    )
    for i, ((faculty, unit), bucket) in enumerate(units, 1):
        _bucket_row(ws2, unit_header_row + i, [faculty, unit], bucket, zebra=i % 2 == 0)

    _widths(ws2, [36, 44, 10, 15, 14, 17, 12])
    ws2.freeze_panes = ws2.cell(row=unit_header_row + 1, column=1)
    if units:
        ws2.auto_filter.ref = (
            f"A{unit_header_row}:{get_column_letter(len(unit_headers))}{unit_header_row + len(units)}"
        )
    _landscape(ws2, unit_header_row)

    return _to_bytes(wb)
