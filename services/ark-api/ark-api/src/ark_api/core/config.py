import logging
import os
from typing import Optional

from ..services.sensitive_data_filter import SensitiveDataFilter

# Loggers whose handlers should also carry the redaction filter. uvicorn
# configures its own logging (with handlers on these loggers) before importing
# the app, so their handlers already exist when setup_logging() runs at import.
_UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")


def _resolve_level(default: int = logging.INFO) -> int:
    """Resolve the log level from the LOG_LEVEL env var, falling back to INFO."""
    name = os.getenv("LOG_LEVEL", "").strip().upper()
    if not name:
        return default
    return logging.getLevelNamesMapping().get(name, default)


def _install_redaction_filter() -> None:
    """Attach SensitiveDataFilter to every handler that ark-api records reach.

    The filter is added at the *handler* level (not a single logger) so it runs
    for every record emitted through that handler, regardless of which module
    logged it. All ark-api module loggers propagate to the root handler; uvicorn
    keeps its own handlers, so we cover those too (request-line query strings).
    """
    root = logging.getLogger()
    for handler in root.handlers:
        if not any(isinstance(f, SensitiveDataFilter) for f in handler.filters):
            handler.addFilter(SensitiveDataFilter())

    # Attach at the *handler* level for uvicorn too. uvicorn configures its own
    # handlers before setup_logging() runs at import, so they already exist here;
    # scrubbing at the emitting handler covers every record that exits through it,
    # regardless of which uvicorn logger originated it.
    for name in _UVICORN_LOGGERS:
        lg = logging.getLogger(name)
        for handler in lg.handlers:
            if not any(isinstance(f, SensitiveDataFilter) for f in handler.filters):
                handler.addFilter(SensitiveDataFilter())


# Configure logging
def setup_logging(logger_name: Optional[str] = None) -> logging.Logger:
    level = _resolve_level()
    logging.basicConfig(
        format="%(levelname)s\t%(asctime)s:\t%(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    logging.getLogger().setLevel(level)

    # Quiet noisy helm command logging from pyhelm3
    logging.getLogger("pyhelm3").setLevel(logging.WARNING)

    # Redact known credentials from ALL ark-api logs (not just the MCP auth flow).
    _install_redaction_filter()

    return logging.getLogger(logger_name or "ark-api")
