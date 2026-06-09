import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from typing import Optional, Tuple

# 8080 is frequently held by the devspace localhost-gateway (which 404s on
# ark-api routes without the right Host header), so fall back to less-contended
# ports for a direct port-forward to svc/ark-api.
CANDIDATE_PORTS = [8080, 8082, 8090]

_resolved_url: Optional[str] = None


def _health_ok(base_url: str, timeout: int = 2) -> bool:
    """Return True only when base_url/health is ark-api's own JSON health
    response. The devspace gateway / dashboard SPA also listen on common ports
    and may answer /health with HTML (200 or 404), so a status code alone is not
    enough to identify ark-api."""
    try:
        with urllib.request.urlopen(f"{base_url}/health", timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = json.loads(resp.read())
            return isinstance(body, dict) and body.get("service") == "ark-api"
    except Exception:
        return False


def _get_api_url() -> str:
    env_url = os.getenv("ARK_API_URL")
    if env_url:
        return env_url.rstrip("/")
    if _resolved_url:
        return _resolved_url
    return f"http://localhost:{CANDIDATE_PORTS[0]}"


def get_resource_status(resource: str, name: str, namespace: str = None) -> Tuple[int, dict]:
    url = f"{_get_api_url()}/v1/{resource}/{name}"
    if namespace:
        url += f"?namespace={namespace}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except Exception:
            body = {}
        return e.code, body
    except Exception as e:
        return 0, {"error": str(e)}


def send_request(
    path: str,
    method: str = "GET",
    headers: Optional[dict] = None,
    data: Optional[dict] = None,
    timeout: int = 10,
) -> Tuple[int, dict]:
    url = f"{_get_api_url()}{path}"
    body = None
    if data is not None:
        body = json.dumps(data).encode()
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
            except Exception:
                return resp.status, {"raw": raw.decode(errors="replace")}
    except urllib.error.HTTPError as e:
        try:
            parsed = json.loads(e.read())
        except Exception:
            parsed = {}
        return e.code, parsed
    except Exception as e:
        return 0, {"error": str(e)}


def ensure_port_forward(port: int = None) -> bool:
    """Make ark-api reachable and remember the resolved base URL for later
    send_request/get_resource_status calls.

    Resolution order:
    1. ARK_API_URL env var, if its /health returns 200.
    2. ark-api already reachable on a candidate port (200 on /health).
    3. Start a `kubectl port-forward svc/ark-api` on the first free candidate port.
    """
    global _resolved_url

    env_url = os.getenv("ARK_API_URL")
    if env_url:
        base = env_url.rstrip("/")
        if _health_ok(base):
            _resolved_url = base
            return True
        return False

    ports = [port] if port else CANDIDATE_PORTS

    for p in ports:
        base = f"http://localhost:{p}"
        if _health_ok(base):
            _resolved_url = base
            return True

    for p in ports:
        base = f"http://localhost:{p}"
        proc = subprocess.Popen(
            ["kubectl", "port-forward", "svc/ark-api", f"{p}:80", "-n", "default"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(15):
            # kubectl exits quickly if the port is already bound; skip that port.
            if proc.poll() is not None:
                break
            time.sleep(1)
            if _health_ok(base):
                _resolved_url = base
                return True
        if proc.poll() is None:
            proc.terminate()
    return False
