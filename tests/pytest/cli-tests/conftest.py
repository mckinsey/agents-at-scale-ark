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
    subprocess.run(
        ["kubectl", "apply", "-f", str(MOCK_LLM_MODEL_YAML)],
        capture_output=True, text=True, check=True
    )
    subprocess.run(
        ["kubectl", "wait", "--for=condition=ModelAvailable",
         f"model/{MOCK_LLM_MODEL_NAME}", "-n", "default", "--timeout=120s"],
        check=True
    )

    yield MOCK_LLM_MODEL_NAME

    subprocess.run(
        ["kubectl", "delete", "-f", str(MOCK_LLM_MODEL_YAML), "--ignore-not-found"],
        capture_output=True
    )
