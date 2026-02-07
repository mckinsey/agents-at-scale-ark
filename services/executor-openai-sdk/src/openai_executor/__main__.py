#!/usr/bin/env python3
"""Main entry point for the OpenAI Agents SDK executor."""

import logging
import os

from .app import app_instance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    app_instance.run(host=host, port=port)


if __name__ == "__main__":
    main()
