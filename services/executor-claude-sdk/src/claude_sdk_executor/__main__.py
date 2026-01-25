#!/usr/bin/env python3
"""
Main entry point for the Claude SDK executor.

This module starts the FastAPI web server that listens for ExecutionEngine requests
and processes them using Claude Agent SDK with lifecycle hooks and critic validation.
"""

import logging
import os

from .app import app_instance

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main() -> None:
    """Main entry point."""
    # Get host and port from environment variables
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    logger.info(f"Starting Claude SDK Executor on {host}:{port}")

    # Start the web server
    app_instance.run(host=host, port=port)


if __name__ == "__main__":
    main()
