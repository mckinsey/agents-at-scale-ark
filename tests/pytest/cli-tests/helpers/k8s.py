"""Shared kubectl helpers for applying and deleting cluster resources.

Centralises `kubectl apply`/`kubectl delete` so individual tests and resource
helpers don't each re-implement them.
"""

import subprocess
from typing import Tuple

DEFAULT_NAMESPACE = "default"
DEFAULT_TIMEOUT = 30


def apply_yaml(manifest: str, timeout: int = DEFAULT_TIMEOUT) -> Tuple[bool, str]:
    """Apply one or more YAML documents (as a string) via `kubectl apply -f -`."""
    try:
        result = subprocess.run(
            ["kubectl", "apply", "-f", "-"],
            input=manifest,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, f"kubectl apply timed out after {timeout}s"
    ok = result.returncode == 0
    return ok, result.stdout if ok else result.stderr


def delete_resource(
    kind: str,
    name: str,
    namespace: str = DEFAULT_NAMESPACE,
    timeout: int = DEFAULT_TIMEOUT,
) -> Tuple[bool, str]:
    """Delete a resource by kind/name; not-found is ignored so calls are idempotent."""
    try:
        result = subprocess.run(
            ["kubectl", "delete", kind, name, "-n", namespace, "--ignore-not-found=true"],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, f"kubectl delete timed out after {timeout}s"
    ok = result.returncode == 0
    return ok, result.stdout if ok else result.stderr
