import cv2
import numpy as np
import pytest

from app.services import ops, vision


@pytest.fixture(scope="module")
def img():
    a = np.zeros((180, 240, 3), np.uint8)
    for x in range(240):
        a[:, x] = (40 + x // 3, 90, 160 - x // 5)
    cv2.circle(a, (120, 90), 50, (230, 220, 40), -1)
    return a


@pytest.mark.parametrize("name", list(ops.OPS))
def test_every_op_runs(img, name):
    out, info, mask = ops.run_op(name, img, {})
    assert out.dtype == np.uint8 and out.ndim == 3 and out.shape[2] in (3, 4)


def test_params_are_clamped():
    p = ops.clean_params("denoise", {"strength": 9999, "region": "evil"})
    assert p["strength"] == 20 and p["region"] == "all"
    assert ops.clean_params("upscale", {"factor": "abc"})["factor"] == 4


def test_unknown_op_rejected(img):
    with pytest.raises(ValueError):
        ops.run_op("rm_rf", img, {})


def test_region_background_leaves_subject_untouched(img):
    out, _, _ = ops.run_op("style_transfer", img, {"theme": "neon", "strength": 1.0, "region": "background"})
    core = cv2.erode(vision.subject_mask(img), np.ones((15, 15), np.uint8)) > 0
    assert np.abs(out[core].astype(int) - img[core].astype(int)).mean() < 1.0


def test_remove_background_adds_alpha(img):
    out, info, _ = ops.run_op("remove_background", img, {})
    assert out.shape[2] == 4 and 0.03 < info["coverage"] < 0.97


def test_upscale_respects_output_cap(img, monkeypatch):
    monkeypatch.setattr(ops.settings, "max_output_pixels", 100_000)
    out, info, _ = ops.run_op("upscale", img, {"factor": 8})
    assert out.shape[0] * out.shape[1] <= 100_000


def test_vectorize_returns_svg(img):
    _, info, _ = ops.run_op("vectorize", img, {})
    assert info["svg"].startswith("<svg") and info["paths"] > 0
