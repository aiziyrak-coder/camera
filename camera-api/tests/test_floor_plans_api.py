"""Qavat rejalari: yuklash, ro'yxat, kameralarni joylashtirish va o'chirish.

Ombor (MinIO) chaqirilmaydi — upload/presign/delete monkeypatch bilan
xotiradagi lug'atga almashtiriladi.
"""

from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AIModuleConfig, AuditLog, Building, Camera, Event, User
from app.models.platform import FloorPlan
from app.routers import floor_plans as floor_plans_router
from app.security import hash_password
from tests.conftest import auth_headers

STEWARD_LOGIN = "kamera-reja"
STEWARD_PASSWORD = "kamera-reja-parol-1"


def _png(width: int = 64, height: int = 48) -> bytes:
    ok, buf = cv2.imencode(".png", np.zeros((height, width, 3), dtype=np.uint8))
    assert ok
    return buf.tobytes()


def _jpeg(width: int = 80, height: int = 40) -> bytes:
    ok, buf = cv2.imencode(".jpg", np.full((height, width, 3), 200, dtype=np.uint8))
    assert ok
    return buf.tobytes()


@pytest.fixture
def storage(monkeypatch):
    """Ombor o'rniga lug'at: kalit -> (baytlar, content-type)."""
    objects: dict[str, tuple[bytes, str]] = {}
    counter = {"n": 0}

    def fake_upload(data, filename, content_type, prefix):
        counter["n"] += 1
        key = f"{prefix}/{counter['n']}-{filename}"
        objects[key] = (data, content_type)
        return str(counter["n"]), key

    async def fake_delete(keys):
        deleted = 0
        for key in keys:
            if key and objects.pop(key, None) is not None:
                deleted += 1
        return deleted

    monkeypatch.setattr(floor_plans_router, "upload_file", fake_upload)
    monkeypatch.setattr(floor_plans_router, "delete_files_quietly", fake_delete)
    monkeypatch.setattr(floor_plans_router, "presigned_url", lambda key: f"https://s3.test/{key}?sig=1")
    return objects


@pytest.fixture
async def building(db_session, seeded) -> Building:
    row = (await db_session.execute(select(Building).order_by(Building.name))).scalars().first()
    row.floors = 4
    await db_session.commit()
    return row


@pytest.fixture
async def other_building(db_session, seeded, building) -> Building:
    rows = (await db_session.execute(select(Building).order_by(Building.name))).scalars().all()
    return next(b for b in rows if b.id != building.id)


async def _camera(db_session, name, building, floor, *, live=True, video=True, **extra) -> Camera:
    now = datetime.now(timezone.utc)
    row = Camera(
        name=name,
        ip=f"10.20.0.{abs(hash(name)) % 240 + 1}",
        building_id=building.id if building else None,
        zone="Koridor",
        floor=floor,
        resolution="1080p",
        status="faol" if live else "nofaol",
        last_seen_at=now if live else None,
        last_frame_at=now if (live and video) else None,
        stream_url=f"/s0/cam-{abs(hash(name)):08x}/index.m3u8",
        **extra,
    )
    db_session.add(row)
    await db_session.commit()
    await db_session.refresh(row)
    return row


@pytest.fixture
async def admin(client: AsyncClient, seeded):
    return await auth_headers(client, "admin", "admin123")


@pytest.fixture
async def steward(client: AsyncClient, db_session, seeded):
    db_session.add(
        User(
            login=STEWARD_LOGIN,
            password_hash=hash_password(STEWARD_PASSWORD),
            full_name="Reja Mas'uli",
            role="kamera-masuli",
        )
    )
    await db_session.commit()
    return await auth_headers(client, STEWARD_LOGIN, STEWARD_PASSWORD)


async def _upload(client, headers, building_id, floor, data, *, name=None, filename="plan.png"):
    form = {"buildingId": str(building_id), "floor": str(floor)}
    if name is not None:
        form["name"] = name
    return await client.post(
        "/api/floor-plans",
        data=form,
        files={"file": (filename, data, "application/octet-stream")},
        headers=headers,
    )


