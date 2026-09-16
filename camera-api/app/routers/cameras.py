from datetime import datetime, timedelta, timezone
from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import log_action
from app.config import settings
from app.crypto import decrypt, encrypt
from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.jobs.camera_health import is_reachable
from app.models import AIModuleConfig, Building, Camera
from app.pagination import Page, PageParams, build_page, paginate
from app.schemas.camera import (
    CameraBulkLocationIn,
    CameraBulkLocationOut,
    CameraCreateIn,
    CameraSummaryOut,
    CameraModuleOptionOut,
    CameraModulesIn,
    CameraOut,
    CameraUpdateIn,
    CameraZoneOut,
    CameraZonePolygonIn,
    ConnectionTestIn,
    ConnectionTestOut,
    ModuleCameraAssignmentUpdateIn,
    ModuleCameraAssignmentsOut,
    ModuleCameraAssignmentsPatchIn,
    ModuleCameraAssignmentOut,
)
from app.schemas.camera_import import CameraImportResultOut
from app.services.camera_import import import_cameras_csv
from app.services.camera_module_mapping import camera_allows_module_code, set_camera_module_enabled
from app.services.connectivity import test_camera_connection
from app.services.stream_sync import sync_camera_stream

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

PermDep = Annotated[CurrentUser, Depends(require_permission("manageCameras"))]


async def _resolve_building(db: AsyncSession, name: str) -> Building:
    result = await db.execute(select(Building).where(Building.name == name))
    building = result.scalar_one_or_none()
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"'{name}' nomli bino topilmadi")
    return building


async def _resolve_department(db: AsyncSession, name: str | None) -> Department | None:
    """Kafedra ixtiyoriy — bo'sh nom kafedrasiz kamerani bildiradi.

    Binodan farqli o'laroq, topilmagan nom xato QAYTARADI, jimgina
    bo'sh qoldirilmaydi: admin kafedra yozgan bo'lsa, u saqlanganini
    kutadi, va imlo xatosi natijasida kamera jimgina kafedrasiz qolib
    ketishi keyinchalik tushunarsiz bo'lardi."""
    if not name or not name.strip():
        return None
    result = await db.execute(select(Department).where(Department.name == name.strip()))
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"'{name}' nomli kafedra topilmadi")
    return department


async def _sync_stream(db: AsyncSession, camera: Camera) -> None:
    """Keeps the video gateway's registration in sync with the camera's
    status. Only 'faol' cameras get a live HLS URL — this is the piece
    the frontend's LiveVideoPlayer.tsx has been waiting for since it was
    built with a streamUrl prop and no way to populate it."""
    await sync_camera_stream(db, camera)


def _to_out(camera: Camera) -> CameraOut:
    return CameraOut(
        id=str(camera.id),
        name=camera.name,
        ip=camera.ip,
        port=camera.port,
        rtsp_path=camera.rtsp_path,
        building=camera.building.name if camera.building else "",
        department=camera.department.name if camera.department else "",
        zone=camera.zone,
        floor=camera.floor,
        resolution=camera.resolution,
        fps=camera.fps,
        status=camera.status,
        stream_url=camera.stream_url,
        is_reachable=is_reachable(camera.last_seen_at),
        restricted_zone_polygon=camera.restricted_zone_polygon,
        excluded_module_codes=camera.excluded_module_codes,
        is_entrance=camera.is_entrance,
        is_perimeter=camera.is_perimeter,
        is_exit=camera.is_exit,
        mac_address=camera.mac_address,
    )


@router.get("", response_model=Page[CameraOut])
async def list_cameras(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: PermDep,
    page_params: Annotated[PageParams, Depends()],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    building: Annotated[str | None, Query()] = None,
    zone: Annotated[str | None, Query()] = None,
    floor: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
) -> Page[CameraOut]:
    stmt = select(Camera).options(selectinload(Camera.building)).order_by(Camera.created_at.desc())
    if status_filter:
        stmt = stmt.where(Camera.status == status_filter)
    if building:
        stmt = stmt.join(Building).where(Building.name == building)
    if zone:
        stmt = stmt.where(Camera.zone == zone)
    if floor == "none":
        # Qavati belgilanmaganlar — ularni topib belgilash uchun.
        stmt = stmt.where(Camera.floor.is_(None))
    elif floor:
        if not floor.lstrip("-").isdigit():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Noto'g'ri qavat qiymati")
        stmt = stmt.where(Camera.floor == int(floor))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Camera.name.ilike(like), Camera.zone.ilike(like), Camera.ip.ilike(like)))

    records, total = await paginate(db, stmt, page_params)
    items = [_to_out(c) for c in records]
    return build_page(items, total, page_params)


