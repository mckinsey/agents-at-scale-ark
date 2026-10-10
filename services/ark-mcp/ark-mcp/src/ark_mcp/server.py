"""Ark MCP Server - Provides tools for interacting with Ark resources."""

import logging
from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from .resources import register_resources
from .tools import register_tools

logger = logging.getLogger(__name__)

# Create the MCP server
mcp = FastMCP("Ark 🏗️")

# Register resources and tools
register_resources(mcp)
register_tools(mcp)


@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> JSONResponse:
    """Liveness/readiness endpoint for Kubernetes probes."""
    return JSONResponse({"status": "ok"})


def create_app():
    """Create the MCP server application."""
    return mcp