"""Qavat rejalari va kameralarni rejaga joylashtirish.

Milestone/Genetec "Smart Map" ga o'xshash: bino qavatining chizmasi
(PNG/JPEG/WebP) omborga (MinIO, "floor-plans/" prefiksi) yuklanadi,
kameralar esa uning ustiga nisbiy koordinatalar (cameras.plan_x/plan_y,
0..1) va qarash burchagi (plan_rotation, gradus) bilan qo'yiladi. Nisbiy
koordinata tanlangani uchun rasm almashtirilganda (masalan yuqoriroq
sifatlisi bilan) joylashuvlar saqlanib qoladi.

Har (bino, qavat) uchun bitta reja (uq_floor_plans_building_floor):
POST shu juftlik uchun reja bor bo'lsa, uning rasmini almashtiradi.

Huquqlar: ko'rish — viewLive yoki editCameraLocation; yuklash,
o'zgartirish va joylashtirish — editCameraLocation (kamera mas'uli
roli ham shu huquq bilan ishlaydi). Jonli oqim havolasi esa faqat
viewLive huquqi borlarga beriladi.
"""

import asyncio
import logging
import uuid
from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_action
from app.database import get_db
from app.dependencies import CurrentUser, has_any_permission, require_permission
from app.models import Building, Camera
from app.models.platform import FloorPlan
from app.schemas.floor_plan import (
    FloorPlanCameraOut,
    FloorPlanOut,
    FloorPlanPositionsIn,
    FloorPlanPositionsOut,
)
from app.services.floor_plans import (
    MAX_PLAN_BYTES,
    PlanImageError,
    camera_health,
    default_plan_name,
    inspect_plan_image,
    is_on_plan,
    is_unassigned_candidate,
    on_plan_filter,
    open_event_counts,
    plan_camera_counts,
    unassigned_candidate_filter,
)
from app.services.stream_links import signed_stream_url
from app.storage import delete_files_quietly, presigned_url, upload_file

logger = logging.getLogger("app.floor_plans")

router = APIRouter(prefix="/api/floor-plans", tags=["floor-plans"])

ViewDep = Annotated[CurrentUser, Depends(require_permission("viewLive", "editCameraLocation"))]
EditDep = Annotated[CurrentUser, Depends(require_permission("editCameraLocation"))]
DbDep = Annotated[AsyncSession, Depends(get_db)]

AUDIT_MODULE = "Qavat rejalari"
# Yerto'la qavatlari (-1, -2) ham bo'lishi mumkin.
MIN_FLOOR = -10
MAX_FLOOR = 200


def _parse_uuid(raw: str, message: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, message) from None


def _image_url(key: str) -> str | None:
    # Imzolash tarmoqqa chiqmaydi, lekin sozlama xatosi (masalan endpoint
    # noto'g'ri) butun ro'yxatni 500 ga aylantirmasin.
    try:
        return presigned_url(key)
    except Exception:
        logger.warning("floor plan presign failed", extra={"key": key}, exc_info=True)
        return None


def _plan_out(plan: FloorPlan, building_name: str, counts: tuple[int, int]) -> FloorPlanOut:
    created = plan.created_at
    return FloorPlanOut(
        id=str(plan.id),
        building_id=str(plan.building_id),
        building_name=building_name,
        floor=plan.floor,
        name=plan.name,
        image_url=_image_url(plan.image_key),
        width=plan.width,
        height=plan.height,
        camera_count=counts[0],
        placed_count=counts[1],
        created_at=created.astimezone(timezone.utc).isoformat() if created else "",
    )


