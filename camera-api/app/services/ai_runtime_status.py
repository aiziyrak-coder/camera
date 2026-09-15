"""Aggregated AI runtime snapshot for the admin dashboard."""

from datetime import datetime, timezone

from app.config import settings
from app.jobs.scheduler_metrics import get_scheduler_tick_stats, get_sweep_stats
from app.jobs.sweep_concurrency import entrance_exit_sweep_concurrency_snapshot, sweep_concurrency_snapshot
from app.services.gpu_status import get_gpu_status
from app.services.inference_gate import face_inference_gate
from app.services.stream_cache import active_stream_reader_count


def _scheduler_module_lists() -> tuple[list[str], list[str]]:
    """Haqiqatan ro'yxatdan o'tgan sweeplar (ai_scheduler._build_registry) —
    ilgari bu yerda mavjud bo'lmagan modullar (phone, vehicle, crowd...) ham
    qo'lda yozilgan edi."""
    from app.jobs.ai_scheduler import _build_registry

    registry = _build_registry()
    critical = [e.name for e in registry if e.tier == "critical"]
    standard = [e.name for e in registry if e.tier == "standard"]
    return critical, standard


def _sweeps_payload() -> list[dict[str, object]]:
    now = datetime.now(timezone.utc)
    return [
        {
            "name": s.name,
            "tier": s.tier,
            "interval_seconds": s.interval_seconds,
            "runs": s.runs,
            "failures": s.failures,
            "running": s.running,
            "last_finished_at": s.last_finished_at.isoformat() if s.last_finished_at else None,
            "last_duration_seconds": s.last_duration_seconds,
            "last_result": s.last_result,
            "last_error": s.last_error,
            "lagging": s.is_lagging(now),
        }
        for s in get_sweep_stats()
    ]


def build_ai_runtime_status() -> dict[str, object]:
    tick = get_scheduler_tick_stats()
    gpu = get_gpu_status()
    critical, standard = _scheduler_module_lists()
    sweep = sweep_concurrency_snapshot()

    return {
        "scheduler_enabled": settings.ai_scheduler_enabled,
        "scheduler_poll_seconds": settings.ai_scheduler_poll_seconds,
        "unified_face_sweep_enabled": settings.unified_face_sweep_enabled,
        "global_sweep_concurrency": settings.ai_global_sweep_concurrency,
        "face_inference_concurrency": settings.face_recognition_inference_concurrency,
        "object_inference_concurrency": settings.object_detection_inference_concurrency,
        "critical_modules": critical,
        "standard_modules": standard,
        "last_tick": {
            "finished_at": tick.finished_at.isoformat() if tick.finished_at else None,
            "duration_seconds": tick.duration_seconds,
            "modules_ran": tick.modules_ran,
            "critical_ran": tick.critical_ran,
            "standard_ran": tick.standard_ran,
            "skipped_overlap": tick.skipped_overlap,
        },
        "sweeps": _sweeps_payload(),
        "gpu": gpu,
        "sweep_slots": sweep,
        "entrance_exit_sweep_slots": entrance_exit_sweep_concurrency_snapshot(),
        "face_inference_gate": face_inference_gate.snapshot(),
        "stream_reader_count": active_stream_reader_count(),
        "embedding_sweep_cache_ttl_seconds": settings.candidate_matrix_sweep_cache_ttl_seconds,
    }
