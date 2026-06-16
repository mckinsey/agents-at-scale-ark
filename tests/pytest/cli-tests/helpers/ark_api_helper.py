import os
import subprocess
from typing import Tuple
import urllib.request
import urllib.error
import json


_DEFAULT_API_URL = "http://ark-api.default.127.0.0.1.nip.io:8080"

ARK_API_URL = "http://localhost:8080"


def get_api_url() -> str:
    return os.environ.get("ARK_API_URL", _DEFAULT_API_URL).rstrip("/")


def is_api_reachable(timeout: int = 2) -> bool:
    try:
        urllib.request.urlopen(f"{get_api_url()}/health", timeout=timeout)
        return True
    except (urllib.error.URLError, OSError):
        return False


def _get_api_url() -> str:
    return get_api_url()


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


def ensure_port_forward(port: int = 8080) -> bool:
    try:
        urllib.request.urlopen(f"http://localhost:{port}/health", timeout=2)
        return True
    except Exception:
        pass
    subprocess.Popen(
        ["kubectl", "port-forward", "svc/ark-api", f"{port}:80", "-n", "default"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    import time
    for _ in range(10):
        time.sleep(1)
        try:
            urllib.request.urlopen(f"http://localhost:{port}/health", timeout=2)
            return True
        except Exception:
            continue
    return False