@router.get("/module-options", response_model=list[CameraModuleOptionOut])
async def list_camera_module_options(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: PermDep,
) -> list[CameraModuleOptionOut]:
    """Module checklist data for CameraModulesModal — manageCameras permission
    only (no configureAi needed to assign modules to cameras)."""
    result = await db.execute(select(AIModuleConfig).order_by(AIModuleConfig.code))
    return [
        CameraModuleOptionOut(
            code=m.code,
            group=m.group,
            name=m.name,
            active=m.active,
            has_detector=m.has_detector,
        )
        for m in result.scalars().all()
    ]


async def _module_assignments_out(db: AsyncSession, module_code: int) -> ModuleCameraAssignmentsOut:
    module = (
        await db.execute(select(AIModuleConfig).where(AIModuleConfig.code == module_code))
    ).scalar_one_or_none()
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modul topilmadi")

    result = await db.execute(
        select(Camera).options(selectinload(Camera.building)).order_by(Camera.name)
    )
    cameras = result.scalars().all()
    return ModuleCameraAssignmentsOut(
        module_code=module.code,
        module_name=module.name,
        cameras=[
            ModuleCameraAssignmentOut(
                camera_id=str(c.id),
                camera_name=c.name,
                building=c.building.name if c.building else "",
                zone=c.zone,
                status=c.status,
                enabled=camera_allows_module_code(c.excluded_module_codes, module_code),
            )
            for c in cameras
        ],
    )


@router.get("/by-module/{module_code}/assignments", response_model=ModuleCameraAssignmentsOut)
async def list_module_camera_assignments(
    module_code: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: PermDep,
) -> ModuleCameraAssignmentsOut:
    """Reverse view: for one AI criterion, which cameras have it enabled."""
    return await _module_assignments_out(db, module_code)


@router.patch("/by-module/{module_code}/assignments", response_model=ModuleCameraAssignmentsOut)
async def patch_module_camera_assignments(
    module_code: int,
    body: ModuleCameraAssignmentsPatchIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
) -> ModuleCameraAssignmentsOut:
    module = (
        await db.execute(select(AIModuleConfig).where(AIModuleConfig.code == module_code))
    ).scalar_one_or_none()
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modul topilmadi")

    for item in body.assignments:
        camera = await db.get(Camera, item.camera_id)
        if camera is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Kamera topilmadi: {item.camera_id}")
        set_camera_module_enabled(camera, module_code, item.enabled)

    await log_action(
        db,
        request,
        current_user.id,
        f"Modul #{module_code} uchun kameralarni sozladi: {module.name}",
        "Kameralar",
    )
    await db.commit()
    return await _module_assignments_out(db, module_code)


@router.get("/summary", response_model=CameraSummaryOut)
async def get_cameras_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: PermDep,
) -> CameraSummaryOut:
    """Holat bo'yicha sanoqlar bitta GROUP BY so'rovida — sahifadagi
    uchta qo'shimcha so'rov o'rniga."""
    reachable_cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.camera_health_freshness_seconds)
    row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(Camera.status == "faol"),
                func.count().filter(Camera.status == "nofaol"),
                func.count().filter(Camera.status == "tamirda"),
                func.count().filter(
                    Camera.status == "faol",
                    Camera.last_seen_at.isnot(None),
                    Camera.last_seen_at >= reachable_cutoff,
                ),
                func.count().filter(Camera.floor.is_(None)),
            ).select_from(Camera)
        )
    ).one()
    total, faol, nofaol, tamirda, reachable, without_floor = row
    return CameraSummaryOut(
        total=total,
        faol=faol,
        nofaol=nofaol,
        tamirda=tamirda,
        reachable=reachable,
        without_floor=without_floor,
    )


