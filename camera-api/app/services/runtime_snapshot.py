"""AI ish holati suratini API jarayonlari o'rtasida ulashish.

MUAMMO. Productionda WEB_CONCURRENCY=2: ikkita uvicorn jarayoni. AI
sweeplari faqat bittasida (leader, app/jobs/leader_lock.py) ishlaydi, lekin
yuz tanish statistikasi (recognition_stats) va sweep ko'rsatkichlari
(scheduler_metrics) o'sha jarayon XOTIRASIDA. HTTP so'rov esa ikkala
jarayondan biriga tasodifan tushadi — "Davomat kameralari" tashxisi va
boshqaruv panelidagi "N modul ishladi" taxminan har ikkinchi yangilashda
"hali tekshirilmadi" / "0 modul" bo'lib ko'rinardi.

YECHIM. Leader har SNAPSHOT_INTERVAL_SECONDS da suratni Redis'ga yozadi
(TTL bilan — leader o'lsa, eskirgan surat o'zi yo'qoladi). Leader o'z
xotirasidan o'qiydi, qolgan jarayonlar Redis'dan. Redis sozlanmagan yoki
ishlamayotgan bo'lsa — har jarayon o'z xotirasidan (bitta jarayonli
o'rnatishda bu to'g'ri javob).
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.jobs import scheduler_metrics
from app.jobs.scheduler_metrics import SweepRunStats
from app.redis_bus import _get_redis, _redis_url
from app.services import recognition_stats
from app.services.recognition_stats import RecognitionView

logger = logging.getLogger("app.runtime_snapshot")

KEY_RECOGNITION = "camera:runtime:recognition"
KEY_SWEEPS = "camera:runtime:sweeps"
SNAPSHOT_INTERVAL_SECONDS = 5
SNAPSHOT_TTL_SECONDS = 60

# Shu jarayon suratni YOZUVCHI (leader) bo'lsa — o'z xotirasi eng yangi manba.
_is_publisher = False


async def publish_once() -> bool:
    client = await _get_redis()
    if client is None:
        return False
    recognition = json.dumps(recognition_stats.export_snapshot())
    sweeps = json.dumps(scheduler_metrics.export_sweeps())
    async with client.pipeline(transaction=False) as pipe:
        pipe.set(KEY_RECOGNITION, recognition, ex=SNAPSHOT_TTL_SECONDS)
        pipe.set(KEY_SWEEPS, sweeps, ex=SNAPSHOT_TTL_SECONDS)
        await pipe.execute()
    return True


async def runtime_snapshot_loop() -> None:
    """Faqat leader jarayonida ishga tushiriladi (app/main.py)."""
    global _is_publisher
    _is_publisher = True
    if not _redis_url():
        return  # bitta jarayon — ulashish shart emas, o'qish o'z xotirasidan
    while True:
        try:
            await publish_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("runtime snapshot publish failed")
        await asyncio.sleep(SNAPSHOT_INTERVAL_SECONDS)


async def _read_json(key: str):
    if _is_publisher or not _redis_url():
        return None
    client = await _get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(key)
    except Exception:
        logger.exception("runtime snapshot read failed", extra={"key": key})
        return None
    return json.loads(raw) if raw else {}


async def load_recognition_views() -> dict[str, RecognitionView]:
    data = await _read_json(KEY_RECOGNITION)
    if data is None:
        return recognition_stats.local_views()
    views = (recognition_stats.view_from_dict(row) for row in data.values())
    return {camera_id: view for camera_id, view in zip(data.keys(), views, strict=True) if view is not None}


async def load_sweep_stats() -> list[SweepRunStats]:
    data = await _read_json(KEY_SWEEPS)
    if data is None:
        return scheduler_metrics.get_sweep_stats()
    return scheduler_metrics.sweeps_from_dicts(data if isinstance(data, list) else [])


def reset_for_tests() -> None:
    global _is_publisher
    _is_publisher = False
