"""Matches detected faces against the enrolled population — shared by
app/jobs/attendance_ai.py and app/jobs/vision_ai.py, which both need to
answer "who (if anyone) is this face?" against the same
StudentStaff.biometric_embedding pool.

At 10k+ enrolled people, exact numpy matmul is still correct but heavy;
when N >= face_match_faiss_min_size and faiss-cpu is installed, an
IndexFlatIP approximate path is used (exact for normalized vectors).
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import StudentStaff

logger = logging.getLogger("app.face_matching")

try:
    import faiss

    _FAISS_AVAILABLE = True
except ImportError:
    faiss = None  # type: ignore[assignment,misc]
    _FAISS_AVAILABLE = False


def _normalize_rows(matrix: np.ndarray) -> np.ndarray:
    """L2 normallashtirish. Ro'yxatga olingan vektorlar allaqachon normal
    (face_recognition.py), lekin nuqta ko'paytma kosinus o'xshashlik bo'lishi
    faqat shu shartda to'g'ri — tashqi import yoki eski yozuv normal
    bo'lmasa, o'xshashlik jimgina buziladi. Arzon himoya."""
    if matrix.ndim != 2 or matrix.shape[0] == 0:
        return matrix
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


@dataclass
class GradedMatch:
    person_id: str | None
    similarity: float
    second_similarity: float
    grade: str  # 'strict' | 'relaxed' | 'none'


@dataclass
class CandidateMatrix:
    ids: list[str]
    matrix: np.ndarray  # shape (N, 512) — rows are L2-normalized ArcFace embeddings
    person_types: dict[str, str] | None = None  # id -> 'talaba' | 'xodim'
    _faiss_index: object | None = field(default=None, repr=False, compare=False)

    @property
    def is_empty(self) -> bool:
        return len(self.ids) == 0

    def person_type(self, person_id: str) -> str | None:
        if self.person_types is None:
            return None
        return self.person_types.get(person_id)

    def top_two(self, embeddings: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Har bir yuz uchun eng yaqin ikki nomzod: (eng_yaqin_indeks,
        eng_yaqin_o'xshashlik, ikkinchi_o'xshashlik). Ikkinchisi — "ajralish"
        (margin) uchun: eng yaqin nomzod qolganlardan qanchalik uzoqlashgani
        moslikka ishonchning o'zi. Bitta nomzod bo'lsa ikkinchisi -1."""
        embeddings = _normalize_rows(np.asarray(embeddings, dtype=np.float64))
        n = len(self.ids)
        if self._faiss_index is not None and _FAISS_AVAILABLE:
            k = 2 if n >= 2 else 1
            sims, indices = self._faiss_index.search(embeddings.astype(np.float32), k)  # type: ignore[union-attr]
            best_idx = indices[:, 0].astype(np.int64)
            best_sim = sims[:, 0].astype(np.float64)
            second = sims[:, 1].astype(np.float64) if k == 2 else np.full(len(embeddings), -1.0)
            return best_idx, best_sim, second

        similarities = embeddings @ self.matrix.T
        best_idx = np.argmax(similarities, axis=1)
        rows = np.arange(len(embeddings))
        best_sim = similarities[rows, best_idx]
        if n >= 2:
            masked = similarities.copy()
            masked[rows, best_idx] = -np.inf
            second = masked.max(axis=1)
        else:
            second = np.full(len(embeddings), -1.0)
        return best_idx, best_sim, second

    def best_matches(
        self, embeddings: np.ndarray, threshold: float, *, margin: float = 0.0
    ) -> list[tuple[str, float] | None]:
        """`margin` berilsa, eng yaqin nomzod ikkinchisidan shuncha uzoq
        bo'lishi shart. Odamning ISMI yoziladigan joylarda (uxlab qolish
        signali, o'qituvchi o'rniga boshqasi) shu shart qo'yiladi:
        chegara pasaytirilgandan keyin (2026-09-16) "ikki nomzod deyarli
        barobar" holati noto'g'ri odamni nomlash xavfini tug'diradi."""
        if self.is_empty or len(embeddings) == 0:
            return [None] * len(embeddings)
        best_idx, best_sim, second = self.top_two(embeddings)
        return [
            (self.ids[int(i)], float(s))
            if int(i) >= 0 and s >= threshold and (s - s2) >= margin
            else None
            for i, s, s2 in zip(best_idx, best_sim, second, strict=True)
        ]

    def graded_matches(
        self,
        embeddings: np.ndarray,
        *,
        strict_threshold: float,
        relaxed_threshold: float,
        margin: float,
        strict_margin: float = 0.0,
    ) -> list["GradedMatch"]:
        """Har bir yuz uchun baholangan natija (hech qachon None emas —
        statistika uchun eng yaqin o'xshashlik ham kerak).

        * strict  — o'xshashlik >= strict_threshold VA eng yaqin nomzod
          ikkinchisidan kamida `strict_margin` ga uzoq. Margin qat'iy
          yo'lga 2026-09-16 kalibrlashda qo'shildi: chegara pasaytirilgach
          (0.55 -> 0.50) "ikki nomzod deyarli barobar" holati xavfli
          bo'ladi, ya'ni raqam yetarli, lekin QAYSI odam ekani noaniq.
          Bunday yuz umuman hisobga olinmaydi — noto'g'ri odamga davomat
          yozgandan ko'ra yozmagan yaxshi.
        * relaxed — relaxed_threshold <= o'xshashlik < strict_threshold VA
          eng yaqin nomzod ikkinchisidan kamida `margin` ga uzoq. CCTV
          kadridagi kichik/qiya yuz odatda 0.45-0.55 oralig'ida qoladi —
          qat'iy 0.55 chegara ro'yxatdan o'tgan odamni ham "tanimaydi".
          Bunday moslik bir marta yetarli emas: chaqiruvchi uni takroriy
          ko'rinish bilan tasdiqlashi kerak (app/services/recognition_stats.py).
        * none    — tanilmadi."""
        if self.is_empty or len(embeddings) == 0:
            return [GradedMatch(None, -1.0, -1.0, "none") for _ in range(len(embeddings))]
        best_idx, best_sim, second = self.top_two(embeddings)
        out: list[GradedMatch] = []
        for i, s, s2 in zip(best_idx, best_sim, second, strict=True):
            idx = int(i)
            sim = float(s)
            sim2 = float(s2)
            if idx < 0:
                out.append(GradedMatch(None, -1.0, -1.0, "none"))
            elif sim >= strict_threshold and (sim - sim2) >= strict_margin:
                out.append(GradedMatch(self.ids[idx], sim, sim2, "strict"))
            elif sim >= relaxed_threshold and (sim - sim2) >= margin:
                out.append(GradedMatch(self.ids[idx], sim, sim2, "relaxed"))
            else:
                out.append(GradedMatch(None, sim, sim2, "none"))
        return out

    def best_match(
        self, embedding: list[float] | np.ndarray, threshold: float, *, margin: float = 0.0
    ) -> tuple[str, float] | None:
        return self.best_matches(np.array([embedding]), threshold, margin=margin)[0]


