"""Shared HTTP + IO helpers for the YIELD/YARD identity-asset pipeline.

Politeness rules live here so both fetchers obey the same contract
(`ARCHITECTURE.md` §5, `audit/findings_image_audit.md` §8):

  * descriptive User-Agent with a contact address,
  * a minimum spacing between outbound requests,
  * exponential backoff on 429/503 and on MediaWiki `maxlag` rejections,
  * **a failed call is never recorded as a miss** -- it raises `FetchError`,
    and the caller records it explicitly (`fetch_failed` / `api_error`).

Nothing here decides policy. Widths, floors and retry counts are passed in by
the calling script so they stay visible next to the rule they implement.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
STAGING = ROOT / "data" / "curated" / "staging"
MARTS = ROOT / "data" / "marts"
PUBLIC_ASSETS = ROOT / "public" / "assets"

# Contact address is required by the Wikimedia User-Agent policy. It is the
# maintainer's, not a role account -- single-maintainer product (RISKS.md 12).
USER_AGENT = (
    "YIELD-YARD-asset-pipeline/1.0 "
    "(https://github.com/nfl-o-nomics; reymuniziii@gmail.com) python-requests"
)

# Minimum spacing between outbound requests, seconds. The image audit used
# ~60ms. The first full asset run spent 100ms and drew 19 HTTP 429s from
# upload.wikimedia.org -- all recovered on the first retry, but a rate limit we
# are provoking on every run is a rate limit we are one bad day away from
# exhausting. Widened to 250ms 2026-07-25; the cold run cost is ~1 extra minute.
DEFAULT_SPACING_S = 0.250

# MediaWiki maxlag: shed our load when the replicas fall behind.
MAXLAG_S = 5

RETRY_STATUS = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    """A call exhausted its retries. NEVER swallow this into a miss."""


class DiskBudgetExceeded(RuntimeError):
    """Total bytes written passed the abort ceiling."""


# ------------------------------------------------------------------ pacing


class Pacer:
    """Enforces a minimum interval between outbound requests."""

    def __init__(self, spacing_s: float = DEFAULT_SPACING_S) -> None:
        self.spacing_s = spacing_s
        self._last = 0.0

    def wait(self) -> None:
        delta = time.monotonic() - self._last
        if delta < self.spacing_s:
            time.sleep(self.spacing_s - delta)
        self._last = time.monotonic()


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
    return s


# ------------------------------------------------------------------ fetch


def _sleep_backoff(attempt: int, resp: requests.Response | None, base_delay: float) -> None:
    """Exponential backoff with jitter, honouring Retry-After when offered."""
    delay = base_delay * (2 ** attempt)
    if resp is not None:
        ra = resp.headers.get("Retry-After")
        if ra:
            try:
                delay = max(delay, float(ra))
            except ValueError:
                pass
    time.sleep(min(delay, 60.0) + random.uniform(0, 0.25))


def http_get(
    session: requests.Session,
    url: str,
    *,
    pacer: Pacer,
    params: dict | None = None,
    max_attempts: int = 4,
    base_delay: float = 0.5,
    timeout: int = 90,
    log=None,
) -> requests.Response:
    """GET with spacing + exponential backoff. Raises FetchError when spent.

    `max_attempts` counts the first try. max_attempts=4 is "three retries",
    which is the rule the asset pipeline runs downloads under.
    """
    last = ""
    for attempt in range(max_attempts):
        pacer.wait()
        resp = None
        try:
            resp = session.get(url, params=params, timeout=timeout)
        except requests.RequestException as exc:
            last = f"{type(exc).__name__}: {exc}"
        else:
            if resp.status_code == 200:
                return resp
            last = f"HTTP {resp.status_code}"
            # 4xx other than 429 will not improve by asking again.
            if resp.status_code not in RETRY_STATUS:
                raise FetchError(f"{last} for {url}")
        if attempt < max_attempts - 1:
            if log:
                log(f"      retry {attempt + 1}/{max_attempts - 1} after {last}")
            _sleep_backoff(attempt, resp, base_delay)
    raise FetchError(f"exhausted {max_attempts} attempts ({last}) for {url}")


def mediawiki_api(
    session: requests.Session,
    api_url: str,
    params: dict,
    *,
    pacer: Pacer,
    max_attempts: int = 7,
    base_delay: float = 0.5,
    log=None,
) -> dict:
    """MediaWiki API call with maxlag + backoff over `max_attempts` tries.

    maxlag is answered with either HTTP 503 or a 200 carrying an error body;
    both are retried. An exhausted call raises -- it is an `api_error`, and
    `audit/findings_image_audit.md` §8 is explicit that this must never be
    allowed to look like "this player has no photo".
    """
    q = dict(params)
    q.setdefault("format", "json")
    q.setdefault("formatversion", "2")
    q.setdefault("maxlag", str(MAXLAG_S))

    last = ""
    for attempt in range(max_attempts):
        pacer.wait()
        resp = None
        try:
            resp = session.get(api_url, params=q, timeout=90)
            if resp.status_code == 200:
                data = resp.json()
                err = data.get("error") or {}
                if err.get("code") == "maxlag":
                    last = f"maxlag ({err.get('info', '')[:60]})"
                elif err:
                    raise FetchError(f"API error {err.get('code')}: {err.get('info')}")
                else:
                    return data
            else:
                last = f"HTTP {resp.status_code}"
                if resp.status_code not in RETRY_STATUS:
                    raise FetchError(f"{last} from API")
        except ValueError as exc:               # undecodable JSON
            last = f"bad JSON: {exc}"
        except requests.RequestException as exc:
            last = f"{type(exc).__name__}: {exc}"
        if attempt < max_attempts - 1:
            if log:
                log(f"      API retry {attempt + 1}/{max_attempts - 1} after {last}")
            _sleep_backoff(attempt, resp, base_delay)
    raise FetchError(f"API exhausted {max_attempts} attempts ({last})")


# ------------------------------------------------------------------ io


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_bytes_atomic(path: Path, data: bytes) -> None:
    """Write via a temp file + rename so a crash never leaves a torn asset."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def write_json(path: Path, obj) -> None:
    """Canonical JSON: 2-space indent, UTF-8 kept literal, trailing newline.

    Key order is whatever the caller built -- the callers build their dicts in
    a fixed order deliberately, so re-runs are diffable.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def read_json(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def dir_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def human_bytes(n: int) -> str:
    x = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if x < 1024 or unit == "GB":
            return f"{x:.1f} {unit}"
        x /= 1024
    return f"{x:.1f} GB"


def ext_for_content_type(content_type: str, fallback: str = ".jpg") -> str:
    """Extension follows what the origin actually served.

    Deliberately NOT a forced .jpg: 34 of the 244 Commons sources are PNG, and
    writing PNG bytes into a .jpg would put a lie in the manifest. Consumers
    read the filename out of the manifest, never by convention.
    """
    ct = (content_type or "").split(";")[0].strip().lower()
    return {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/svg+xml": ".svg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(ct, fallback)


def utcnow() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ------------------------------------------------------------------ dimensions


def _jpeg_dims(fh) -> tuple[int, int] | None:
    """Width/height from the first JPEG SOF marker."""
    if fh.read(2) != b"\xff\xd8":
        return None
    while True:
        b = fh.read(1)
        while b and b != b"\xff":
            b = fh.read(1)
        while b == b"\xff":
            b = fh.read(1)
        if not b:
            return None
        marker = b[0]
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        head = fh.read(2)
        if len(head) < 2:
            return None
        seg_len = int.from_bytes(head, "big")
        # SOF0..SOF15, minus DHT (c4), JPG (c8) and DAC (cc).
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            body = fh.read(5)
            if len(body) < 5:
                return None
            return int.from_bytes(body[3:5], "big"), int.from_bytes(body[1:3], "big")
        fh.seek(seg_len - 2, 1)


def image_dims(path: Path) -> tuple[int | None, int | None]:
    """Real pixel dimensions of a JPEG/PNG on disk.

    The pipeline reads these off the BYTES rather than trusting the Commons
    API's `thumbwidth`: that field echoes the width you asked for, while the
    service actually serves the next size up from a fixed bucket list. Asking
    for 600 and recording 600 while a 960px file lands on disk puts a lie in
    the manifest, so the manifest is built from the file instead.
    """
    try:
        with path.open("rb") as fh:
            head = fh.read(24)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                w, h = int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")
                return w, h
            fh.seek(0)
            dims = _jpeg_dims(fh)
            return dims if dims else (None, None)
    except (OSError, ValueError):
        return (None, None)