@router.get("/zones", response_model=list[CameraZoneOut])
async def list_camera_zones(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: PermDep,
    building: Annotated[str | None, Query()] = None,
) -> list[CameraZoneOut]:
    """Distinct zone names with their camera count — a room routinely holds
    more than one camera (different angles), so this backs both the
    zone-name autocomplete in AddCameraModal.tsx (pick an existing room
    instead of retyping/mistyping its name) and the zone filter chips in
    CamerasZonesPage.tsx."""
    stmt = select(Camera.zone, func.count(Camera.id)).group_by(Camera.zone).order_by(Camera.zone)
    if building:
        stmt = stmt.join(Building).where(Building.name == building)

    result = await db.execute(stmt)
    return [CameraZoneOut(zone=zone_name, camera_count=count) for zone_name, count in result.all()]


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
async def create_camera(
    body: CameraCreateIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
) -> CameraOut:
    building = await _resolve_building(db, body.building)
    department = await _resolve_department(db, body.department)
    camera = Camera(
        name=body.name,
        ip=body.ip,
        port=body.port,
        rtsp_path=body.rtsp_path,
        rtsp_username=encrypt(body.rtsp_username) if body.rtsp_username else None,
        rtsp_password=encrypt(body.rtsp_password) if body.rtsp_password else None,
        building_id=building.id,
        department_id=department.id if department else None,
        zone=body.zone,
        floor=body.floor,
        resolution=body.resolution,
        fps=body.fps,
        status=body.status,
        is_entrance=body.is_entrance,
        is_perimeter=body.is_perimeter,
        is_exit=body.is_exit,
    )
    db.add(camera)
    await log_action(db, request, current_user.id, f"Yangi kamera qo'shdi: {body.name}", "Kameralar")
    await db.commit()
    await db.refresh(camera, attribute_names=["building"])
    await _sync_stream(db, camera)
    return _to_out(camera)


@router.post("/import", response_model=CameraImportResultOut)
async def import_cameras(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
    file: Annotated[UploadFile, File(description="SADP export CSV: Device Type, Status, IPv4 Address, MAC Address, ...")],
) -> CameraImportResultOut:
    """Bulk-import cameras from a SADP device-discovery CSV export — see
    app/services/camera_import.py's module docstring. Imported rows land
    unassigned (no building/zone, status=nofaol) for an admin to review."""
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "CSV hajmi 5 MB dan oshmasligi kerak")
    result = await import_cameras_csv(db, raw)
    await log_action(
        db,
        request,
        current_user.id,
        f"SADP import: {result.imported} qo'shildi, {result.skipped} o'tkazib yuborildi, "
        f"{result.skipped_recorders} recorder o'tkazib yuborildi, {len(result.errors)} xato",
        "Kameralar",
    )
    await db.commit()
    return result


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: str,
    body: CameraUpdateIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
) -> CameraOut:
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kamera topilmadi")

    building = await _resolve_building(db, body.building)
    camera.name = body.name
    camera.ip = body.ip
    camera.port = body.port
    camera.rtsp_path = body.rtsp_path
    if body.rtsp_username is not None:
        camera.rtsp_username = encrypt(body.rtsp_username)
    if body.rtsp_password is not None:
        camera.rtsp_password = encrypt(body.rtsp_password)
    camera.building_id = building.id
    department = await _resolve_department(db, body.department)
    camera.department_id = department.id if department else None
    camera.zone = body.zone
    # Qavat faqat YUBORILGAN bo'lsa o'zgaradi: bu maydon keyin qo'shilgan
    # va uni bilmaydigan mijoz (eski forma, skript) kameraning qavatini
    # jimgina tozalab yuborishi kerak emas.
    if "floor" in body.model_fields_set:
        camera.floor = body.floor
    camera.resolution = body.resolution
    camera.fps = body.fps
    camera.status = body.status
    camera.is_entrance = body.is_entrance
    camera.is_perimeter = body.is_perimeter
    camera.is_exit = body.is_exit

    await log_action(db, request, current_user.id, f"Kamerani tahrirladi: {body.name}", "Kameralar")
    await db.commit()
    await db.refresh(camera, attribute_names=["building"])
    await _sync_stream(db, camera)
    return _to_out(camera)


