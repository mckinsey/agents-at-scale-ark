"""
Shared helpers, constants, and Kubernetes manifest builders for
executor-openai-responses tests (test_responses.py).
"""

import base64
import json
import os
import subprocess
import time
import uuid
from typing import Optional

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

MODEL_NON_GPT5 = "gpt-4o"
MODEL_GPT5     = "gpt-5.2-2025-12-11"
MODEL_O1       = "o1"
MODEL_O3       = "o3"
MODEL_O4_MINI  = "o4-mini"


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

COMPANY_LOOKUP_SCHEMA = {
    "type": "object",
    "properties": {
        "company_name":           {"type": "string"},
        "website_url":            {"type": "string"},
        "companies_house_number": {"type": "string"},
        "registered_address":     {"type": "string"},
        "company_status":         {"type": "string"},
    },
    "required": [
        "company_name", "website_url", "companies_house_number",
        "registered_address", "company_status",
    ],
    "additionalProperties": False,
}

SQL_CFG_TOOL = [
    {
        "type": "custom",
        "name": "generate_sql",
        "description": "Generate a valid read-only PostgreSQL SELECT query constrained by grammar",
        "format": {
            "type": "grammar",
            "syntax": "lark",
            "definition": (
                'SP: " "\nCOMMA: ","\nGT: ">"\nLT: "<"\nEQ: "="\nSEMI: ";"\n\n'
                'start: "SELECT" SP select_list SP "FROM" SP table '
                'where_clause? order_clause? limit_clause SEMI\n\n'
                'select_list: "*" | column (COMMA SP column)*\ncolumn: IDENTIFIER\n\n'
                'table: IDENTIFIER\n\n'
                'where_clause: SP "WHERE" SP condition (SP "AND" SP condition)*\n'
                'condition: IDENTIFIER SP op SP value\n'
                'op: GT | LT | EQ | ">=" | "<=" | "!="\n'
                'value: NUMBER | QUOTED_STRING\n\n'
                'order_clause: SP "ORDER" SP "BY" SP IDENTIFIER SP ("ASC" | "DESC")\n'
                'limit_clause: SP "LIMIT" SP NUMBER\n\n'
                'IDENTIFIER: /[A-Za-z_][A-Za-z0-9_]*/\nNUMBER: /[0-9]+/\n'
                "QUOTED_STRING: /\\'[^']*\\'/\n"
            ),
        },
    }
]


# ---------------------------------------------------------------------------
# ARK stack timing constants
# ---------------------------------------------------------------------------

ARK_CONCURRENT = int(os.environ.get("ARK_CONCURRENT_QUERIES", "3"))
ARK_TIMEOUT    = int(os.environ.get("ARK_QUERY_TIMEOUT", "300"))
POLL_INTERVAL  = 5


# ---------------------------------------------------------------------------
# Executor port-forward helpers
# ---------------------------------------------------------------------------

def kill_port_forward(pf_port: int, pf_proc: Optional[subprocess.Popen]) -> None:
    if pf_proc is not None:
        try:
            pf_proc.terminate()
            pf_proc.wait(timeout=5)
        except Exception:
            pass
    subprocess.run(
        ["pkill", "-f", f"kubectl.*port-forward.*{pf_port}"],
        capture_output=True,
    )
    time.sleep(1)


