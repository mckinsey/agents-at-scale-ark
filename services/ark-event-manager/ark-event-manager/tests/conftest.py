"""Pytest configuration and fixtures for ark-event-manager tests."""

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
import httpx


@pytest.fixture(scope="session")
def service_url():
    """Get the service URL from environment or use default."""
    return os.getenv("AEM_URL", "http://localhost:8080")


@pytest.fixture(scope="session")
def ensure_proto_generated():
    """Ensure proto code is generated before tests run."""
    service_dir = Path(__file__).parent.parent
    generated_path = service_dir / "generated"
    proto_file = generated_path / "event_pb2.py"
    
    if proto_file.exists():
        return
    
    # Import and run generate_proto function
    from tests.generate_proto import generate_proto
    generate_proto()
    
    if not proto_file.exists():
        pytest.skip(f"Proto file not generated at {proto_file}")


@pytest.fixture(scope="session")
def service_process(ensure_proto_generated):
    """
    Start the event manager service for integration tests.
    
    This fixture starts the service in the background and waits for it to be ready.
    The service is stopped after all tests complete.
    """
    service_dir = Path(__file__).parent.parent
    service_url = os.getenv("AEM_URL", "http://localhost:8080")
    
    # Check if service is already running
    try:
        response = httpx.get(f"{service_url}/health", timeout=2.0)
        if response.status_code == 200:
            yield service_url
            return
    except (httpx.ConnectError, httpx.TimeoutException):
        pass
    
    # Start service if not running
    env = os.environ.copy()
    env["USE_DATABASE"] = "true"
    env["PYTHONPATH"] = str(service_dir / "src")
    
    process = subprocess.Popen(
        [sys.executable, "-m", "ark_event_manager"],
        cwd=service_dir,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    
    # Wait for service to be ready
    max_wait = 30
    wait_interval = 0.5
    service_ready = False
    for _ in range(int(max_wait / wait_interval)):
        try:
            response = httpx.get(f"{service_url}/health", timeout=2.0)
            if response.status_code == 200:
                service_ready = True
                break
        except (httpx.ConnectError, httpx.TimeoutException):
            time.sleep(wait_interval)
    
    if not service_ready:
        process.terminate()
        stdout, stderr = process.communicate(timeout=5)
        pytest.fail(
            f"Service failed to start within {max_wait}s.\n"
            f"STDOUT: {stdout.decode()}\n"
            f"STDERR: {stderr.decode()}"
        )
    
    yield service_url
    
    # Cleanup
    try:
        process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()

