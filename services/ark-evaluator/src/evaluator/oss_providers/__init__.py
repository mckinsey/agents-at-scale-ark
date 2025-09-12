"""
OSS evaluation platform providers.
Import providers conditionally to avoid breaking if dependencies are missing.
"""

__all__ = []

try:
    from .langfuse import LangfuseProvider
    __all__.append("LangfuseProvider")
except ImportError:
    pass