def _maybe_build_faiss_index(matrix: np.ndarray) -> object | None:
    if not _FAISS_AVAILABLE or matrix.shape[0] < settings.face_match_faiss_min_size:
        return None
    index = faiss.IndexFlatIP(matrix.shape[1])  # type: ignore[union-attr]
    index.add(matrix.astype(np.float32))
    return index


async def load_candidate_matrix(db: AsyncSession) -> CandidateMatrix:
    result = await db.execute(
        select(StudentStaff.id, StudentStaff.biometric_embedding, StudentStaff.type).where(
            StudentStaff.biometric_embedding.is_not(None)
        )
    )
    rows = result.all()
    if not rows:
        return CandidateMatrix(ids=[], matrix=np.empty((0, 0)), person_types={})

    ids = [str(row_id) for row_id, _, _ in rows]
    matrix = _normalize_rows(np.array([json.loads(embedding_json) for _, embedding_json, _ in rows], dtype=np.float64))
    person_types = {str(row_id): person_type for row_id, _, person_type in rows}
    faiss_index = _maybe_build_faiss_index(matrix)
    if faiss_index is not None:
        logger.debug("FAISS index built", extra={"candidates": len(ids)})
    return CandidateMatrix(ids=ids, matrix=matrix, person_types=person_types, _faiss_index=faiss_index)


_cache: CandidateMatrix | None = None
_cache_loaded_at: datetime | None = None
_sweep_cache: CandidateMatrix | None = None
_sweep_cache_loaded_at: datetime | None = None


async def load_candidate_matrix_cached(db: AsyncSession) -> CandidateMatrix:
    global _cache, _cache_loaded_at
    now = datetime.now(timezone.utc)
    ttl = settings.candidate_matrix_cache_ttl_seconds
    if (
        _cache is None
        or _cache_loaded_at is None
        or (now - _cache_loaded_at).total_seconds() > ttl
    ):
        _cache = await load_candidate_matrix(db)
        _cache_loaded_at = now
    return _cache


async def load_candidate_matrix_for_sweep(db: AsyncSession) -> CandidateMatrix:
    """Longer-TTL cache for AI sweep loops — one DB read per few minutes
    instead of every camera tick across 10k+ enrolled embeddings."""
    global _sweep_cache, _sweep_cache_loaded_at
    now = datetime.now(timezone.utc)
    ttl = settings.candidate_matrix_sweep_cache_ttl_seconds
    if (
        _sweep_cache is None
        or _sweep_cache_loaded_at is None
        or (now - _sweep_cache_loaded_at).total_seconds() > ttl
    ):
        _sweep_cache = await load_candidate_matrix(db)
        _sweep_cache_loaded_at = now
        logger.debug(
            "sweep candidate matrix loaded",
            extra={"candidates": len(_sweep_cache.ids), "ttl_seconds": ttl},
        )
    return _sweep_cache


def invalidate_candidate_matrix_cache() -> None:
    global _cache, _cache_loaded_at, _sweep_cache, _sweep_cache_loaded_at
    _cache = None
    _cache_loaded_at = None
    _sweep_cache = None
    _sweep_cache_loaded_at = None


def find_best_match(
    embedding: list[float], candidates: list[tuple[str, list[float]]], threshold: float
) -> tuple[str, float] | None:
    if not candidates:
        return None
    ids = [c[0] for c in candidates]
    matrix = _normalize_rows(np.array([c[1] for c in candidates], dtype=np.float64))
    cm = CandidateMatrix(ids=ids, matrix=matrix, _faiss_index=_maybe_build_faiss_index(matrix))
    return cm.best_match(embedding, threshold)
