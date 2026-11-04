"""Tiny in-process Prometheus-style counters (per worker; scrape each worker or run WEB_CONCURRENCY=1)."""
from __future__ import annotations

import time
from collections import defaultdict

START = time.time()
REQS: dict[tuple[str, str, str], int] = defaultdict(int)
LAT: dict[tuple[str, str], float] = defaultdict(float)
LLM: dict[tuple[str, str], int] = defaultdict(int)
EVENTS: dict[str, int] = defaultdict(int)


def observe(method: str, route: str, status: int, seconds: float) -> None:
    REQS[(method, route, f"{status // 100}xx")] += 1
    LAT[(method, route)] += seconds


def llm(provider: str, ok: bool) -> None:
    LLM[(provider, "ok" if ok else "error")] += 1


def event(name: str) -> None:
    EVENTS[name] += 1


def render() -> str:
    out = ["# TYPE visionforge_uptime_seconds gauge", f"visionforge_uptime_seconds {time.time() - START:.0f}",
           "# TYPE visionforge_http_requests_total counter"]
    for (m, r, s), v in sorted(REQS.items()):
        out.append(f'visionforge_http_requests_total{{method="{m}",route="{r}",status="{s}"}} {v}')
    out.append("# TYPE visionforge_http_latency_seconds_sum counter")
    for (m, r), v in sorted(LAT.items()):
        out.append(f'visionforge_http_latency_seconds_sum{{method="{m}",route="{r}"}} {v:.4f}')
    out.append("# TYPE visionforge_llm_calls_total counter")
    for (p, s), v in sorted(LLM.items()):
        out.append(f'visionforge_llm_calls_total{{provider="{p}",status="{s}"}} {v}')
    out.append("# TYPE visionforge_events_total counter")
    for n, v in sorted(EVENTS.items()):
        out.append(f'visionforge_events_total{{event="{n}"}} {v}')
    return "\n".join(out) + "\n"
