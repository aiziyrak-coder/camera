"""Suratli tahlil sinovi — yangi yondashuvning o'lchovi (faqat o'qiydi).

G'OYA. Video ochilmaydi. Kameradan bitta TAYYOR surat olinadi (kameraning
o'zi siqadi), yuzlar KICHRAYTIRILGAN rasmda qidiriladi (arzon), lekin har yuz
ASL (4K) rasmdan qirqib taniladi (aniq). Natija dars jadvali bilan
solishtiriladi: shu xonada hozir qaysi guruh o'tirishi kerak edi?

Bazaga hech narsa yozilmaydi, rasm saqlanmaydi, chiqishda ism yo'q — faqat
sonlar. Ishga tushirish (serverda):

    docker exec -i -e SINOV_KAMERALAR=6 camera-api-api-1 nice -n 10 python - < suratli_sinov.py
"""

from __future__ import annotations

import asyncio
import json
import os
import resource
import subprocess
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

import cv2
import httpx
import numpy as np
import onnxruntime as ort
from insightface.model_zoo import get_model
from insightface.utils import face_align
from sqlalchemy import select, text

from app.crypto import decrypt
from app.database import SessionLocal
from app.models import Camera
from app.services.frame_grabber import rtsp_url_for_camera

N_CAMERAS = int(os.environ.get("SINOV_KAMERALAR", "6"))
THREADS = int(os.environ.get("SINOV_YADRO", "4"))
MIN_FACE = 28  # asl rasmdagi yuz balandligi, px
STRICT = (0.50, 0.05)
RELAXED = (0.42, 0.08)
MODELS = os.path.expanduser("~/.insightface/models/buffalo_l")


def _session(name: str) -> ort.InferenceSession:
    options = ort.SessionOptions()
    options.intra_op_num_threads = THREADS
    options.log_severity_level = 3
    return ort.InferenceSession(os.path.join(MODELS, name), sess_options=options, providers=["CPUExecutionProvider"])


def load_models():
    det_file = os.path.join(MODELS, "det_10g.int8.onnx")
    rec_file = os.path.join(MODELS, "w600k_r50.int8.onnx")
    det = get_model(det_file, providers=["CPUExecutionProvider"])
    det.session = _session("det_10g.int8.onnx")
    rec = get_model(rec_file, providers=["CPUExecutionProvider"])
    rec.session = _session("w600k_r50.int8.onnx")
    rec.prepare(ctx_id=-1)
    return det, rec


def cpu_seconds() -> float:
    own = resource.getrusage(resource.RUSAGE_SELF)
    kids = resource.getrusage(resource.RUSAGE_CHILDREN)
    return own.ru_utime + own.ru_stime + kids.ru_utime + kids.ru_stime


def det_size(width: int, height: int, long_side: int) -> tuple[int, int]:
    scale = long_side / max(width, height)
    return (max(32, int(round(width * scale / 32)) * 32), max(32, int(round(height * scale / 32)) * 32))


def detect(det, image: np.ndarray, long_side: int):
    size = det_size(image.shape[1], image.shape[0], long_side)
    det.prepare(ctx_id=-1, input_size=size, det_thresh=0.5)
    boxes, kpss = det.detect(image, input_size=size)
    return boxes, kpss


def embed(rec, image: np.ndarray, kps: np.ndarray) -> np.ndarray:
    crop = face_align.norm_crop(image, landmark=kps, image_size=112)
    vector = rec.get_feat([crop]).flatten().astype(np.float32)
    return vector / (np.linalg.norm(vector) or 1.0)


class Roster:
    def __init__(self, rows, gallery):
        index = {pid: i for i, (pid, *_rest) in enumerate(rows)}
        self.types = [r[1] for r in rows]
        self.groups = [group_of(r[2]) for r in rows]
        self.ids = [r[0] for r in rows]
        vectors = [np.asarray(json.loads(r[3]), dtype=np.float32) for r in rows]
        owner = list(range(len(rows)))
        for pid, emb in gallery:
            if pid in index:
                vectors.append(np.asarray(json.loads(emb), dtype=np.float32))
                owner.append(index[pid])
        matrix = np.vstack(vectors)
        self.matrix = matrix / np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-9)
        self.owner = np.asarray(owner)

    def match(self, vector: np.ndarray) -> tuple[int, float, float]:
        """(odam indeksi, eng yaxshi o'xshashlik, ikkinchi ODAMning o'xshashligi)."""
        sims = self.matrix @ vector
        order = np.argsort(-sims)[:40]
        best = int(self.owner[order[0]])
        second = next((float(sims[j]) for j in order[1:] if int(self.owner[j]) != best), 0.0)
        return best, float(sims[order[0]]), second