class TestUpload:
    async def test_creates_plan_with_dimensions_and_audit(self, client, db_session, admin, building, storage):
        resp = await _upload(client, admin, building.id, 2, _png(64, 48))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["width"] == 64 and body["height"] == 48
        assert body["floor"] == 2
        assert body["buildingName"] == building.name
        assert body["name"] == f"{building.name}, 2-qavat"
        assert body["imageUrl"].startswith("https://s3.test/floor-plans/")
        [(key, (_data, content_type))] = storage.items()
        assert key.startswith("floor-plans/") and key.endswith(".png")
        # Tur mijoz yuborgan sarlavhadan emas, baytlardan olinadi.
        assert content_type == "image/png"
        logs = (await db_session.execute(select(AuditLog))).scalars().all()
        assert any("Qavat rejasini yukladi" in log.action and log.module == "Qavat rejalari" for log in logs)

    async def test_second_upload_replaces_image_and_deletes_old_object(
        self, client, db_session, admin, building, storage
    ):
        first = await _upload(client, admin, building.id, 1, _png(), name="Birinchi qavat")
        assert first.status_code == 201
        old_keys = set(storage)

        second = await _upload(client, admin, building.id, 1, _jpeg(80, 40), filename="yangi.jpg")
        assert second.status_code == 200, second.text
        body = second.json()
        assert body["id"] == first.json()["id"]
        assert (body["width"], body["height"]) == (80, 40)
        # Nom berilmagan — eskisi saqlanadi.
        assert body["name"] == "Birinchi qavat"
        assert not (old_keys & set(storage)), "eski rasm ombordan o'chirilishi kerak"
        assert len(storage) == 1
        plans = (await db_session.execute(select(FloorPlan))).scalars().all()
        assert len(plans) == 1

    @pytest.mark.parametrize(
        "payload",
        [b"", b"GIF89a" + b"\x00" * 64, b"%PDF-1.4 not an image", b"\x89PNG\r\n\x1a\n" + b"\x00" * 4],
    )
    async def test_rejects_non_images(self, client, admin, building, storage, payload):
        resp = await _upload(client, admin, building.id, 1, payload)
        assert resp.status_code == 400
        assert storage == {}

    async def test_rejects_too_large_file(self, client, admin, building, storage, monkeypatch):
        from app.services import floor_plans as service

        monkeypatch.setattr(service, "MAX_PLAN_BYTES", 1000)
        monkeypatch.setattr(floor_plans_router, "MAX_PLAN_BYTES", 1000)
        resp = await _upload(client, admin, building.id, 1, _png(400, 400) + b"\x00" * 2000)
        assert resp.status_code == 400
        assert "katta" in resp.json()["detail"]

    async def test_rejects_floor_above_building_floors(self, client, admin, building, storage):
        resp = await _upload(client, admin, building.id, 9, _png())
        assert resp.status_code == 400
        assert storage == {}

    async def test_unknown_building(self, client, admin, storage):
        resp = await _upload(client, admin, "00000000-0000-0000-0000-000000000000", 1, _png())
        assert resp.status_code == 404

    async def test_storage_failure_is_503(self, client, admin, building, monkeypatch):
        def broken(*_args, **_kwargs):
            raise RuntimeError("minio down")

        monkeypatch.setattr(floor_plans_router, "upload_file", broken)
        resp = await _upload(client, admin, building.id, 1, _png())
        assert resp.status_code == 503

    async def test_requires_edit_permission(self, client, building, storage):
        resp = await _upload(client, {}, building.id, 1, _png())
        assert resp.status_code == 401

    async def test_camera_steward_can_upload(self, client, steward, building, storage):
        resp = await _upload(client, steward, building.id, 1, _png())
        assert resp.status_code == 201