async def _get_plan(db: AsyncSession, plan_id: str) -> tuple[FloorPlan, Building]:
    row = (
        await db.execute(
            select(FloorPlan, Building)
            .join(Building, Building.id == FloorPlan.building_id)
            .where(FloorPlan.id == _parse_uuid(plan_id, "Qavat rejasi topilmadi"))
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Qavat rejasi topilmadi")
    return row[0], row[1]


async def _single_plan_out(db: AsyncSession, plan: FloorPlan, building: Building) -> FloorPlanOut:
    counts = await plan_camera_counts(db, plan.building_id)
    return _plan_out(plan, building.name, counts.get((plan.building_id, plan.floor), (0, 0)))


async def _read_image(file: UploadFile):
    # Chegaradan bitta bayt ortiq o'qiladi: shunda katta fayl to'liq
    # xotiraga olinmasdan rad etiladi.
    data = await file.read(MAX_PLAN_BYTES + 1)
    try:
        return data, inspect_plan_image(data)
    except PlanImageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None


async def _store_image(data: bytes, extension: str, content_type: str) -> str:
    try:
        _file_id, key = await asyncio.to_thread(
            upload_file, data, f"plan.{extension}", content_type, "floor-plans"
        )
    except Exception:
        logger.exception("floor plan upload failed")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Rasmni omborga saqlab bo'lmadi — keyinroq urinib ko'ring"
        ) from None
    return key


@router.get("", response_model=list[FloorPlanOut])
async def list_floor_plans(
    db: DbDep,
    _: ViewDep,
    building_id: Annotated[str | None, Query(alias="buildingId")] = None,
) -> list[FloorPlanOut]:
    stmt = (
        select(FloorPlan, Building.name)
        .join(Building, Building.id == FloorPlan.building_id)
        .order_by(Building.sort_order, Building.name, FloorPlan.floor)
    )
    building_uuid: uuid.UUID | None = None
    if building_id:
        try:
            building_uuid = uuid.UUID(building_id)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Noto'g'ri bino identifikatori") from None
        stmt = stmt.where(FloorPlan.building_id == building_uuid)
    rows = (await db.execute(stmt)).all()
    counts = await plan_camera_counts(db, building_uuid)
    return [_plan_out(plan, name, counts.get((plan.building_id, plan.floor), (0, 0))) for plan, name in rows]


@router.post("", response_model=FloorPlanOut, status_code=status.HTTP_201_CREATED)
async def upload_floor_plan(
    request: Request,
    response: Response,
    db: DbDep,
    current_user: EditDep,
    building_id: Annotated[str, Form(alias="buildingId")],
    floor: Annotated[int, Form(ge=MIN_FLOOR, le=MAX_FLOOR)],
    file: Annotated[UploadFile, File(description="Qavat chizmasi: PNG, JPEG yoki WebP, 15 MB gacha")],
    name: Annotated[str | None, Form()] = None,
) -> FloorPlanOut:
    """Yangi reja yaratadi yoki shu (bino, qavat) rejasining rasmini
    almashtiradi (javob 200). Kameralar joylashuvi saqlanadi — ular
    nisbiy koordinatada."""
    try:
        building_uuid = uuid.UUID(building_id)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Noto'g'ri bino identifikatori") from None
    building = await db.get(Building, building_uuid)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bino topilmadi")
    if building.floors and floor > building.floors:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{building.name} {building.floors} qavatli — avval tashkiliy tuzilmada qavatlar sonini to'g'rilang",
        )

    data, image = await _read_image(file)
    clean_name = (name or "").strip()[:200]

    plan = (
        await db.execute(
            select(FloorPlan).where(FloorPlan.building_id == building.id, FloorPlan.floor == floor)
        )
    ).scalar_one_or_none()
    old_key = plan.image_key if plan is not None else None

    key = await _store_image(data, image.extension, image.content_type)
    if plan is None:
        plan = FloorPlan(
            building_id=building.id,
            floor=floor,
            name=clean_name or default_plan_name(building.name, floor),
            image_key=key,
            width=image.width,
            height=image.height,
        )
        db.add(plan)
        action = f"Qavat rejasini yukladi: {building.name}, {floor}-qavat"
    else:
        plan.image_key = key
        plan.width = image.width
        plan.height = image.height
        if clean_name:
            plan.name = clean_name
        response.status_code = status.HTTP_200_OK
        action = f"Qavat rejasi rasmini almashtirdi: {building.name}, {floor}-qavat"

    await log_action(db, request, current_user.id, action, AUDIT_MODULE)
    try:
        await db.commit()
    except IntegrityError:
        # Ikki admin bir vaqtda bir qavatga yukladi — ikkinchisi yutqazdi.
        await db.rollback()
        await delete_files_quietly([key])
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Bu qavat uchun reja hozirgina yaratildi — sahifani yangilang"
        ) from None
    except Exception:
        await db.rollback()
        await delete_files_quietly([key])
        raise
    await delete_files_quietly([old_key])
    await db.refresh(plan)
    return await _single_plan_out(db, plan, building)


