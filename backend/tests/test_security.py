from app import security
from app.config import settings


def test_magic_bytes():
    assert security.sniff_image_type(b"\x89PNG\r\n\x1a\n" + b"0" * 8) == "png"
    assert security.sniff_image_type(b"\xff\xd8\xff\xe0" + b"0" * 12) == "jpeg"
    assert security.sniff_image_type(b"RIFF\x00\x00\x00\x00WEBP" + b"0") == "webp"
    assert security.sniff_image_type(b"MZ\x90\x00 not an image") is None


class FakeReq:
    def __init__(self, xff=None, host="9.9.9.9", key=None):
        self.headers = {k: v for k, v in (("x-forwarded-for", xff), ("x-api-key", key)) if v}
        self.client = type("C", (), {"host": host})()


def test_forged_forwarded_for_is_ignored_by_default(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    assert security.client_identity(FakeReq(xff="1.1.1.1, 2.2.2.2")) == "ip:9.9.9.9"


def test_forwarded_for_counts_from_the_right_behind_one_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    # attacker prepends a fake address; the proxy appends the real one on the right
    assert security.client_identity(FakeReq(xff="6.6.6.6, 203.0.113.7")) == "ip:203.0.113.7"
    assert security.client_identity(FakeReq(xff=None)) == "ip:9.9.9.9"


def test_token_bucket_cost():
    security._local.clear()
    ok = [security._local_bucket("t", 4) for _ in range(8)]
    # capacity 30 -> seven 4-cost calls pass, the eighth is refused
    assert ok[:7] == [True] * 7 and ok[7] is False
    assert security._local_bucket("t", 1) is True      # cheap calls still fit in the remainder
    assert settings.rate_capacity == 30