@router.patch("/{camera_id}/zone-polygon", response_model=CameraOut)
async def set_camera_zone_polygon(
    camera_id: str,
    body: CameraZonePolygonIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
) -> CameraOut:
    """Separate from update_camera (PATCH /{camera_id}) since the polygon
    is drawn interactively on the live video feed — a distinct workflow
    (CameraZoneModal.tsx) from the edit form, and one that shouldn't force
    re-sending every other camera field just to draw/clear a zone."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kamera topilmadi")

    if body.polygon is not None and len(body.polygon) > 0 and len(body.polygon) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Zona kamida 3 ta nuqtadan iborat bo'lishi kerak")

    camera.restricted_zone_polygon = body.polygon if body.polygon else None

    action = "Taqiqlangan zonani o'rnatdi" if camera.restricted_zone_polygon else "Taqiqlangan zonani tozaladi"
    await log_action(db, request, current_user.id, f"{action}: {camera.name}", "Kameralar")
    await db.commit()
    await db.refresh(camera, attribute_names=["building"])
    return _to_out(camera)


@router.patch("/{camera_id}/modules", response_model=CameraOut)
async def set_camera_excluded_modules(
    camera_id: str,
    body: CameraModulesIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
) -> CameraOut:
    """Separate from update_camera (PATCH /{camera_id}) for the same
    reason set_camera_zone_polygon is — a distinct admin workflow
    (checkbox list of AI modules, CameraModulesModal.tsx) shouldn't force
    re-sending every other camera field. Every app/jobs/*.py sweep loop
    checks Camera.excluded_module_codes on its next tick — no restart
    needed for a change here to take effect."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kamera topilmadi")

    camera.excluded_module_codes = body.excluded_module_codes if body.excluded_module_codes else None

    await log_action(
        db, request, current_user.id, f"Kamera uchun AI modullarni sozladi: {camera.name}", "Kameralar"
    )
    await db.commit()
    await db.refresh(camera, attribute_names=["building"])
    return _to_out(camera)


@router.post("/test-connection", response_model=ConnectionTestOut)
async def test_connection(body: ConnectionTestIn, _: PermDep) -> ConnectionTestOut:
    """Used by the 'add camera' flow, before anything is saved — credentials
    here are raw request input, never touch encrypt()/decrypt()."""
    return await test_camera_connection(
        ip=body.ip,
        port=body.port,
        rtsp_path=body.rtsp_path,
        username=body.rtsp_username,
        password=body.rtsp_password,
    )


@router.post("/{camera_id}/test-connection", response_model=ConnectionTestOut)
async def test_saved_camera_connection(
    camera_id: str, db: Annotated[AsyncSession, Depends(get_db)], _: PermDep
) -> ConnectionTestOut:
    """Re-verifies an already-saved camera using its stored (encrypted)
    credentials — the admin doesn't need to retype login/parol to re-check
    a camera that's gone offline."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kamera topilmadi")

    return await test_camera_connection(
        ip=camera.ip,
        port=camera.port,
        rtsp_path=camera.rtsp_path,
        username=decrypt(camera.rtsp_username) if camera.rtsp_username else None,
        password=decrypt(camera.rtsp_password) if camera.rtsp_password else None,
    )


@router.post("/bulk-location", response_model=CameraBulkLocationOut)
async def set_cameras_location(
    body: CameraBulkLocationIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
) -> CameraBulkLocationOut:
    """Belgilangan kameralarga bino/qavat/zonani birdan qo'yadi.

    Qavat ma'lumoti Video Monitoring Markazining bino -> qavat kesimi
    uchun kerak, lekin 107 ta kameraga uni bittalab kiritish real ish
    emas. Yuborilmagan (None) maydon o'zgarmaydi — masalan faqat qavatni
    qo'yish uchun binoni qayta yuborish shart emas; qavatni BO'SHATISH
    uchun esa alohida `clearFloor` bayrog'i bor, chunki None bu yerda
    "tegmaslik" degani."""
    ids: list[uuid.UUID] = []
    not_found: list[str] = []
    for raw_id in body.camera_ids:
        try:
            ids.append(uuid.UUID(raw_id))
        except ValueError:
            not_found.append(raw_id)

    building = await _resolve_building(db, body.building) if body.building else None
    cameras = (
        (await db.execute(select(Camera).where(Camera.id.in_(ids)))).scalars().all() if ids else []
    )
    found_ids = {str(camera.id) for camera in cameras}
    not_found.extend(str(camera_id) for camera_id in ids if str(camera_id) not in found_ids)

    for camera in cameras:
        if building is not None:
            camera.building_id = building.id
        if body.clear_floor:
            camera.floor = None
        elif body.floor is not None:
            camera.floor = body.floor
        if body.zone:
            camera.zone = body.zone

    if cameras:
        parts = []
        if building is not None:
            parts.append(f"bino: {building.name}")
        if body.clear_floor:
            parts.append("qavat: bo'shatildi")
        elif body.floor is not None:
            parts.append(f"qavat: {body.floor}")
        if body.zone:
            parts.append(f"zona: {body.zone}")
        await log_action(
            db,
            request,
            current_user.id,
            f"{len(cameras)} ta kameraning joylashuvini o'zgartirdi ({', '.join(parts) or 'o\'zgarishsiz'})",
            "Kameralar",
        )
        await db.commit()

    return CameraBulkLocationOut(updated=len(cameras), not_found=not_found)
