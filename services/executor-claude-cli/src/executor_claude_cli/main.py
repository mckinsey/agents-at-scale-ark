import logging

from ark_sdk.executor_app import ExecutorApp

from .config import EngineConfig
from .executor import ClaudeCliExecutor

logging.basicConfig(level=logging.INFO)


def main():
    config = EngineConfig.from_env()
    executor = ClaudeCliExecutor(config)
    app = ExecutorApp(
        executor=executor,
        engine_name="claude-cli",
        description="Claude CLI execution engine using Claude Code SDK",
    )
    app.run(host=config.host, port=config.port)


if __name__ == "__main__":
    main()
