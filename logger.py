import json
import os
import re
import time
import datetime
import threading
from urllib.parse import urlparse, parse_qs
from mitmproxy import http

SESSION_DIR = os.environ.get("CLSNIFF_SESSION_DIR", "")
LOG_FILE = os.environ.get("CLSNIFF_LOG_FILE", "")
_mask_raw = os.environ.get("CLSNIFF_MASK_HEADERS", "")
MASK_HEADERS = {h.lower() for h in _mask_raw.split(",") if h.strip()}

_counter_lock = threading.Lock()
_counter = 0


def _next_id() -> int:
    global _counter
    with _counter_lock:
        _counter += 1
        return _counter


def _log(msg: str) -> None:
    if not LOG_FILE:
        return
    ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{ts} {msg}\n")
    except Exception:
        pass


def _mask(headers: dict) -> dict:
    # Normalize header names to lowercase (consistent with Node.js http module behaviour)
    # and replace masked header values with "***".
    result = {}
    for k, v in headers.items():
        key = k.lower()
        result[key] = "***" if key in MASK_HEADERS else v
    return result


def _parse_body(raw: str):
    if not raw or not raw.strip():
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw


def _parse_sse_events(raw: str) -> list:
    events = []
    for block in re.split(r"\n{2,}", raw):
        lines = block.split("\n")
        evt = {}
        for line in lines:
            if line.startswith("event:"):
                evt["event"] = line[6:].strip()
            elif line.startswith("data:"):
                chunk = line[5:].strip()
                evt["data"] = (evt["data"] + "\n" + chunk) if "data" in evt else chunk
            elif line.startswith("id:"):
                evt["id"] = line[3:].strip()
        if not evt:
            continue
        if "data" in evt:
            try:
                evt["data"] = json.loads(evt["data"])
            except Exception:
                pass
        events.append(evt)
    return events


def request(flow: http.HTTPFlow) -> None:
    flow.metadata["clsniff_start"] = time.time()


def response(flow: http.HTTPFlow) -> None:
    if not SESSION_DIR:
        return

    start = flow.metadata.get("clsniff_start", time.time())
    duration_ms = round((time.time() - start) * 1000, 3)

    url = flow.request.pretty_url

    try:
        res_text = flow.response.get_text(strict=False)
    except Exception:
        res_text = ""

    content_type = flow.response.headers.get("content-type", "")
    is_sse = "text/event-stream" in content_type

    if is_sse:
        body = _parse_sse_events(res_text)
    else:
        body = _parse_body(res_text)

    req_content_type = flow.request.headers.get("content-type", "")
    try:
        req_text = flow.request.get_text(strict=False)
    except Exception:
        req_text = ""

    if "application/x-www-form-urlencoded" in req_content_type:
        parsed = parse_qs(req_text, keep_blank_values=True)
        req_body = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
    else:
        req_body = _parse_body(req_text)

    entry_id = _next_id()
    now = datetime.datetime.now(datetime.timezone.utc)

    entry = {
        "id": entry_id,
        "timestamp": now.isoformat(),
        "duration_ms": duration_ms,
        "request": {
            "method": flow.request.method,
            "url": url,
            "headers": _mask(dict(flow.request.headers)),
            "body": req_body,
        },
        "response": {
            "status": flow.response.status_code,
            "status_reason": flow.response.reason or None,
            "headers": _mask(dict(flow.response.headers)),
            "body": body,
        },
    }

    ts_ms = int(time.time() * 1000)
    filename = os.path.join(SESSION_DIR, f"{ts_ms}_{entry_id}.json")
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(entry, f, indent=2, ensure_ascii=False)
    except Exception:
        return

    try:
        parsed_url = urlparse(url)
        origin = f"{parsed_url.scheme}://{parsed_url.netloc}"
        path_part = parsed_url.path or "/"
        file_uri = "file:///" + filename.replace("\\", "/").lstrip("/")
        _log(f"{flow.request.method} {origin}{path_part} {flow.response.status_code} {file_uri}")
    except Exception:
        pass
