"""Load the agent execution request the executor hands to the runner.

ark-substrate-executor serializes an `ExecutionEngineRequest` into the container env
(mirroring how AX delivers AX_TASK_YAML). The runner parses it back into the ark-sdk
type so the same request shape flows controller -> executor -> runner.
"""

from __future__ import annotations

import os

from ark_sdk.executor import ExecutionEngineRequest

REQUEST_ENV = "ARK_AGENT_REQUEST"  # JSON-serialized ExecutionEngineRequest
FRAMEWORK_ENV = "ARK_FRAMEWORK"  # adapter selector; default "completions"
RESULT_PATH_ENV = "ARK_RESULT_PATH"  # where the runner writes its result for the executor
RESULT_NONCE_ENV = "ARK_RESULT_NONCE"  # per-query tag stamped on the result/event sentinels
WORKSPACE_ENV = "ARK_WORKSPACE"

DEFAULT_RESULT_PATH = "/workspace/.ark-result.json"
DEFAULT_WORKSPACE = "/workspace"

# Single-line marker the runner prints to stdout carrying the result JSON; the executor
# reads it back from actor logs (keep in sync with ark_substrate_executor.executor).
RESULT_SENTINEL = "__ARK_RESULT__"

# Single-line marker for intermediate output (assistant text, tool calls) the executor
# relays to ark-broker as it appears in actor logs (keep in sync with the executor).
EVENT_SENTINEL = "__ARK_EVENT__"


def load_request() -> ExecutionEngineRequest:
    raw = os.environ.get(REQUEST_ENV)
    if not raw:
        raise RuntimeError(f"{REQUEST_ENV} is not set; the executor must supply the agent request")
    return ExecutionEngineRequest.model_validate_json(raw)


def framework() -> str:
    return os.environ.get(FRAMEWORK_ENV, "completions")


def nonce() -> str:
    """Per-query tag the executor stamped, echoed on the result/event sentinels so the
    executor can pick its own actor's output out of a shared worker-pod log."""
    return os.environ.get(RESULT_NONCE_ENV, "")


def result_path() -> str:
    return os.environ.get(RESULT_PATH_ENV, DEFAULT_RESULT_PATH)


def workspace() -> str:
    return os.environ.get(WORKSPACE_ENV, DEFAULT_WORKSPACE)
