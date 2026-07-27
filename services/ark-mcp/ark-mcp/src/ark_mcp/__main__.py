"""Main entry point for the Ark MCP server."""

import time

_BOOT_T0 = time.monotonic()

import logging  # noqa: E402
import os  # noqa: E402
import signal  # noqa: E402
import sys  # noqa: E402


def _boot_log(phase: str) -> None:
    print(f"BOOT {phase} {time.monotonic() - _BOOT_T0:.2f}s", flush=True)


_boot_log("process-start")

from .server import create_app  # noqa: E402

_boot_log("server-module-imported")

logger = logging.getLogger(__name__)


def _resolve_level(default: int = logging.INFO) -> int:
    """Resolve the log level from the LOG_LEVEL env var, falling back to INFO."""
    name = os.getenv("LOG_LEVEL", "").strip().upper()
    if not name:
        return default
    return logging.getLevelNamesMapping().get(name, default)


def setup_logging():
    """Configure logging for the application."""
    logging.basicConfig(
        level=_resolve_level(),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)]
    )


def _install_boot_signal_handlers() -> None:
    def _handler(signum, _frame):
        _boot_log(f"signal-{signum}")
        raise SystemExit(128 + signum)

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, _handler)


def main():
    """Main application entry point."""
    setup_logging()
    _boot_log("logging-configured")
    _install_boot_signal_handlers()
    logger.info("Starting Ark MCP Server")

    app = create_app()
    _boot_log("app-created")

    try:
        _boot_log("about-to-run")
        # Run the MCP server on port 2627 (AMCP on dial pad)
        app.run(transport="http", host="0.0.0.0", port=2627, path="/mcp", host_origin_protection=False)
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        logger.info("Ark MCP Server stopped")


if __name__ == "__main__":
    main()
