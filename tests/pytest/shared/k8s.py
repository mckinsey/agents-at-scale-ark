"""Shared kubectl helpers for reading and changing cluster resources.

Centralises the `kubectl` calls both test suites need so individual tests and
resource helpers don't each re-implement them.
"""

import json
import subprocess

DEFAULT_NAMESPACE = "default"
DEFAULT_TIMEOUT = 30
DEFAULT_WAIT_TIMEOUT = 120


def apply_yaml(manifest: str, timeout: int = DEFAULT_TIMEOUT) -> tuple[bool, str]:
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
) -> tuple[bool, str]:
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


def get_resource(
    kind: str,
    name: str,
    namespace: str = DEFAULT_NAMESPACE,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict | None:
    """Read one resource as a dict, or None when it does not exist."""
    result = subprocess.run(
        ["kubectl", "get", kind, name, "-n", namespace, "-o", "json"],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        if "NotFound" in result.stderr:
            return None
        raise RuntimeError(f"kubectl get {kind}/{name}: {result.stderr.strip()}")
    return json.loads(result.stdout)


def list_resources(
    kind: str,
    namespace: str = DEFAULT_NAMESPACE,
    timeout: int = DEFAULT_TIMEOUT,
) -> list[dict]:
    """List every resource of a kind in a namespace."""
    result = subprocess.run(
        ["kubectl", "get", kind, "-n", namespace, "-o", "json"],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(f"kubectl get {kind}: {result.stderr.strip()}")
    return json.loads(result.stdout).get("items", [])


def wait_for_resource(
    kind: str,
    name: str,
    condition: str,
    namespace: str = DEFAULT_NAMESPACE,
    timeout_s: int = DEFAULT_WAIT_TIMEOUT,
) -> tuple[bool, str]:
    """Watch a resource until `condition` holds, via `kubectl wait`.

    `condition` is passed straight through as the --for value, so it takes
    either form kubectl accepts: "condition=ModelAvailable" or
    "jsonpath={.status.phase}=done". This watches rather than polls.
    """
    try:
        result = subprocess.run(
            ["kubectl", "wait", f"{kind}/{name}", "-n", namespace,
             f"--for={condition}", f"--timeout={timeout_s}s"],
            capture_output=True,
            text=True,
            timeout=timeout_s + 30,
        )
    except subprocess.TimeoutExpired:
        return False, f"kubectl wait on {kind}/{name} timed out after {timeout_s}s"
    ok = result.returncode == 0
    return ok, result.stdout if ok else result.stderr


def wait_for_phase(
    kind: str,
    name: str,
    phase: str,
    namespace: str = DEFAULT_NAMESPACE,
    timeout_s: int = DEFAULT_WAIT_TIMEOUT,
) -> tuple[bool, str]:
    """Watch a resource until its status.phase reaches `phase`."""
    return wait_for_resource(
        kind, name, "jsonpath={.status.phase}=" + phase, namespace, timeout_s
    )


def get_condition(resource: dict, condition_type: str) -> dict:
    """The named condition from a resource's status; fails when it is absent."""
    conditions = (resource.get("status") or {}).get("conditions") or []
    matching = [
        condition for condition in conditions
        if condition.get("type") == condition_type
    ]
    assert matching, (
        f"{resource.get('kind') or 'resource'} {resource['metadata']['name']} has no "
        f"{condition_type} condition; conditions were {conditions}"
    )
    return matching[0]