def start_port_forward(pf_port: int) -> tuple:
    result = subprocess.run(
        ["kubectl", "get", "svc", "executor-openai-responses", "-n", "default"],
        capture_output=True,
    )
    if result.returncode != 0:
        pytest.skip(
            "executor-openai-responses service not found and EXECUTOR_URL not set. "
            "Deploy the executor or set EXECUTOR_URL."
        )

    proc = subprocess.Popen(
        ["kubectl", "port-forward", "-n", "default",
         "svc/executor-openai-responses", f"{pf_port}:8000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(3)
    return f"http://localhost:{pf_port}/execute", proc


def reconnect_executor(pf_port: int, pf_proc: Optional[subprocess.Popen],
                       skip_on_failure: bool = False) -> tuple:
    subprocess.run(
        ["kubectl", "wait", "--for=condition=ready", "pod",
         "-l", "app=executor-openai-responses", "-n", "default", "--timeout=90s"],
        capture_output=True,
    )
    executor_url, new_proc = start_port_forward(pf_port)
    wait_for_executor(executor_url, skip_on_failure=skip_on_failure)
    return executor_url, new_proc


def wait_for_executor(executor_url: str, retries: int = 10, delay: float = 2.0,
                      skip_on_failure: bool = False) -> None:
    health_url = executor_url.replace("/execute", "/health")
    for _ in range(retries):
        try:
            resp = requests.get(health_url, timeout=20)
            if resp.status_code == 200:
                return
        except (requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout):
            pass
        time.sleep(delay)
    msg = f"Executor not reachable at {executor_url} after {retries} retries"
    if skip_on_failure:
        pytest.skip(msg)
    else:
        raise RuntimeError(msg)


def clear_sessions() -> None:
    pod = subprocess.run(
        ["kubectl", "get", "pod", "-n", "default",
         "-l", "app=executor-openai-responses",
         "-o", "jsonpath={.items[0].metadata.name}"],
        capture_output=True, text=True,
    )
    if pod.returncode == 0 and pod.stdout.strip():
        subprocess.run(
            ["kubectl", "exec", "-n", "default", pod.stdout.strip(),
             "--", "rm", "-rf", "/data/sessions/"],
            capture_output=True,
        )


# ---------------------------------------------------------------------------
# Kubernetes helpers
# ---------------------------------------------------------------------------

def kubectl_run(cmd: list, data: str = None, timeout: int = 30) -> tuple:
    try:
        r = subprocess.run(
            cmd, input=data, capture_output=True, text=True, timeout=timeout,
        )
        return r.returncode == 0, r.stdout, r.stderr
    except Exception as e:
        return False, "", str(e)


def patch_webhooks(policy: str) -> bool:
    """Set failurePolicy on all Ark webhooks to avoid timing-related failures during CRD setup."""
    patched = False
    for kind, resource in [
        ("mutatingwebhookconfiguration",  "ark-mutating-webhook-configuration"),
        ("validatingwebhookconfiguration", "ark-validating-webhook-configuration"),
    ]:
        ok, stdout, _ = kubectl_run(["kubectl", "get", kind, resource, "-o", "json"])
        if not ok:
            continue
        try:
            config = json.loads(stdout)
            webhooks = config.get("webhooks", [])
        except json.JSONDecodeError:
            continue
        ops = [
            {"op": "replace", "path": f"/webhooks/{i}/failurePolicy", "value": policy}
            for i, _ in enumerate(webhooks)
        ]
        if not ops:
            continue
        ok, _, _ = kubectl_run([
            "kubectl", "patch", kind, resource,
            "--type=json", f"-p={json.dumps(ops)}",
        ])
        if ok:
            patched = True
    return patched


def wait_for_webhook_ready(namespace: str = "ark-system",
                           retries: int = 20, delay: float = 10.0) -> None:
    for _ in range(retries):
        ok, stdout, _ = kubectl_run([
            "kubectl", "get", "endpoints", "ark-webhook-service",
            "-n", namespace, "-o", "json",
        ])
        if ok and stdout:
            try:
                data = json.loads(stdout)
                for subset in data.get("subsets", []):
                    if subset.get("addresses"):
                        return
            except json.JSONDecodeError:
                continue
        time.sleep(delay)
    pytest.skip(f"ark-webhook-service not ready after {retries} retries")


def kubectl_apply(yaml_str: str, namespace: str = "default",
                  retries: int = 3, timeout: int = 120) -> None:
    for attempt in range(retries):
        ok, _, err = kubectl_run(
            ["kubectl", "apply", "-f", "-"], data=yaml_str, timeout=timeout,
        )
        if ok:
            return
        if ("connection refused" in err or "failed calling webhook" in err) and attempt < retries - 1:
            wait_for_webhook_ready()
            continue
        assert False, f"kubectl apply failed:\n{err}\n---\n{yaml_str}"


def check_executor_ready(namespace: str = "default") -> None:
    ok, _, _ = kubectl_run([
        "kubectl", "get", "executionengine", "executor-openai-responses",
        "-n", namespace, "-o", "jsonpath={.status.phase}",
    ])
    if not ok:
        pytest.skip("executor-openai-responses ExecutionEngine not found in cluster")


# ---------------------------------------------------------------------------
# Kubernetes manifest builders
# ---------------------------------------------------------------------------

def build_secret_manifest(name: str, namespace: str, api_key: str, base_url: str) -> str:
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


def build_model_manifest(name: str, namespace: str, secret_name: str,
                   model: str = "gpt-4o") -> str:
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


def build_agent_manifest(name: str, namespace: str, model_name: str,
                   prompt: str = "You are a concise assistant. Answer questions directly and briefly.\nDo not add unnecessary explanation or caveats.\n") -> str:
    indented_prompt = prompt.strip().replace("\n", "\n    ")
    return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {name}
  namespace: {namespace}
spec:
  modelRef:
    name: {model_name}
  executionEngine:
    name: executor-openai-responses
  prompt: |
    {indented_prompt}
"""


def build_query_manifest(name: str, namespace: str, agent_name: str,
                         input_text: str, annotations: Optional[dict] = None) -> str:
    ann_block = ""
    if annotations:
        lines = "\n".join(
            f"    {k}: {json.dumps(str(v))}"
            for k, v in annotations.items()
        )
        ann_block = f"  annotations:\n{lines}\n"
    safe_input = input_text.replace('"', '\\"')
    return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: {name}
  namespace: {namespace}
{ann_block}spec:
  target:
    type: agent
    name: {agent_name}
  input: "{safe_input}"
  type: user
  timeout: 5m
  ttl: 1h
"""


# ---------------------------------------------------------------------------
# Query lifecycle helpers
# ---------------------------------------------------------------------------

def submit_query(name: str, input_text: str, agent_name: str,
                 namespace: str, created_queries: list,
                 annotations: Optional[dict] = None) -> bool:
    ok, _, _ = kubectl_run(
        ["kubectl", "apply", "-f", "-"],
        data=build_query_manifest(name, namespace, agent_name, input_text, annotations),
        timeout=120,
    )
    if ok:
        created_queries.append(name)
    return ok


def poll_query(name: str, namespace: str,
               timeout: int = ARK_TIMEOUT) -> tuple:
    deadline = time.time() + timeout
    while time.time() < deadline:
        ok, stdout, _ = kubectl_run([
            "kubectl", "get", "query", name, "-n", namespace, "-o", "json",
        ])
        if ok and stdout:
            try:
                data   = json.loads(stdout)
                status = data.get("status", {})
                phase  = status.get("phase", "")

                if phase == "done":
                    content = status.get("response", {}).get("content", "")
                    if not content:
                        return False, None, "empty_response"
                    return True, content, phase

                if phase in ("error", "submit_failed"):
                    return False, None, phase

            except json.JSONDecodeError:
                pass
        time.sleep(POLL_INTERVAL)

    return False, None, "timeout"


def run_query(name: str, input_text: str, agent_name: str,
              namespace: str, created_queries: list,
              annotations: Optional[dict] = None) -> tuple:
    if not submit_query(name, input_text, agent_name, namespace, created_queries, annotations):
        return False, None, "submit_failed"
    return poll_query(name, namespace)


def unique_name(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"