class TestListAndPatch:
    async def test_list_counts_cameras_and_filters_by_building(
        self, client, db_session, admin, building, other_building, storage
    ):
        await _upload(client, admin, building.id, 1, _png())
        await _upload(client, admin, other_building.id, 1, _png())
        await _camera(db_session, "A", building, 1, plan_x=0.5, plan_y=0.5)
        await _camera(db_session, "B", building, 1)
        await _camera(db_session, "C", building, 2, plan_x=0.1, plan_y=0.1)

        all_plans = (await client.get("/api/floor-plans", headers=admin)).json()
        assert len(all_plans) == 2
        resp = await client.get(f"/api/floor-plans?buildingId={building.id}", headers=admin)
        assert resp.status_code == 200
        [plan] = resp.json()
        assert plan["cameraCount"] == 2
        assert plan["placedCount"] == 1

        bad = await client.get("/api/floor-plans?buildingId=nope", headers=admin)
        assert bad.status_code == 400

    async def test_patch_renames_and_replaces_image(self, client, admin, building, storage):
        plan = (await _upload(client, admin, building.id, 3, _png())).json()
        old_keys = set(storage)

        renamed = await client.patch(f"/api/floor-plans/{plan['id']}", data={"name": "  Yangi nom "}, headers=admin)
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["name"] == "Yangi nom"
        assert set(storage) == old_keys

        replaced = await client.patch(
            f"/api/floor-plans/{plan['id']}",
            files={"file": ("p.jpg", _jpeg(120, 60), "image/jpeg")},
            headers=admin,
        )
        assert replaced.status_code == 200, replaced.text
        assert (replaced.json()["width"], replaced.json()["height"]) == (120, 60)
        assert not (old_keys & set(storage))

        empty = await client.patch(f"/api/floor-plans/{plan['id']}", data={"name": "  "}, headers=admin)
        assert empty.status_code == 400

    async def test_unknown_plan_is_404(self, client, admin, storage):
        resp = await client.patch("/api/floor-plans/not-a-uuid", data={"name": "x"}, headers=admin)
        assert resp.status_code == 404


class TestPlanCameras:
    async def test_cameras_status_events_and_stream(self, client, db_session, admin, building, storage):
        plan = (await _upload(client, admin, building.id, 1, _png())).json()
        green = await _camera(db_session, "Yashil", building, 1, plan_x=0.2, plan_y=0.3, plan_rotation=90)
        amber = await _camera(db_session, "Sariq", building, 1, video=False)
        red = await _camera(db_session, "Qizil", building, 1, live=False)
        await _camera(db_session, "Boshqa qavat", building, 2)

        module_code = (await db_session.execute(select(AIModuleConfig.code))).scalars().first()
        now = datetime.now(timezone.utc)

        def event(status, *, is_trial=False, age=timedelta(minutes=5)):
            return Event(
                camera_id=green.id,
                camera_name=green.name,
                building=building.name,
                module_code=module_code,
                module_name="Test",
                group="xavfsizlik",
                confidence=90,
                severity="yuqori",
                status=status,
                is_trial=is_trial,
                occurred_at=now - age,
            )

        db_session.add_all(
            [
                event("yangi"),
                event("jarayonda"),
                event("tasdiqlangan"),  # yopilgan
                event("yangi", is_trial=True),  # sinov
                event("yangi", age=timedelta(hours=30)),  # eski
            ]
        )
        await db_session.commit()

        resp = await client.get(f"/api/floor-plans/{plan['id']}/cameras", headers=admin)
        assert resp.status_code == 200, resp.text
        by_name = {c["name"]: c for c in resp.json()}
        assert set(by_name) == {"Yashil", "Sariq", "Qizil"}
        g = by_name["Yashil"]
        assert (g["online"], g["videoFlowing"]) == (True, True)
        assert (g["planX"], g["planY"], g["planRotation"]) == (0.2, 0.3, 90)
        assert g["openEvents"] == 2
        assert g["streamUrl"] == green.stream_url  # sir sozlanmagan — imzosiz
        assert (by_name["Sariq"]["online"], by_name["Sariq"]["videoFlowing"]) == (True, False)
        assert (by_name["Qizil"]["online"], by_name["Qizil"]["videoFlowing"]) == (False, False)
        assert by_name["Qizil"]["openEvents"] == 0
        assert all(c["assigned"] for c in by_name.values())
        assert amber.id and red.id

    async def test_steward_gets_no_stream_url(self, client, db_session, admin, steward, building, storage):
        plan = (await _upload(client, admin, building.id, 1, _png())).json()
        await _camera(db_session, "Kamera", building, 1)
        resp = await client.get(f"/api/floor-plans/{plan['id']}/cameras", headers=steward)
        assert resp.status_code == 200
        assert resp.json()[0]["streamUrl"] is None

    async def test_include_unassigned(self, client, db_session, admin, building, other_building, storage):
        plan = (await _upload(client, admin, building.id, 1, _png())).json()
        await _camera(db_session, "Biriktirilgan", building, 1)
        await _camera(db_session, "Qavatsiz", building, None, plan_x=0.9, plan_y=0.9)
        await _camera(db_session, "Binosiz", None, None)
        await _camera(db_session, "Boshqa bino", other_building, None)

        default = await client.get(f"/api/floor-plans/{plan['id']}/cameras", headers=admin)
        assert [c["name"] for c in default.json()] == ["Biriktirilgan"]

        resp = await client.get(f"/api/floor-plans/{plan['id']}/cameras?includeUnassigned=true", headers=admin)
        by_name = {c["name"]: c for c in resp.json()}
        assert set(by_name) == {"Biriktirilgan", "Qavatsiz", "Binosiz"}
        assert by_name["Qavatsiz"]["assigned"] is False
        # Boshqa rejadan qolgan koordinata ko'rsatilmaydi.
        assert by_name["Qavatsiz"]["planX"] is None


