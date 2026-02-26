#!/usr/bin/env python3
"""
Main entry point for the langchain executor.

This module starts the FastAPI web server that listens for ExecutionEngine requests
and processes them using LangChain, returning messages in the expected format.
"""

import logging
import os

from .app import app_instance

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    """Main entry point."""
    # Get host and port from environment variables
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    # Start the web server
    app_instance.run(host=host, port=port)


if __name__ == "__main__":
    main()