def group_of(group_or_position: str | None) -> str:
    value = (group_or_position or "").strip()
    if ", " in value and value.split(", ", 1)[0].endswith("-kurs"):
        value = value.split(", ", 1)[1]
    return value.casefold()


def grade(sim: float, second: float) -> str:
    if sim >= STRICT[0] and sim - second >= STRICT[1]:
        return "qatiy"
    if sim >= RELAXED[0] and sim - second >= RELAXED[1]:
        return "yumshoq"
    return "yoq"


async def capture(camera: Camera) -> tuple[bytes | None, str, float]:
    """Asl o'lchamdagi bitta surat: avval kameraning o'zidan (HTTP), bo'lmasa
    RTSP oqimidan bitta asosiy kadr (ffmpeg)."""
    started = time.perf_counter()
    try:
        auth = httpx.DigestAuth(
            decrypt(camera.rtsp_username) if camera.rtsp_username else "",
            decrypt(camera.rtsp_password) if camera.rtsp_password else "",
        )
        async with httpx.AsyncClient(auth=auth, timeout=25.0) as client:
            response = await client.get(f"http://{camera.ip}/ISAPI/Streaming/channels/101/picture")
        if response.status_code == 200 and response.headers.get("content-type", "").startswith("image"):
            return response.content, "kamera surati", time.perf_counter() - started
    except Exception:
        pass
    started = time.perf_counter()
    url = rtsp_url_for_camera(camera, substream=False)
    command = ["ffmpeg", "-v", "error", "-rtsp_transport", "tcp", "-skip_frame", "nokey", "-i", url,
               "-frames:v", "1", "-q:v", "2", "-f", "image2pipe", "-vcodec", "mjpeg", "-"]
    try:
        result = await asyncio.to_thread(subprocess.run, command, capture_output=True, timeout=30)
    except subprocess.TimeoutExpired:
        return None, "olinmadi", time.perf_counter() - started
    if result.returncode != 0 or not result.stdout:
        return None, "olinmadi", time.perf_counter() - started
    return result.stdout, "oqimdan kadr", time.perf_counter() - started


async def pick_cameras(db) -> list[tuple[Camera, set[str], bool]]:
    """Hozir darsi bor xonalar (jadval bo'yicha) — kamera, kutilgan guruhlar."""
    now = datetime.now(timezone.utc)
    rows = (
        await db.execute(
            text(
                "select camera_id, group_name, teacher_id from lesson_sessions "
                "where camera_id is not null and scheduled_start_time <= :a and scheduled_end_time >= :b"
            ),
            {"a": now - timedelta(minutes=8), "b": now + timedelta(minutes=5)},
        )
    ).all()
    by_camera: dict = {}
    for camera_id, group_name, _teacher in rows:
        by_camera.setdefault(camera_id, set()).add((group_name or "").strip().casefold())
    cameras = {c.id: c for c in (await db.scalars(select(Camera))).all()}
    picked = [(cameras[cid], groups, True) for cid, groups in by_camera.items() if cid in cameras][:N_CAMERAS]
    if not picked:  # dars yo'q payt — mexanikani tekshirish uchun
        rooms = [c for c in cameras.values() if c.room_type == "auditoriya"][: max(1, N_CAMERAS - 1)]
        picked = [(c, set(), False) for c in rooms]
    entrance = [c for c in cameras.values() if c.room_type == "kirish" or c.is_entrance][:1]
    picked += [(c, set(), False) for c in entrance]
    return picked


