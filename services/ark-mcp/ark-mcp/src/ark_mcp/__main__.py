"""Main entry point for the Ark MCP server."""

import logging
import os
import sys
from .server import create_app

logger = logging.getLogger(__name__)


def _resolve_level(default: int = logging.INFO) -> int:
    """Resolve the log level from the LOG_LEVEL env var, falling back to INFO."""
    name = os.getenv("LOG_LEVEL", "").strip().upper()
    if not name:
        return default
    level = getattr(logging, name, None)
    return level if isinstance(level, int) else default


def setup_logging():
    """Configure logging for the application."""
    logging.basicConfig(
        level=_resolve_level(),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)]
    )


def main():
    """Main application entry point."""
    setup_logging()
    logger.info("Starting Ark MCP Server")

    app = create_app()

    try:
        # Run the MCP server on port 2627 (AMCP on dial pad)
        app.run(transport="http", host="0.0.0.0", port=2627, path="/mcp", host_origin_protection=False)
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        logger.info("Ark MCP Server stopped")


if __name__ == "__main__":
    main()
