import os

import pytest
from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import get_db
from app.main import app
from app.models import Base
from app.rate_limit import limiter
from app.seed import seed_all

# TEST_DATABASE_URL — bir nechta test jarayoni parallel ishlaganda har biri
# o'z bazasini oladi (aks holda drop_all/create_all bir-birini buzadi).
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or (
    settings.database_url.rsplit("/", 1)[0] + "/camera_api_test"
)

# Testlar demo hisoblar (admin/admin123, operator/operator123) bilan
# ishlaydi. Production'da ular standart bo'yicha yaratilmaydi.
settings.seed_demo_users = True

test_engine = create_async_engine(TEST_DATABASE_URL)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_schema():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await test_engine.dispose()


@pytest.fixture(autouse=True)
def _behaviour_hours_off():
    """Takes the wall clock out of the test suite.

    The behaviour-hours gate (app/jobs/module_status.py) switches modules
    5/16/17/20 off outside working hours, so without this every sweep
    test for those modules passed by day and failed by night — which is
    exactly how it was found: three of them broke on an evening run and
    nothing about the code had changed since the morning.

    The gate has its own tests, which set the window and the clock
    explicitly rather than inheriting whatever time it happens to be.
    """
    from app.config import settings

    original = settings.behaviour_hours_enabled
    original_sleep = settings.sleep_only_during_lessons
    settings.behaviour_hours_enabled = False
    # Uyqu testlari dars jadvalini yaratmaydi; darvozaning o'z testi
    # (test_unified_face_sweep.py) uni ataylab yoqadi.
    settings.sleep_only_during_lessons = False
    yield
    settings.behaviour_hours_enabled = original
    settings.sleep_only_during_lessons = original_sleep


@pytest.fixture(autouse=True)
def _fresh_inference_cache():
    """Kadr natijalari keshi (app/services/inference_cache.py) testlar
    orasida bo'lishilmasin: ko'p test bir xil soxta kadr baytlarini
    ishlatadi, lekin modelni har xil soxtalashtiradi."""
    from app.services.inference_cache import inference_cache

    from app.jobs.lesson_quality_ai import reset_sampling_for_tests

    from app.services import face_gallery, face_zoom, static_faces, stream_promotion
    from app.services.face_tracks import track_store

    inference_cache.clear()
    reset_sampling_for_tests()
    track_store.clear()
    face_gallery.reset_for_tests()
    stream_promotion.reset_for_tests()
    face_zoom.zoom_limiter.reset()
    static_faces.reset_for_tests()
    yield
    inference_cache.clear()
    reset_sampling_for_tests()
    track_store.clear()
    face_gallery.reset_for_tests()
    stream_promotion.reset_for_tests()
    face_zoom.zoom_limiter.reset()
    static_faces.reset_for_tests()


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Truncates every table before each test so tests don't see each
    other's data, without paying for a schema drop/recreate per test."""
    async with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
    limiter.reset()  # slowapi's in-memory bucket is a module-level singleton
    from app.jobs.camera_health import reset_camera_health_state_for_tests
    from app.jobs.disorder_ai import reset_motion_history_for_tests
    from app.services.face_matching import invalidate_candidate_matrix_cache

    invalidate_candidate_matrix_cache()
    reset_camera_health_state_for_tests()
    reset_motion_history_for_tests()
    yield
    invalidate_candidate_matrix_cache()
    reset_camera_health_state_for_tests()
    reset_motion_history_for_tests()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def seeded(db_session: AsyncSession) -> None:
    """Same seed data the real app boots with — demo users, default
    permission matrix, starting faculties/buildings."""
    await seed_all(db_session)


async def login(client: AsyncClient, login_name: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"login": login_name, "password": password})
    resp.raise_for_status()
    return resp.json()["token"]


async def auth_headers(client: AsyncClient, login_name: str, password: str) -> dict[str, str]:
    token = await login(client, login_name, password)
    return {"Authorization": f"Bearer {token}"}
