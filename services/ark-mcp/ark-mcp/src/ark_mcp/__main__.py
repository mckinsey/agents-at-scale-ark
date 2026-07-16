"""Main entry point for the Ark MCP server."""

import logging
import sys
from .server import create_app

logger = logging.getLogger(__name__)


def setup_logging():
    """Configure logging for the application."""
    logging.basicConfig(
        level=logging.INFO,
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
        app.run(transport="http", host="0.0.0.0", port=2627, path="/mcp")
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        logger.info("Ark MCP Server stopped")


if __name__ == "__main__":
    main()