"""
Shared helpers, constants, and Kubernetes manifest builders for
marketplace executor tests.
"""

import base64
import json
import os
import subprocess
import time

import pytest
import requests


# ---------------------------------------------------------------------------
# Annotation keys
# ---------------------------------------------------------------------------

REASONING_KEY = "executor-openai-responses.ark.mckinsey.com/reasoning"
TOOLS_KEY     = "executor-openai-responses.ark.mckinsey.com/tools"
SCHEMA_KEY    = "executor-openai-responses.ark.mckinsey.com/output-schema"


# ---------------------------------------------------------------------------
# Model names
# ---------------------------------------------------------------------------

MODEL_DEFAULT = "gpt-4o"
MODEL_GPT5    = "gpt-5.2-2025-12-11"
MODEL_O4_MINI = "o4-mini"


# ---------------------------------------------------------------------------
# Built-in tool definitions
# ---------------------------------------------------------------------------

WEB_SEARCH_TOOL = [
    {
        "type": "web_search_preview",
        "user_location": {
            "type": "approximate",
            "country": "GB",
            "city": "London",
            "region": "London",
        },
    }
]

CODE_INTERPRETER_TOOL = [{"type": "code_interpreter", "container": "auto"}]


# ---------------------------------------------------------------------------
# Timing
# ---------------------------------------------------------------------------

ARK_TIMEOUT   = int(os.environ.get("ARK_QUERY_TIMEOUT", "300"))
POLL_INTERVAL = 5


# ---------------------------------------------------------------------------
# Executor connectivity helpers
# ---------------------------------------------------------------------------