@router.patch("/{plan_id}", response_model=FloorPlanOut)
async def update_floor_plan(
    plan_id: str,
    request: Request,
    db: DbDep,
    current_user: EditDep,
    name: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> FloorPlanOut:
    """Nomini o'zgartiradi va/yoki rasmini almashtiradi (multipart)."""
    plan, building = await _get_plan(db, plan_id)
    changes: list[str] = []
    new_key: str | None = None
    old_key: str | None = None

    if name is not None:
        clean_name = name.strip()[:200]
        if not clean_name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reja nomi bo'sh bo'lmasligi kerak")
        if clean_name != plan.name:
            plan.name = clean_name
            changes.append(f"nomi: {clean_name}")

    if file is not None:
        data, image = await _read_image(file)
        new_key = await _store_image(data, image.extension, image.content_type)
        old_key = plan.image_key
        plan.image_key = new_key
        plan.width = image.width
        plan.height = image.height
        changes.append("rasm almashtirildi")

    if changes:
        await log_action(
            db,
            request,
            current_user.id,
            f"Qavat rejasini o'zgartirdi: {building.name}, {plan.floor}-qavat ({', '.join(changes)})",
            AUDIT_MODULE,
        )
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            await delete_files_quietly([new_key])
            raise
        await delete_files_quietly([old_key])
        await db.refresh(plan)
    return await _single_plan_out(db, plan, building)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_floor_plan(plan_id: str, request: Request, db: DbDep, current_user: EditDep) -> None:
    """Rejani o'chiradi va shu qavat kameralarining reja joylashuvini
    tozalaydi — aks holda keyin yuklangan boshqa chizmada eski nuqtalar
    ma'nosiz joylarda paydo bo'lardi. Kameralarning bino/qavati
    o'zgarmaydi."""
    plan, building = await _get_plan(db, plan_id)
    key = plan.image_key
    await db.execute(
        update(Camera)
        .where(on_plan_filter(plan))
        .values(plan_x=None, plan_y=None, plan_rotation=None)
        .execution_options(synchronize_session=False)
    )
    await db.delete(plan)
    await log_action(
        db,
        request,
        current_user.id,
        f"Qavat rejasini o'chirdi: {building.name}, {plan.floor}-qavat",
        AUDIT_MODULE,
    )
    await db.commit()
    await delete_files_quietly([key])


@router.get("/buildings/{building_id}/cameras", response_model=list[FloorPlanCameraOut])
async def list_building_cameras(building_id: str, db: DbDep, current_user: ViewDep) -> list[FloorPlanCameraOut]:
    """Binoning barcha kameralari holati bilan — chizma yuklanmagan bo'lsa ham
    qavat sxemasi (qavat -> kameralar) shu ro'yxatdan quriladi."""
    bid = _parse_uuid(building_id, "Bino topilmadi")
    if await db.get(Building, bid) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bino topilmadi")
    cameras = (
        await db.execute(select(Camera).where(Camera.building_id == bid).order_by(Camera.floor, Camera.name))
    ).scalars().all()
    can_view_live = await has_any_permission(db, current_user.role, ("viewLive",))
    events = await open_event_counts(db, [c.id for c in cameras])
    out: list[FloorPlanCameraOut] = []
    for camera in cameras:
        online, video = camera_health(camera)
        out.append(
            FloorPlanCameraOut(
                id=str(camera.id),
                name=camera.name,
                zone=camera.zone,
                status=camera.status,
                online=online,
                video_flowing=video,
                plan_x=camera.plan_x,
                plan_y=camera.plan_y,
                plan_rotation=camera.plan_rotation,
                ptz_enabled=camera.ptz_enabled,
                open_events=events.get(camera.id, 0),
                stream_url=signed_stream_url(camera.stream_url) if can_view_live else None,
                assigned=True,
                building_id=str(camera.building_id),
                floor=camera.floor,
            )
        )
    return out


@router.get("/{plan_id}/cameras", response_model=list[FloorPlanCameraOut])
async def list_plan_cameras(
    plan_id: str,
    db: DbDep,
    current_user: ViewDep,
    include_unassigned: Annotated[bool, Query(alias="includeUnassigned")] = False,
) -> list[FloorPlanCameraOut]:
    """Shu bino+qavat kameralari holati bilan (monitoring devori bilan bir
    xil semantika) va oxirgi 24 soatdagi ochiq signallar soni.

    includeUnassigned=true (tahrir rejimi uchun) — bino yoki qavati
    belgilanmagan kameralar ham qaytadi (assigned=false): ularni rejaga
    qo'yish shu qavatga biriktirish bilan birga bajariladi."""
    plan, _building = await _get_plan(db, plan_id)
    condition = on_plan_filter(plan)
    if include_unassigned:
        condition = or_(condition, unassigned_candidate_filter(plan))
    cameras = (await db.execute(select(Camera).where(condition).order_by(Camera.name))).scalars().all()

    can_view_live = await has_any_permission(db, current_user.role, ("viewLive",))
    assigned_ids = [c.id for c in cameras if is_on_plan(c, plan)]
    events = await open_event_counts(db, assigned_ids)

    out: list[FloorPlanCameraOut] = []
    for camera in cameras:
        online, video = camera_health(camera)
        assigned = is_on_plan(camera, plan)
        out.append(
            FloorPlanCameraOut(
                id=str(camera.id),
                name=camera.name,
                zone=camera.zone,
                status=camera.status,
                online=online,
                video_flowing=video,
                # Biriktirilmagan kameraning eski koordinatasi (boshqa
                # rejadan qolgan) bu rejada ma'nosiz.
                plan_x=camera.plan_x if assigned else None,
                plan_y=camera.plan_y if assigned else None,
                plan_rotation=camera.plan_rotation if assigned else None,
                ptz_enabled=camera.ptz_enabled,
                open_events=events.get(camera.id, 0),
                stream_url=signed_stream_url(camera.stream_url) if can_view_live else None,
                assigned=assigned,
                building_id=str(camera.building_id) if camera.building_id else None,
                floor=camera.floor,
            )
        )
    return out


@router.put("/{plan_id}/cameras", response_model=FloorPlanPositionsOut)
async def set_plan_positions(
    plan_id: str,
    body: FloorPlanPositionsIn,
    request: Request,
    db: DbDep,
    current_user: EditDep,
) -> FloorPlanPositionsOut:
    """Kameralarning rejadagi joyini birdan saqlaydi (tahrir rejimidagi
    "Saqlash").

    Qoida:
    * shu bino+qavatdagi kamera — joyi qo'yiladi yoki (null) olib tashlanadi;
    * binosi yo'q yoki shu binoda qavati belgilanmagan kamera — rejaga
      qo'yilsa, shu bino+qavatga BIRIKTIRILADI (kamera ro'yxatidan
      alohida borib qavat qo'yish shart emas); null bo'lsa — o'zgarish yo'q;
    * boshqa bino yoki qavatdagi kamera — 409, hech narsa saqlanmaydi.
      Uni jimgina boshqa qavatga ko'chirish xato bo'lardi; buning uchun
      kameralar sahifasidagi joylashuv tahriri bor.

    Hammasi bitta tranzaksiyada: avval barcha qatorlar tekshiriladi."""
    plan, building = await _get_plan(db, plan_id)

    ids: list[uuid.UUID] = []
    for item in body.items:
        camera_uuid = _parse_uuid(item.camera_id, f"Kamera topilmadi: {item.camera_id}")
        if camera_uuid in ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitta kamera ro'yxatda ikki marta kelgan")
        ids.append(camera_uuid)

    cameras: dict[uuid.UUID, Camera] = {}
    if ids:
        rows = (await db.execute(select(Camera).where(Camera.id.in_(ids)))).scalars().all()
        cameras = {c.id: c for c in rows}
    missing = [str(i) for i in ids if i not in cameras]
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kamera topilmadi: {', '.join(missing)}")

    foreign = [
        cameras[i].name
        for i in ids
        if not is_on_plan(cameras[i], plan) and not is_unassigned_candidate(cameras[i], plan)
    ]
    if foreign:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Bu kameralar boshqa bino yoki qavatga biriktirilgan: "
            + ", ".join(foreign)
            + " — avval kameralar sahifasida joylashuvini o'zgartiring",
        )

    updated = 0
    assigned = 0
    for camera_uuid, item in zip(ids, body.items):
        camera = cameras[camera_uuid]
        on_plan = is_on_plan(camera, plan)
        if not on_plan and item.plan_x is None:
            continue
        rotation = item.plan_rotation if item.plan_x is not None else None
        before = (camera.building_id, camera.floor, camera.plan_x, camera.plan_y, camera.plan_rotation)
        if not on_plan:
            camera.building_id = plan.building_id
            camera.floor = plan.floor
            assigned += 1
        camera.plan_x = item.plan_x
        camera.plan_y = item.plan_y
        camera.plan_rotation = rotation
        if (camera.building_id, camera.floor, camera.plan_x, camera.plan_y, camera.plan_rotation) != before:
            updated += 1

    if updated:
        action = f"Qavat rejasida {updated} ta kamera joylashuvini o'zgartirdi: {building.name}, {plan.floor}-qavat"
        if assigned:
            action += f" ({assigned} ta kamera shu qavatga biriktirildi)"
        await log_action(db, request, current_user.id, action, AUDIT_MODULE)
        await db.commit()
    return FloorPlanPositionsOut(updated=updated, assigned=assigned)
