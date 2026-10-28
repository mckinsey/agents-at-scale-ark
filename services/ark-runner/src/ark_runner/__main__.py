"""PID-1 entrypoint for the runner.

Contract (see specs/substrate-agent-runner): serve health/readiness, run the agent
once, then stay up until terminated so the executor can collect the result and `ax ssh`
works. Readiness flips only after the agent run succeeds.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import threading

from ark_sdk.executor import ApprovalRequiredError

from . import adapters, config, server

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ark-runner")


async def _run_agent() -> None:
    request = config.load_request()
    adapter = adapters.select(config.framework())
    logger.info("running agent %s via %s adapter", request.agent.name, adapter.name)
    try:
        messages = await adapter.run(request)
    except ApprovalRequiredError as approval:
        _emit_approval_required(approval)
        return
    payload = {"messages": [m.model_dump() for m in messages]}
    # Primary result channel: a single stdout sentinel line the executor reads from actor logs
    # (the Control API has no exec/cp). Tagged with the per-query nonce so the executor can pick
    # it out of a shared worker-pod log. Emit FIRST so the result survives a workspace write error.
    print(f"{config.RESULT_SENTINEL} {config.nonce()} {json.dumps(payload)}", flush=True)
    # Best-effort workspace artifact (for ssh/debug and a future cp-based channel).
    try:
        path = config.result_path()
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            json.dump(payload, f)
    except OSError as e:
        logger.warning("could not write result artifact %s: %s", config.result_path(), e)
    logger.info("agent finished")


def _emit_approval_required(approval: ApprovalRequiredError) -> None:
    """Emit the approval-required signal on the result channel. The executor turns this into
    an A2A input-required task so Ark's HITL approval/resumption flow takes over."""
    payload = {
        "status": "approval_required",
        "toolCalls": approval.tool_calls,
        "context": approval.context.model_dump(),
        "approval": {
            "timeout": approval.config.timeout,
            "onTimeout": approval.config.onTimeout,
        },
    }
    print(f"{config.RESULT_SENTINEL} {config.nonce()} {json.dumps(payload)}", flush=True)
    logger.info("agent paused for tool approval (%d call(s))", len(approval.tool_calls))


def main() -> None:
    server.start(int(os.environ.get("PORT", "80")))  # /healthz 200 now; /readyz 503 until ready
    try:
        asyncio.run(_run_agent())
    except Exception:
        logger.exception("agent run failed; leaving workspace not-ready for diagnosis")
    else:
        server.set_ready(True)

    # Stay up as PID-1 until the backend stops us (keeps metadata/ssh alive).
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    stop.wait()


if __name__ == "__main__":
    main()
