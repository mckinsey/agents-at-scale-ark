import logging
import os
import subprocess
import time
from pathlib import Path

import pytest

from helpers.ark_api_helper import _health_ok

logger = logging.getLogger(__name__)

MOCK_LLM_MODEL_YAML = Path(__file__).parent / "mock-llm-model.yaml"
MOCK_LLM_MODEL_NAME = "test-model-mock"

_NIP_URL = "http://ark-api.default.127.0.0.1.nip.io:8080"
_PORT_BASE = 18080


@pytest.fixture(scope="session", autouse=True)
def ark_api_url(request):
    """Resolve a reachable ark-api base URL and expose it via ARK_API_URL.

    Resolution order:
    1. ARK_API_URL env var — set this in CI (e.g. alongside a port-forward step).
    2. localhost-gateway nip.io URL — works when devspace / localhost-gateway is running locally.
    3. kubectl port-forward fallback — for local clusters without a gateway.
    """
    if os.environ.get("ARK_API_URL"):
        yield os.environ["ARK_API_URL"]
        return

    if _health_ok(_NIP_URL):
        os.environ["ARK_API_URL"] = _NIP_URL
        yield _NIP_URL
        os.environ.pop("ARK_API_URL", None)
        return

    worker_id = getattr(request.config, "workerinput", {}).get("workerid", "gw0")
    try:
        port = _PORT_BASE + int(worker_id.lstrip("gw"))
    except ValueError:
        port = _PORT_BASE

    url = f"http://localhost:{port}"
    logger.info("Starting port-forward svc/ark-api → :%d (worker=%s)", port, worker_id)

    proc = subprocess.Popen(
        ["kubectl", "port-forward", "svc/ark-api", f"{port}:80", "-n", "default"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    for _ in range(20):
        time.sleep(1)
        if _health_ok(url):
            break
    else:
        proc.terminate()
        pytest.exit(f"ark-api port-forward on :{port} did not become healthy in 20s", returncode=1)

    os.environ["ARK_API_URL"] = url
    yield url

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    os.environ.pop("ARK_API_URL", None)


@pytest.fixture(scope="session", autouse=True)
def mock_llm_model(request):
    result = subprocess.run(
        ["kubectl", "apply", "-f", str(MOCK_LLM_MODEL_YAML)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.warning("kubectl apply mock-llm-model failed (rc=%d): %s %s",
                       result.returncode, result.stdout.strip(), result.stderr.strip())

    subprocess.run(
        ["kubectl", "wait", "--for=condition=ModelAvailable",
         f"model/{MOCK_LLM_MODEL_NAME}", "-n", "default", "--timeout=60s"],
        check=True
    )

    yield MOCK_LLM_MODEL_NAME

    worker_id = getattr(request.config, "workerinput", {}).get("workerid", "master")
    if worker_id == "master":
        subprocess.run(
            ["kubectl", "delete", "-f", str(MOCK_LLM_MODEL_YAML), "--ignore-not-found"],
            capture_output=True
        )
