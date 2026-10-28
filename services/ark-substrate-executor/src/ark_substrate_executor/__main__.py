"""Run the Substrate executor as an A2A server (the ExecutionEngine endpoint)."""

import asyncio
import logging
import os

from ark_sdk.executor_app import ExecutorApp

from .executor import SubstrateExecutor

logging.basicConfig(level=logging.INFO)


def main() -> None:
    executor = SubstrateExecutor()
    # Pre-flight: fail fast on an unreachable or version-incompatible Substrate (task 5.1).
    asyncio.run(executor.substrate.preflight())
    app = ExecutorApp(executor, "Substrate")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))


if __name__ == "__main__":
    main()
