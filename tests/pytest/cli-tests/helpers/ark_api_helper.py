import json
import os
import urllib.error
import urllib.request
from urllib.parse import urljoin
from typing import Tuple

_DEFAULT_API_URL = "http://ark-api.default.127.0.0.1.nip.io:8080"


def get_api_url() -> str:
    return os.getenv("ARK_API_URL", _DEFAULT_API_URL).rstrip("/")


def _health_ok(base_url: str, timeout: int = 2) -> bool:
    try:
        with urllib.request.urlopen(urljoin(base_url, "/health"), timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = json.loads(resp.read())
            return isinstance(body, dict) and body.get("service") == "ark-api"
    except Exception:
        return False


def is_api_reachable() -> bool:
    return _health_ok(get_api_url())


def get_resource_status(resource: str, name: str, namespace: str = None) -> Tuple[int, dict]:
    path = f"/v1/{resource}/{name}"
    if namespace:
        path += f"?namespace={namespace}"
    req = urllib.request.Request(urljoin(get_api_url(), path))
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except (json.JSONDecodeError, ValueError):
            body = {}
        return e.code, body
    except urllib.error.URLError as e:
        return 0, {"error": str(e)}


def send_request(
    path: str,
    method: str = "GET",
    headers: dict = None,
    data: dict = None,
    timeout: int = 10,
) -> Tuple[int, dict]:
    url = urljoin(get_api_url(), path)
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                return resp.status, {"raw": raw.decode(errors="replace")}
    except urllib.error.HTTPError as e:
        try:
            parsed = json.loads(e.read())
        except (json.JSONDecodeError, ValueError):
            parsed = {}
        return e.code, parsed
    except urllib.error.URLError as e:
        return 0, {"error": str(e)}