async def main() -> None:
    wall = time.perf_counter()
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                text(
                    "select id::text, type, group_or_position, biometric_embedding from students_staff "
                    "where active and biometric_embedding is not null and biometrics_status = 'tasdiqlangan'"
                )
            )
        ).all()
        gallery = (await db.execute(text("select student_staff_id::text, embedding from face_gallery_embeddings"))).all()
        picked = await pick_cameras(db)
    roster = Roster(rows, gallery)
    group_sizes = Counter(g for g, t in zip(roster.groups, roster.types) if t == "talaba")
    det, rec = load_models()
    local = datetime.now(timezone(timedelta(hours=5))).strftime("%Y-%m-%d %H:%M")
    print(f"=== Suratli tahlil sinovi · {local} (Toshkent) · baza: {len(rows)} kishi, {roster.matrix.shape[0]} vektor · {THREADS} yadro")

    total = Counter()
    times = Counter()
    for number, (camera, groups, has_lesson) in enumerate(picked, 1):
        kind = camera.room_type or "tursiz"
        data, how, seconds = await capture(camera)
        if not data:
            print(f"[{number}] {kind}: surat olinmadi ({seconds:.0f} s)")
            total["olinmadi"] += 1
            continue
        c0 = cpu_seconds()
        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        times["ochish"] += cpu_seconds() - c0
        if image is None:
            print(f"[{number}] {kind}: surat buzilgan")
            continue
        height, width = image.shape[:2]

        c0 = cpu_seconds()
        small_boxes, _ = detect(det, image, max(width, height) // 4)
        quarter_cpu = cpu_seconds() - c0
        c0 = cpu_seconds()
        boxes, kpss = detect(det, image, max(width, height) // 2)
        half_cpu = cpu_seconds() - c0
        times["qidirish"] += half_cpu

        heights = [float(b[3] - b[1]) for b in boxes]
        usable = [i for i, h in enumerate(heights) if h >= MIN_FACE]
        c0 = cpu_seconds()
        results = []
        for i in usable:
            person, sim, second = roster.match(embed(rec, image, kpss[i]))
            results.append((person, sim, second, grade(sim, second), heights[i]))
        rec_cpu = cpu_seconds() - c0
        times["tanish"] += rec_cpu

        # "Kichikda qidir, kattadan qirq" foydasi: o'sha yuzlarni kichraytirilgan
        # rasmdan tanib ko'ramiz (ko'pi bilan 6 ta).
        half = cv2.resize(image, (width // 2, height // 2), interpolation=cv2.INTER_AREA)
        low_ok = low_n = 0
        for i in usable[:6]:
            _p, sim, second = roster.match(embed(rec, half, kpss[i] / 2.0))
            low_n += 1
            low_ok += grade(sim, second) != "yoq"
        full_ok6 = sum(1 for r in results[:6] if r[3] != "yoq")

        matched = [r for r in results if r[3] != "yoq"]
        strict = sum(1 for r in matched if r[3] == "qatiy")
        people = {r[0] for r in matched}
        expected = {i for i, g in enumerate(roster.groups) if g in groups and roster.types[i] == "talaba"} if groups else set()
        in_group = len(people & expected)
        students = [p for p in people if roster.types[p] == "talaba"]
        staff = len(people) - len(students)
        top_groups = Counter(roster.groups[p] for p in students).most_common(3)

        total["kamera"] += 1
        total["yuz"] += len(boxes)
        total["yaroqli"] += len(usable)
        total["tanildi"] += len(matched)
        total["qatiy"] += strict
        total["kutilgan"] += len(expected)
        total["guruhdan"] += in_group
        total["begona_talaba"] += (len(students) - in_group) if expected else 0
        total["darsli"] += bool(expected)

        sizes = sorted(heights)
        size_text = f"{sizes[0]:.0f}/{sizes[len(sizes) // 2]:.0f}/{sizes[-1]:.0f}" if sizes else "-"
        print(
            f"[{number}] {kind} {width}x{height} · {how} {seconds:.1f} s, {len(data) // 1024} KB"
            f" · yuzlar: 1/4 o'lchamda {len(small_boxes)} ta ({quarter_cpu:.1f} s), 1/2 o'lchamda {len(boxes)} ta ({half_cpu:.1f} s)"
            f" · yuz balandligi px (eng kichik/o'rta/eng katta): {size_text}"
        )
        print(
            f"     tanildi {len(matched)}/{len(usable)} (qat'iy {strict}) · tanish {rec_cpu:.1f} s"
            f" · talaba {len(students)}, xodim {staff}"
            f" · eng ko'p guruhlar: {[n for _g, n in top_groups]}"
            + (f" · JADVAL: kutilgan guruh(lar)da {len(expected)} talaba, shulardan tanildi {in_group}, boshqa guruhdan {len(students) - in_group}" if expected
               else (" · jadvalda dars bor, lekin guruh bazada topilmadi" if has_lesson else ""))
            + (f" · kichik rasmdan tanish: {low_ok}/{low_n}, asl rasmdan: {full_ok6}/{low_n}" if low_n else "")
        )

    cpu_total = sum(times.values())
    print(
        f"=== JAMI: {total['kamera']} kamera, {total['yuz']} yuz, yaroqli {total['yaroqli']}, tanildi {total['tanildi']} (qat'iy {total['qatiy']})"
        f" · darsli xonalar {total['darsli']}: kutilgan {total['kutilgan']}, guruhidan tanildi {total['guruhdan']}, boshqa guruh {total['begona_talaba']}"
    )
    if total["kamera"]:
        print(
            f"=== YUK: bitta surat o'rtacha {cpu_total / total['kamera']:.1f} yadro-soniya"
            f" (ochish {times['ochish'] / total['kamera']:.2f}, qidirish {times['qidirish'] / total['kamera']:.1f}, tanish {times['tanish'] / total['kamera']:.1f})"
            f" · sinov {time.perf_counter() - wall:.0f} s davom etdi · guruhlar soni bazada: {len(group_sizes)}"
        )


asyncio.run(main())
