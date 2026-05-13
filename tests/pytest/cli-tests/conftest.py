import logging
import subprocess
from pathlib import Path

import pytest

logger = logging.getLogger(__name__)

MOCK_LLM_MODEL_YAML = Path(__file__).parent / "mock-llm-model.yaml"
MOCK_LLM_MODEL_NAME = "test-model-mock"


@pytest.fixture(scope="session", autouse=True)
def mock_llm_model():
    subprocess.run(
        ["kubectl", "delete", "-f", str(MOCK_LLM_MODEL_YAML), "--ignore-not-found"],
        capture_output=True
    )
    result = subprocess.run(
        ["kubectl", "apply", "-f", str(MOCK_LLM_MODEL_YAML)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.warning("kubectl apply mock-llm-model failed (rc=%d): %s %s",
                       result.returncode, result.stdout.strip(), result.stderr.strip())

    mock_llm_present = subprocess.run(
        ["kubectl", "get", "deployment", "mock-llm", "-n", "default"],
        capture_output=True
    ).returncode == 0

    if mock_llm_present:
        subprocess.run(
            ["kubectl", "wait", "--for=condition=ModelAvailable",
             f"model/{MOCK_LLM_MODEL_NAME}", "-n", "default", "--timeout=180s"],
            check=True
        )
    else:
        logger.warning("mock-llm deployment not found — skipping ModelAvailable wait")

    yield MOCK_LLM_MODEL_NAME

    subprocess.run(
        ["kubectl", "delete", "-f", str(MOCK_LLM_MODEL_YAML), "--ignore-not-found"],
        capture_output=True
    )
