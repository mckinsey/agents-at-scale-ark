"""Pytest configuration and fixtures for ark-event-manager tests."""

import logging
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
import httpx


@pytest.fixture(scope="session", autouse=True)
def configure_logging(request):
    """Configure logging for integration tests to show demo logs."""
    # Only enable verbose logging if running integration tests
    if "integration" in request.keywords:
        # Configure root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)
        
        # Remove existing handlers to avoid duplicates
        root_logger.handlers.clear()
        
        # Create console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)8s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)


@pytest.fixture(scope="session")
def service_url():
    """Get the service URL from environment or use default."""
    return os.getenv("AEM_URL", "http://localhost:8080")


@pytest.fixture(scope="session")
def service_process():
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
    
    # Use uv run to ensure dependencies are available
    # Use unbuffered output and forward to stdout so logs are visible
    process = subprocess.Popen(
        ["uv", "run", "python", "-u", "-m", "ark_event_manager"],
        cwd=service_dir,
        env=env,
        stdout=sys.stdout,  # Forward service logs to test output
        stderr=sys.stderr,
        bufsize=0,  # Unbuffered
    )
    
    # Give process a moment to start
    time.sleep(1)
    
    # Check if process is still alive (if it died immediately, there's an error)
    if process.poll() is not None:
        # Give it a moment to show any error output
        time.sleep(0.5)
        pytest.fail(
            f"Service process exited immediately with code {process.returncode}."
        )
    
    # Wait for service to be ready
    max_wait = 30
    wait_interval = 0.5
    service_ready = False
    for _ in range(int(max_wait / wait_interval)):
        # Check if process is still running
        if process.poll() is not None:
            # Give it a moment to show any error output
            time.sleep(0.5)
            pytest.fail(
                f"Service process exited with code {process.returncode}."
            )
        
        try:
            response = httpx.get(f"{service_url}/health", timeout=2.0)
            if response.status_code == 200:
                service_ready = True
                break
        except (httpx.ConnectError, httpx.TimeoutException):
            time.sleep(wait_interval)
    
    if not service_ready:
        process.terminate()
        time.sleep(0.5)  # Give it a moment to show any error output
        pytest.fail(
            f"Service failed to start within {max_wait}s."
        )
    
    yield service_url
    
    # Cleanup
    try:
        process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()