class TestPositions:
    async def test_bulk_set_move_clear_and_assign(
        self, client, db_session, admin, building, other_building, storage
    ):
        plan = (await _upload(client, admin, building.id, 2, _png())).json()
        placed = await _camera(db_session, "Joyida", building, 2, plan_x=0.1, plan_y=0.1, plan_rotation=10)
        on_floor = await _camera(db_session, "Qavatda", building, 2)
        loose = await _camera(db_session, "Binosiz", None, None)
        untouched = await _camera(db_session, "Binosiz 2", None, None)

        resp = await client.put(
            f"/api/floor-plans/{plan['id']}/cameras",
            json={
                "items": [
                    {"cameraId": str(placed.id), "planX": None, "planY": None},
                    {"cameraId": str(on_floor.id), "planX": 0.25, "planY": 0.75, "planRotation": 180},
                    {"cameraId": str(loose.id), "planX": 1, "planY": 0, "planRotation": 359},
                    {"cameraId": str(untouched.id), "planX": None, "planY": None},
                ]
            },
            headers=admin,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"updated": 3, "assigned": 1}

        for row in (placed, on_floor, loose, untouched):
            await db_session.refresh(row)
        assert (placed.plan_x, placed.plan_y, placed.plan_rotation) == (None, None, None)
        assert (on_floor.plan_x, on_floor.plan_y, on_floor.plan_rotation) == (0.25, 0.75, 180)
        assert (loose.building_id, loose.floor) == (building.id, 2)
        assert (loose.plan_x, loose.plan_y, loose.plan_rotation) == (1.0, 0.0, 359)
        assert untouched.building_id is None and untouched.floor is None

        logs = (await db_session.execute(select(AuditLog))).scalars().all()
        assert any("3 ta kamera joylashuvini" in log.action and "1 ta kamera" in log.action for log in logs)

    async def test_camera_on_other_floor_is_rejected_atomically(
        self, client, db_session, admin, building, other_building, storage
    ):
        plan = (await _upload(client, admin, building.id, 2, _png())).json()
        ok = await _camera(db_session, "Shu qavat", building, 2)
        foreign = await _camera(db_session, "Boshqa qavat", building, 3)
        other = await _camera(db_session, "Boshqa bino", other_building, 2)

        resp = await client.put(
            f"/api/floor-plans/{plan['id']}/cameras",
            json={
                "items": [
                    {"cameraId": str(ok.id), "planX": 0.5, "planY": 0.5},
                    {"cameraId": str(foreign.id), "planX": 0.5, "planY": 0.5},
                    {"cameraId": str(other.id), "planX": 0.5, "planY": 0.5},
                ]
            },
            headers=admin,
        )
        assert resp.status_code == 409
        assert "Boshqa qavat" in resp.json()["detail"] and "Boshqa bino" in resp.json()["detail"]
        await db_session.refresh(ok)
        assert ok.plan_x is None

    @pytest.mark.parametrize(
        "item",
        [
            {"planX": 1.5, "planY": 0.5},
            {"planX": 0.5, "planY": -0.1},
            {"planX": 0.5, "planY": None},
            {"planX": 0.5, "planY": 0.5, "planRotation": 360},
            {"planX": None, "planY": None, "planRotation": 10},
        ],
    )
    async def test_validation(self, client, db_session, admin, building, storage, item):
        plan = (await _upload(client, admin, building.id, 2, _png())).json()
        camera = await _camera(db_session, "K", building, 2)
        resp = await client.put(
            f"/api/floor-plans/{plan['id']}/cameras",
            json={"items": [{"cameraId": str(camera.id), **item}]},
            headers=admin,
        )
        assert resp.status_code == 422

    async def test_unknown_and_duplicate_cameras(self, client, db_session, admin, building, storage):
        plan = (await _upload(client, admin, building.id, 2, _png())).json()
        camera = await _camera(db_session, "K", building, 2)
        missing = await client.put(
            f"/api/floor-plans/{plan['id']}/cameras",
            json={"items": [{"cameraId": "00000000-0000-0000-0000-000000000001", "planX": 0.1, "planY": 0.1}]},
            headers=admin,
        )
        assert missing.status_code == 404
        dup = await client.put(
            f"/api/floor-plans/{plan['id']}/cameras",
            json={
                "items": [
                    {"cameraId": str(camera.id), "planX": 0.1, "planY": 0.1},
                    {"cameraId": str(camera.id), "planX": 0.2, "planY": 0.2},
                ]
            },
            headers=admin,
        )
        assert dup.status_code == 400

    async def test_no_change_writes_no_audit(self, client, db_session, admin, building, storage):
        plan = (await _upload(client, admin, building.id, 2, _png())).json()
        camera = await _camera(db_session, "K", building, 2, plan_x=0.5, plan_y=0.5, plan_rotation=45)
        before = len((await db_session.execute(select(AuditLog))).scalars().all())
        resp = await client.put(
            f"/api/floor-plans/{plan['id']}/cameras",
            json={"items": [{"cameraId": str(camera.id), "planX": 0.5, "planY": 0.5, "planRotation": 45}]},
            headers=admin,
        )
        assert resp.json() == {"updated": 0, "assigned": 0}
        after = len((await db_session.execute(select(AuditLog))).scalars().all())
        assert after == before


class TestDelete:
    async def test_delete_clears_positions_and_object(self, client, db_session, admin, building, storage):
        plan = (await _upload(client, admin, building.id, 1, _png())).json()
        on_plan = await _camera(db_session, "Rejada", building, 1, plan_x=0.4, plan_y=0.6, plan_rotation=30)
        elsewhere = await _camera(db_session, "Boshqa", building, 2, plan_x=0.4, plan_y=0.6, plan_rotation=30)

        resp = await client.delete(f"/api/floor-plans/{plan['id']}", headers=admin)
        assert resp.status_code == 204
        assert storage == {}
        await db_session.refresh(on_plan)
        await db_session.refresh(elsewhere)
        assert (on_plan.plan_x, on_plan.plan_y, on_plan.plan_rotation) == (None, None, None)
        assert (on_plan.building_id, on_plan.floor) == (building.id, 1)
        assert elsewhere.plan_x == 0.4
        assert (await db_session.execute(select(FloorPlan))).scalars().all() == []

        again = await client.delete(f"/api/floor-plans/{plan['id']}", headers=admin)
        assert again.status_code == 404