def port_forward(port: int = 18090) -> tuple:
    """Start kubectl port-forward for executor-openai-responses.
    Returns (url, proc). Skips the test if the service is not found."""
    result = subprocess.run(
        ["kubectl", "get", "svc", "executor-openai-responses", "-n", "default"],
        capture_output=True,
    )
    if result.returncode != 0:
        pytest.skip(
            "executor-openai-responses service not found and EXECUTOR_URL not set. "
            "Deploy the executor or set EXECUTOR_URL."
        )
    subprocess.run(
        ["pkill", "-f", f"kubectl.*port-forward.*{port}"],
        capture_output=True,
    )
    time.sleep(1)
    proc = subprocess.Popen(
        ["kubectl", "port-forward", "-n", "default",
         "svc/executor-openai-responses", f"{port}:8000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(3)
    return f"http://localhost:{port}/execute", proc


def wait_for_executor(url: str, retries: int = 10, delay: float = 2.0):
    """Poll the executor /health endpoint until it responds 200 or skip."""
    health_url = url.replace("/execute", "/health")
    for _ in range(retries):
        try:
            resp = requests.get(health_url, timeout=10)
            if resp.status_code == 200:
                return
        except (requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout):
            pass
        time.sleep(delay)
    pytest.skip(f"Executor not reachable at {url} after {retries} retries")


# ---------------------------------------------------------------------------
# Kubernetes helpers
# ---------------------------------------------------------------------------

def kubectl_run(cmd: list, stdin: str = None, timeout: int = 30) -> tuple:
    """Run a kubectl command. Returns (ok, stdout, stderr)."""
    try:
        r = subprocess.run(
            cmd, input=stdin, capture_output=True, text=True, timeout=timeout,
        )
        return r.returncode == 0, r.stdout, r.stderr
    except Exception as e:
        return False, "", str(e)


def kubectl_apply(yaml_str: str, retries: int = 3, retry_delay: int = 10):
    """Apply a YAML manifest, retrying on webhook connection errors."""
    for attempt in range(retries):
        ok, _, err = kubectl_run(
            ["kubectl", "apply", "-f", "-"], stdin=yaml_str, timeout=120,
        )
        if ok:
            return
        if ("connection refused" in err or "failed calling webhook" in err) and attempt < retries - 1:
            time.sleep(retry_delay)
            continue
        assert False, f"kubectl apply failed:\n{err}"


def patch_webhooks(policy: str) -> bool:
    """Set failurePolicy on all Ark webhooks. Returns True if any were patched."""
    patched = False
    for kind, resource in [
        ("mutatingwebhookconfiguration",   "ark-mutating-webhook-configuration"),
        ("validatingwebhookconfiguration", "ark-validating-webhook-configuration"),
    ]:
        ok, stdout, _ = kubectl_run(["kubectl", "get", kind, resource, "-o", "json"])
        if not ok:
            continue
        try:
            config   = json.loads(stdout)
            webhooks = config.get("webhooks", [])
        except json.JSONDecodeError:
            continue
        ops = [
            {"op": "replace", "path": f"/webhooks/{i}/failurePolicy", "value": policy}
            for i in range(len(webhooks))
        ]
        if ops:
            ok, _, _ = kubectl_run([
                "kubectl", "patch", kind, resource,
                "--type=json", f"-p={json.dumps(ops)}",
            ])
            if ok:
                patched = True
    return patched


def poll_query(name: str, namespace: str, timeout: int = ARK_TIMEOUT) -> tuple:
    """Poll a Query CR until it reaches phase=done, error, or timeout.
    Returns (success, content, phase)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        ok, stdout, _ = kubectl_run(
            ["kubectl", "get", "query", name, "-n", namespace, "-o", "json"]
        )
        if ok and stdout:
            try:
                data   = json.loads(stdout)
                status = data.get("status", {})
                phase  = status.get("phase", "")
                if phase == "done":
                    content = status.get("response", {}).get("content", "")
                    return bool(content), content, phase
                if phase in ("error", "submit_failed"):
                    return False, None, phase
            except json.JSONDecodeError:
                pass
        time.sleep(POLL_INTERVAL)
    return False, None, "timeout"


# ---------------------------------------------------------------------------
# Kubernetes manifest builders
# ---------------------------------------------------------------------------

def secret_manifest(name: str, namespace: str, api_key: str, base_url: str) -> str:
    ak = base64.b64encode(api_key.encode()).decode()
    bu = base64.b64encode(base_url.encode()).decode()
    return f"""apiVersion: v1
kind: Secret
metadata:
  name: {name}
  namespace: {namespace}
type: Opaque
data:
  api-key: {ak}
  base-url: {bu}
"""


def model_manifest(name: str, namespace: str, model: str, secret_name: str) -> str:
    return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: {name}
  namespace: {namespace}
spec:
  provider: openai
  type: completions
  model:
    value: {model}
  config:
    openai:
      apiKey:
        valueFrom:
          secretKeyRef:
            name: {secret_name}
            key: api-key
      baseUrl:
        valueFrom:
          secretKeyRef:
            name: {secret_name}
            key: base-url
"""


def agent_manifest(
    name: str,
    namespace: str,
    model_name: str,
    execution_engine: str,
    prompt: str,
    labels: dict = None,
    parameters: list = None,
) -> str:
    label_block = ""
    if labels:
        label_lines = "\n".join(f'    {k}: "{v}"' for k, v in labels.items())
        label_block = f"  labels:\n{label_lines}\n"

    param_block = ""
    if parameters:
        param_lines = "\n".join(
            f"    - name: {p['name']}\n      value: {p['value']}"
            for p in parameters
        )
        param_block = f"  parameters:\n{param_lines}\n"

    return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {name}
  namespace: {namespace}
{label_block}spec:
  modelRef:
    name: {model_name}
  executionEngine:
    name: {execution_engine}
  prompt: |
    {prompt}
{param_block}"""


def query_manifest(
    name: str,
    namespace: str,
    agent_name: str,
    input_text: str,
    timeout: str = "5m",
    ttl: str = "1h",
) -> str:
    return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: {name}
  namespace: {namespace}
spec:
  target:
    type: agent
    name: {agent_name}
  input: "{input_text}"
  type: user
  timeout: {timeout}
  ttl: {ttl}
"""
