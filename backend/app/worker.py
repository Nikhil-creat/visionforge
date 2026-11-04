"""Celery worker: batch pipelines + scheduled TTL cleanup."""
import cv2
from celery import Celery

from . import storage
from .config import settings
from .services import ops, vision

celery_app = Celery("visionforge", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json", result_serializer="json", accept_content=["json"],
    task_time_limit=300, worker_max_tasks_per_child=50,  # recycle workers to cap memory growth
    beat_schedule={"ttl-sweep": {"task": "visionforge.sweep", "schedule": 300.0}},
)


@celery_app.task(name="visionforge.sweep")
def sweep() -> int:
    return storage.sweep()


@celery_app.task(name="visionforge.run_plan")
def run_plan(asset_id: str, steps: list[dict]) -> dict:
    img = cv2.imread(str(storage.path_for(asset_id, "png")), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError("asset expired")
    mask, log = None, []
    for s in steps:
        img, info, mask = ops.run_op(s["tool"], img, s.get("params"), mask)
        info.pop("svg", None)
        log.append({"tool": s["tool"], "info": {k: v for k, v in info.items() if isinstance(v, (int, float, str, bool, list))}})
    new_id = storage.save_bytes(vision.encode_png(img))
    return {"asset_id": new_id, "url": f"/api/images/{new_id}/file", "log": log}
