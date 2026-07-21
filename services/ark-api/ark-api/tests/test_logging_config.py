"""Tests for global log redaction and LOG_LEVEL handling in core.config."""
from __future__ import annotations

import logging
import unittest
from io import StringIO
from unittest import mock

from ark_api.core.config import (
    _UVICORN_LOGGERS,
    _install_redaction_filter,
    _resolve_level,
    setup_logging,
)
from ark_api.services.mcp_auth_log_filter import SensitiveDataFilter


def _has_redaction(handler: logging.Handler) -> bool:
    return any(isinstance(f, SensitiveDataFilter) for f in handler.filters)


class TestResolveLevel(unittest.TestCase):
    def test_default_is_info_when_unset(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(_resolve_level(), logging.INFO)

    def test_debug_env(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "DEBUG"}, clear=True):
            self.assertEqual(_resolve_level(), logging.DEBUG)

    def test_case_insensitive(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "debug"}, clear=True):
            self.assertEqual(_resolve_level(), logging.DEBUG)

    def test_invalid_falls_back_to_info(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "NOPE"}, clear=True):
            self.assertEqual(_resolve_level(), logging.INFO)


class TestGlobalRedaction(unittest.TestCase):
    def setUp(self):
        # Snapshot logging state so global mutations don't leak across tests.
        self._root = logging.getLogger()
        self._root_level = self._root.level
        self._root_handlers = list(self._root.handlers)

    def tearDown(self):
        for handler in list(self._root.handlers):
            for f in list(handler.filters):
                if isinstance(f, SensitiveDataFilter):
                    handler.removeFilter(f)
            if handler not in self._root_handlers:
                self._root.removeHandler(handler)
        self._root.setLevel(self._root_level)

    def test_setup_logging_attaches_filter_to_root_handler(self):
        setup_logging()
        self.assertTrue(
            any(_has_redaction(h) for h in self._root.handlers),
            "expected SensitiveDataFilter on at least one root handler",
        )

    def test_install_is_idempotent(self):
        setup_logging()
        _install_redaction_filter()
        _install_redaction_filter()
        for handler in self._root.handlers:
            redactors = [f for f in handler.filters if isinstance(f, SensitiveDataFilter)]
            self.assertLessEqual(len(redactors), 1, "filter attached more than once")

    def test_arbitrary_logger_is_redacted_end_to_end(self):
        # A logger unrelated to the MCP auth flow must still have its credentials redacted.
        buf = StringIO()
        capture = logging.StreamHandler(buf)
        self._root.addHandler(capture)

        setup_logging()  # attaches the filter to every root handler, incl. capture

        self.assertTrue(_has_redaction(capture), "filter not attached to root handler")
        logging.getLogger("ark_api.some.unrelated.module").warning(
            "access_token=SUPER-SECRET-VALUE"
        )
        capture.flush()
        out = buf.getvalue()
        self.assertNotIn("SUPER-SECRET-VALUE", out)
        self.assertIn("[REDACTED]", out)

    def test_log_level_debug_applied(self):
        with mock.patch.dict("os.environ", {"LOG_LEVEL": "DEBUG"}, clear=True):
            setup_logging()
        self.assertEqual(self._root.level, logging.DEBUG)

    def test_uvicorn_logger_handlers_get_redaction_filter(self):
        # uvicorn owns its own handlers (request-line query strings land there),
        # so setup_logging must attach the filter to them too, not just root.
        added = []
        for name in _UVICORN_LOGGERS:
            lg = logging.getLogger(name)
            handler = logging.StreamHandler(StringIO())
            lg.addHandler(handler)
            added.append((lg, handler))
        try:
            setup_logging()
            for lg, handler in added:
                self.assertTrue(
                    _has_redaction(handler),
                    f"filter not attached to {lg.name} handler",
                )
        finally:
            for lg, handler in added:
                for f in list(handler.filters):
                    if isinstance(f, SensitiveDataFilter):
                        handler.removeFilter(f)
                lg.removeHandler(handler)


if __name__ == "__main__":
    unittest.main()
