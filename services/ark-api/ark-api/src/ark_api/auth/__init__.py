"""Authentication utilities for ark-api."""

from .config import is_route_authenticated, get_public_routes

# Import middleware only when needed to avoid FastAPI dependency issues
def get_middleware():
    """Get the middleware function when needed."""
    from .middleware import add_auth_to_routes
    return add_auth_to_routes

__all__ = ["is_route_authenticated", "get_public_routes", "get_middleware"]
